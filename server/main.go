// Vault server: keeps your Vault items (and their files) on this machine, serves the Vault web
// app, and lets the phone app and browsers sync with it. One program, no dependencies.
//
//	VAULT_PASSWORD=... ./vault-server -addr :8080 -data ./data
//
// Put it behind HTTPS (Caddy does this in one line) before using it from outside your own network.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed all:site
var siteFiles embed.FS

var idPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,200}$`)

// Blob describes one file belonging to an item (its video, thumbnail, document...).
type Blob struct {
	Type string `json:"type"`
	Size int64  `json:"size"`
}

// Record is one item as the server keeps it.
type Record struct {
	ID      string          `json:"id"`
	Seq     int64           `json:"seq"`
	Deleted bool            `json:"deleted,omitempty"`
	Meta    json.RawMessage `json:"meta,omitempty"`
	Blobs   map[string]Blob `json:"blobs,omitempty"`
}

type Server struct {
	dir      string
	password string

	mu      sync.Mutex
	records map[string]*Record
	seq     int64

	smu      sync.Mutex
	sessions map[string]time.Time

	fmu      sync.Mutex
	failures map[string][]time.Time
}

func main() {
	addr := flag.String("addr", ":8080", "address to listen on")
	data := flag.String("data", "./data", "folder where everything is kept")
	flag.Parse()
	password := os.Getenv("VAULT_PASSWORD")
	if len(password) < 8 {
		log.Fatal("Set VAULT_PASSWORD to a password of at least 8 characters, e.g. VAULT_PASSWORD='something long' ./vault-server")
	}
	s, err := newServer(*data, password)
	if err != nil {
		log.Fatal(err)
	}
	site, _ := fs.Sub(siteFiles, "site")
	mux := http.NewServeMux()
	s.routes(mux)
	mux.Handle("/", http.FileServer(http.FS(site)))
	srv := &http.Server{Addr: *addr, Handler: cors(mux), ReadHeaderTimeout: 20 * time.Second}
	log.Printf("Vault server on %s, keeping files in %s (%d items)", *addr, *data, len(s.records))
	log.Fatal(srv.ListenAndServe())
}

func newServer(dir, password string) (*Server, error) {
	s := &Server{dir: dir, password: password, records: map[string]*Record{}, sessions: map[string]time.Time{}, failures: map[string][]time.Time{}}
	for _, sub := range []string{"meta", "blobs", "tmp"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o700); err != nil {
			return nil, err
		}
	}
	entries, err := os.ReadDir(filepath.Join(dir, "meta"))
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, "meta", e.Name()))
		if err != nil {
			continue
		}
		var r Record
		if json.Unmarshal(raw, &r) != nil || r.ID == "" {
			continue
		}
		s.records[r.ID] = &r
		if r.Seq > s.seq {
			s.seq = r.Seq
		}
	}
	if raw, err := os.ReadFile(filepath.Join(dir, "sessions.json")); err == nil {
		var m map[string]time.Time
		if json.Unmarshal(raw, &m) == nil {
			s.sessions = m
		}
	}
	// stale uploads from a previous run
	if tmp, err := os.ReadDir(filepath.Join(dir, "tmp")); err == nil {
		for _, e := range tmp {
			os.Remove(filepath.Join(dir, "tmp", e.Name()))
		}
	}
	return s, nil
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Max-Age", "86400")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ping", s.ping)
	mux.HandleFunc("/api/login", s.login)
	mux.HandleFunc("/api/logout", s.auth(s.logout))
	mux.HandleFunc("/api/changes", s.auth(s.changes))
	mux.HandleFunc("/api/item/", s.auth(s.item))
	mux.HandleFunc("/api/blob/", s.auth(s.blob))
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func (s *Server) ping(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	n := 0
	for _, rec := range s.records {
		if !rec.Deleted {
			n++
		}
	}
	seq := s.seq
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"vault": true, "seq": seq, "items": n})
}

func clientIP(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		return strings.TrimSpace(strings.Split(f, ",")[0])
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, 405, "POST only")
		return
	}
	ip := clientIP(r)
	s.fmu.Lock()
	recent := s.failures[ip][:0]
	for _, t := range s.failures[ip] {
		if time.Since(t) < 10*time.Minute {
			recent = append(recent, t)
		}
	}
	s.failures[ip] = recent
	blocked := len(recent) >= 8
	s.fmu.Unlock()
	if blocked {
		fail(w, 429, "Too many wrong passwords. Try again in 10 minutes.")
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body) != nil ||
		subtle.ConstantTimeCompare([]byte(body.Password), []byte(s.password)) != 1 {
		s.fmu.Lock()
		s.failures[ip] = append(s.failures[ip], time.Now())
		s.fmu.Unlock()
		time.Sleep(700 * time.Millisecond)
		fail(w, 401, "Wrong password")
		return
	}
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)
	s.smu.Lock()
	s.sessions[token] = time.Now()
	s.saveSessions()
	s.smu.Unlock()
	writeJSON(w, 200, map[string]string{"token": token})
}

func (s *Server) saveSessions() {
	raw, _ := json.Marshal(s.sessions)
	tmp := filepath.Join(s.dir, "sessions.json.tmp")
	if os.WriteFile(tmp, raw, 0o600) == nil {
		os.Rename(tmp, filepath.Join(s.dir, "sessions.json"))
	}
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return r.URL.Query().Get("token")
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t := bearer(r)
		s.smu.Lock()
		_, ok := s.sessions[t]
		s.smu.Unlock()
		if !ok || t == "" {
			fail(w, 401, "Sign in again")
			return
		}
		next(w, r)
	}
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	s.smu.Lock()
	delete(s.sessions, bearer(r))
	s.saveSessions()
	s.smu.Unlock()
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// changes lists what happened after ?since=N, oldest first, up to 300 at a time.
func (s *Server) changes(w http.ResponseWriter, r *http.Request) {
	since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
	s.mu.Lock()
	var out []*Record
	for _, rec := range s.records {
		if rec.Seq > since {
			out = append(out, rec)
		}
	}
	seq := s.seq
	s.mu.Unlock()
	sort.Slice(out, func(i, j int) bool { return out[i].Seq < out[j].Seq })
	more := false
	if len(out) > 300 {
		out, more = out[:300], true
	}
	if out == nil {
		out = []*Record{}
	}
	writeJSON(w, 200, map[string]any{"seq": seq, "more": more, "changes": out})
}

func (s *Server) blobPath(id, field string) string {
	return filepath.Join(s.dir, "blobs", id, field)
}

func (s *Server) item(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/item/")
	if !idPattern.MatchString(id) {
		fail(w, 400, "bad id")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var body struct {
			Meta  json.RawMessage `json:"meta"`
			Blobs map[string]Blob `json:"blobs"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 512<<20)).Decode(&body); err != nil {
			fail(w, 400, "bad item")
			return
		}
		var need []string
		for field, b := range body.Blobs {
			if !idPattern.MatchString(field) {
				fail(w, 400, "bad field")
				return
			}
			st, err := os.Stat(s.blobPath(id, field))
			if err != nil || st.Size() != b.Size {
				need = append(need, field)
			}
		}
		if len(need) > 0 {
			sort.Strings(need)
			writeJSON(w, 409, map[string]any{"need": need})
			return
		}
		s.mu.Lock()
		s.seq++
		rec := &Record{ID: id, Seq: s.seq, Meta: body.Meta, Blobs: body.Blobs}
		old := s.records[id]
		if err := s.saveRecord(rec); err != nil {
			s.seq--
			s.mu.Unlock()
			fail(w, 500, err.Error())
			return
		}
		s.records[id] = rec
		s.mu.Unlock()
		// files this item no longer has
		if old != nil {
			for f := range old.Blobs {
				if _, keep := body.Blobs[f]; !keep {
					os.Remove(s.blobPath(id, f))
				}
			}
		}
		writeJSON(w, 200, map[string]int64{"seq": rec.Seq})
	case http.MethodDelete:
		s.mu.Lock()
		s.seq++
		rec := &Record{ID: id, Seq: s.seq, Deleted: true}
		if err := s.saveRecord(rec); err != nil {
			s.seq--
			s.mu.Unlock()
			fail(w, 500, err.Error())
			return
		}
		s.records[id] = rec
		s.mu.Unlock()
		os.RemoveAll(filepath.Join(s.dir, "blobs", id))
		writeJSON(w, 200, map[string]int64{"seq": rec.Seq})
	default:
		fail(w, 405, "PUT or DELETE")
	}
}

