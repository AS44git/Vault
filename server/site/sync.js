/* Vault sync: keeps this device's items in step with your Vault server (phone app and browsers alike).
   Everything a device saves is sent to the server; everything the server has is fetched here.
   Without a server set up, none of this runs and Vault stays on the device, as before. */
(function () {
  const V = window.Vault;
  if (!V || !V.store) return;
  const KEY = "vault.sync";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* private mode */ } };
  const cfg = Object.assign({ server: "", token: "", seq: 0, pending: {} }, load());
  let state = "off";            // off | idle | busy | offline | login
  let note = "";
  let busy = 0;
  const mine = new Set();       // sequence numbers this device wrote, so it doesn't fetch its own changes back

  // ---------- turning an item into JSON plus files, and back ----------
  function split(item) {
    const meta = {}, blobs = {}, files = {}, buffers = [];
    for (const [k, v] of Object.entries(item)) {
      if (v instanceof Blob) {
        blobs[k] = v;
        if (typeof File !== "undefined" && v instanceof File) files[k] = { name: v.name, modified: v.lastModified };
      } else if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
        blobs[k] = new Blob([v], { type: "application/octet-stream" });
        buffers.push(k);
      } else if (v !== undefined) meta[k] = v;
    }
    if (buffers.length) meta.__buffers = buffers;
    if (Object.keys(files).length) meta.__files = files;
    return { meta, blobs };
  }
  const safeField = (k) => /^[A-Za-z0-9._-]{1,200}$/.test(k);

  // ---------- talking to the server ----------
  async function api(path, opts = {}) {
    const res = await fetch(cfg.server + path, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: "Bearer " + cfg.token }, opts.headers || {}),
    }));
    if (res.status === 401 && path !== "/api/login") { cfg.token = ""; save(); setState("login", "Sign in again"); throw new Error("signed out"); }
    return res;
  }

  async function login(server, password) {
    server = server.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(server)) server = "https://" + server;
    const res = await fetch(server + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    let body = {};
    try { body = await res.json(); } catch (e) { /* not our server */ }
    if (!res.ok || !body.token) throw new Error(body.error || "That didn't answer like a Vault server");
    const first = server !== cfg.server;
    cfg.server = server; cfg.token = body.token;
    if (first) cfg.seq = 0;
    save();
  }

  async function pushOne(id, op) {
    if (op === "del") {
      const r = await api("/api/item/" + encodeURIComponent(id), { method: "DELETE" });
      if (!r.ok) throw new Error("delete " + r.status);
      mine.add((await r.json()).seq);
      return;
    }
    const item = V.items.find((x) => x.id === id);
    if (!item) return;                    // gone meanwhile
    const { meta, blobs } = split(item);
    for (const k of Object.keys(blobs)) if (!safeField(k)) throw new Error("odd field " + k);
    const desc = {};
    for (const [k, b] of Object.entries(blobs)) desc[k] = { type: b.type || "application/octet-stream", size: b.size };
    for (let round = 0; round < 3; round++) {
      const r = await api("/api/item/" + encodeURIComponent(id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meta, blobs: desc }) });
      if (r.ok) { mine.add((await r.json()).seq); return; }
      if (r.status !== 409) throw new Error("save " + r.status);
      const { need } = await r.json();
      for (const f of need) {
        const u = await api("/api/blob/" + encodeURIComponent(id) + "/" + encodeURIComponent(f), { method: "PUT", body: blobs[f] });
        if (!u.ok) throw new Error("upload " + u.status);
      }
    }
    throw new Error("couldn't finish saving " + id);
  }

  let pushing = false;
  async function pushAll() {
    if (pushing || !cfg.token) return;
    pushing = true;
    try {
      let ids;
      while ((ids = Object.keys(cfg.pending)).length) {
        setState("busy", "Sending " + ids.length + "…");
        const id = ids[0], op = cfg.pending[id];
        try { await pushOne(id, op); } catch (e) {
          if (String(e.message) === "signed out") return;
          throw e;
        }
        if (cfg.pending[id] === op) delete cfg.pending[id];
        save();
      }
    } finally { pushing = false; }
  }

  const fetchBlob = async (id, f, type) => {
    const r = await api("/api/blob/" + encodeURIComponent(id) + "/" + encodeURIComponent(f));
    if (!r.ok) throw new Error("download " + r.status);
    const b = await r.blob();
    return new Blob([b], { type: type || b.type });
  };

  async function build(ch) {
    const old = V.items.find((x) => x.id === ch.id);
    const item = Object.assign({}, ch.meta);
    const buffers = item.__buffers || [], files = item.__files || {};
    delete item.__buffers; delete item.__files;
    for (const [f, d] of Object.entries(ch.blobs || {})) {
      let b = old && old[f] instanceof Blob && old[f].size === d.size ? old[f] : null;
      if (!b && old && old[f] && old[f].byteLength === d.size) b = new Blob([old[f]]);
      if (!b) b = await fetchBlob(ch.id, f, d.type);
      if (buffers.includes(f)) item[f] = await b.arrayBuffer();
      else if (files[f] && typeof File !== "undefined") item[f] = new File([b], files[f].name, { type: d.type, lastModified: files[f].modified });
      else item[f] = b;
    }
    return item;
  }

  let pulling = false;
  async function pull() {
    if (pulling || !cfg.token) return;
    pulling = true;
    try {
      const firstTime = cfg.seq === 0;
      const onServer = new Set();
      for (;;) {
        const r = await api("/api/changes?since=" + cfg.seq);
        if (!r.ok) throw new Error("changes " + r.status);
        const data = await r.json();
        let n = 0;
        for (const ch of data.changes) {
          n++;
          onServer.add(ch.id);
          setState("busy", "Getting " + n + " of " + data.changes.length + "…");
          if (!mine.has(ch.seq) && !cfg.pending[ch.id]) {
            if (ch.deleted) {
              if (V.items.some((x) => x.id === ch.id)) { await rawRemove(ch.id); }
            } else {
              const item = await build(ch);
              await rawPut(item);
            }
            V.render();
          }
          cfg.seq = Math.max(cfg.seq, ch.seq);
        }
        save();
        if (!data.more) { cfg.seq = Math.max(cfg.seq, data.seq); save(); break; }
      }
      if (firstTime) {
        // first time on this server: whatever this device has that the server doesn't goes up
        for (const it of V.items) if (!onServer.has(it.id) && !cfg.pending[it.id]) cfg.pending[it.id] = "put";
        save();
      }
    } finally { pulling = false; }
  }

  // ---------- changing this device's store without sending it back ----------
  const orig = { put: V.store.put, putMany: V.store.putMany, remove: V.store.remove };
  async function rawPut(item) {
    await orig.put(item);
    V.forget(item.id);
    const i = V.items.findIndex((x) => x.id === item.id);
    if (!V.sections[item.section]) return;
    if (i >= 0) V.items[i] = item; else V.items.push(item);
  }
  async function rawRemove(id) {
    await orig.remove(id);
    V.forget(id);
    V.items = V.items.filter((x) => x.id !== id);
  }

  // ---------- noticing what this device saves and deletes ----------
  const queue = (id, op) => { if (!cfg.token) return; cfg.pending[id] = op; save(); schedule(); };
  V.store.put = async function (item) { await orig.put.call(V.store, item); queue(item.id, "put"); };
  V.store.putMany = async function (list) { await orig.putMany.call(V.store, list); list.forEach((i) => queue(i.id, "put")); };
  V.store.remove = async function (id) { await orig.remove.call(V.store, id); queue(id, "del"); };

  // ---------- the loop ----------
  let timer = null;
  function schedule(ms = 600) { clearTimeout(timer); timer = setTimeout(cycle, ms); }
  async function cycle() {
    if (!cfg.token) return;
    busy++;
    try {
      await pull();
      await pushAll();
      setState("idle", "Up to date");
    } catch (e) {
      if (String(e.message) !== "signed out") setState("offline", navigator.onLine === false ? "No connection" : "Couldn't reach the server");
    } finally { busy--; }
    clearTimeout(timer);
    timer = setTimeout(cycle, state === "offline" ? 20000 : 15000);
  }
  V.sync = { cycle, status: () => ({ state, note, server: cfg.server, pending: Object.keys(cfg.pending).length }) };
  addEventListener("online", () => schedule(300));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(300); });

  // ---------- the button and its sheet ----------
  let pill = null;
  function setState(s, text) {
    state = s; note = text || "";
    if (!pill) return;
    const label = { off: "Sync", idle: "Synced", busy: note || "Syncing…", offline: "Offline", login: "Sign in" }[s] || "Sync";
    pill.textContent = label;
    pill.dataset.state = s;
  }
  function openSheet() {
    const connected = !!cfg.token;
    const hosted = cfg.hosted;       // this page was served by the server itself
    V.sheet(
      "<h2>Sync</h2>" +
      (connected
        ? "<p>Connected to <b>" + V.esc(cfg.server) + "</b>.<br>" + V.esc(note || "Up to date") + (Object.keys(cfg.pending).length ? " · " + Object.keys(cfg.pending).length + " waiting to send" : "") + "</p>" +
          '<div class="actions"><button class="btn" id="syDis">Disconnect</button><button class="btn primary" id="syNow">Sync now</button></div>'
        : "<p>Keep Vault on your own server so the phone and the browser share the same things.</p>" +
          (hosted ? "" : '<input class="sy-in" id="syUrl" type="url" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="Server address, e.g. vault.example.com" value="' + V.esc(cfg.server) + '">') +
          '<input class="sy-in" id="syPw" type="password" autocomplete="current-password" placeholder="Password">' +
          '<p id="syErr" class="sy-err" hidden></p>' +
          '<div class="actions"><button class="btn" id="syNo">Cancel</button><button class="btn primary" id="syGo">Connect</button></div>'),
      (el) => {
        const $ = (s) => el.querySelector(s);
        if (connected) {
          $("#syNow").onclick = () => { V.closeSheet(); V.toast("Syncing…"); schedule(0); };
          $("#syDis").onclick = async () => {
            if (!(await V.confirm("Disconnect from the server?", "Items stay on this device. Nothing is deleted from the server.", "Disconnect"))) return;
            try { await api("/api/logout", { method: "POST" }); } catch (e) { /* already gone */ }
            cfg.token = ""; cfg.pending = {}; cfg.seq = 0; save(); setState("off"); V.toast("Disconnected");
          };
          return;
        }
        $("#syNo").onclick = V.closeSheet;
        const go = async () => {
          const err = $("#syErr"); err.hidden = true;
          const btn = $("#syGo"); btn.disabled = true; btn.textContent = "Connecting…";
          try {
            await login(hosted ? location.origin : $("#syUrl").value, $("#syPw").value);
            V.closeSheet(); V.toast("Connected"); setState("busy", "Starting…"); schedule(0);
          } catch (e) {
            err.textContent = String(e.message || e) === "Failed to fetch" ? "Couldn't reach that address. Check it and your connection." : e.message;
            err.hidden = false; btn.disabled = false; btn.textContent = "Connect";
          }
        };
        $("#syGo").onclick = go;
        $("#syPw").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      });
  }

  function mount() {
    const mast = document.querySelector(".mast");
    if (!mast) return;
    pill = document.createElement("button");
    pill.className = "sync-pill";
    pill.type = "button";
    pill.onclick = openSheet;
    mast.appendChild(pill);
    setState(cfg.token ? "idle" : "off", cfg.token ? "Starting…" : "");
  }

  // when the page is served by the server itself, the address is already known
  async function detectHosted() {
    if (!/^https?:$/.test(location.protocol) || /androidplatform\.net$/.test(location.hostname)) return;
    try {
      const r = await fetch(location.origin + "/api/ping");
      const j = await r.json();
      if (j && j.vault) { cfg.hosted = true; if (!cfg.token) cfg.server = location.origin; }
    } catch (e) { /* a plain website, not the server */ }
  }

  detectHosted().finally(() => { mount(); if (cfg.token) schedule(400); });
})();