func (s *Server) saveRecord(rec *Record) error {
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	tmp := filepath.Join(s.dir, "tmp", "meta-"+rec.ID+".tmp")
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(s.dir, "meta", rec.ID+".json"))
}

func (s *Server) blob(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/blob/"), "/")
	if len(parts) != 2 || !idPattern.MatchString(parts[0]) || !idPattern.MatchString(parts[1]) {
		fail(w, 400, "bad path")
		return
	}
	id, field := parts[0], parts[1]
	switch r.Method {
	case http.MethodPut:
		if err := os.MkdirAll(filepath.Join(s.dir, "blobs", id), 0o700); err != nil {
			fail(w, 500, err.Error())
			return
		}
		tmp, err := os.CreateTemp(filepath.Join(s.dir, "tmp"), "up-*")
		if err != nil {
			fail(w, 500, err.Error())
			return
		}
		n, err := io.Copy(tmp, r.Body)
		tmp.Close()
		if err != nil {
			os.Remove(tmp.Name())
			fail(w, 400, "upload interrupted")
			return
		}
		if err := os.Rename(tmp.Name(), s.blobPath(id, field)); err != nil {
			os.Remove(tmp.Name())
			fail(w, 500, err.Error())
			return
		}
		writeJSON(w, 200, map[string]int64{"size": n})
	case http.MethodGet, http.MethodHead:
		s.mu.Lock()
		rec := s.records[id]
		var typ string
		if rec != nil && !rec.Deleted {
			typ = rec.Blobs[field].Type
		}
		s.mu.Unlock()
		f, err := os.Open(s.blobPath(id, field))
		if err != nil {
			fail(w, 404, "not found")
			return
		}
		defer f.Close()
		st, _ := f.Stat()
		if typ == "" {
			typ = "application/octet-stream"
		}
		w.Header().Set("Content-Type", typ)
		w.Header().Set("Cache-Control", "private, max-age=3600")
		http.ServeContent(w, r, "", st.ModTime(), f)
	default:
		fail(w, 405, "GET or PUT")
	}
}

var _ = errors.New
var _ = fmt.Sprintf
