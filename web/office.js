/* Vault: Word, Excel, Samsung Notes and OneDrive. Kept to read, not to edit. */
(() => {
  "use strict";
  const V = window.Vault, $ = V.$, I = V.I, esc = V.esc, nf = V.nf;
  const sortBy = { word: "recent", excel: "recent", notes: "all", od: "list" };
  const q = { word: "", excel: "", notes: "", onedrive: "" };
  const matches = (it, query) => !query || [it.title, it.name, it.head, it.text, (it.peek || []).flat().join(" ")].join(" ").toLowerCase().includes(query.toLowerCase());
  const search = (section, label) => '<label class="of-search">' + I.search + '<input data-q="' + section + '" type="search" placeholder="' + label + '" value="' + esc(q[section]) + '"></label>';
  const sorted = (l, how) => [...l].sort((a, b) => how === "name" ? (a.title || a.name).localeCompare(b.title || b.name) : b.addedAt - a.addedAt);
  const bar = (label, segs, cur, key) => '<div class="of-bar"><h2>' + label + '</h2><div class="seg" role="group">' +
    segs.map(([id, l]) => '<button data-seg="' + key + ":" + id + '" aria-pressed="' + (cur === id) + '">' + l + "</button>").join("") + "</div></div>";
  const top = (title, addLabel, section) => '<div class="topbar"><button class="back" data-home aria-label="Back to Vault">' + I.back + '</button><div class="title">' + title +
    '</div><div class="acts"><button class="act" data-add="' + section + '" aria-label="' + addLabel + '">' + I.plus + "</button></div></div>";
  const exNote = (section, what) => '<div class="of-empty">These are examples, so you can see how it looks. Share ' + what + ' to Vault, or<br><button data-add="' + section + '" style="background:var(--brand)">Add your first</button></div>';
  function wire(el, section, open, listHTML) {
    el.onclick = (e) => {
      const t = e.target.closest("[data-add], [data-seg], [data-open], [data-od]");
      if (!t) return;
      if (t.dataset.add) V.addSheet([], t.dataset.add);
      else if (t.dataset.seg) { const [k, v] = t.dataset.seg.split(":"); sortBy[k] = v; V.render(); }
      else if (t.dataset.open) open(t.dataset.open, t);
      else if ("od" in t.dataset && V.android) V.android.openOneDrive();
    };
    // Search narrows the list as you type, without redrawing the rest of the page.
    el.oninput = (e) => {
      const inp = e.target.closest("[data-q]");
      if (!inp) return;
      q[inp.dataset.q] = inp.value;
      const box = $("#list-" + section, el);
      if (box) box.innerHTML = listHTML();
    };
  }
  function openStored(it, accent, where, from, theme) {
    const r = V.openFile(it, accent, { from, theme });
    r.acts.innerHTML = '<button aria-label="Delete">' + I.trash + "</button>";
    r.acts.onclick = () => V.askDelete(it, where, () => V.closeLayer(r.el));
    return r;
  }
  const words = (t) => (String(t).match(/\S+/g) || []).length;
  // the brand art, shared by the home door and the section's header
  const ART = {
    word: "<i></i><i></i><i></i>", excel: "<i></i><i></i><i></i>", od: "<i><b></b></i><i><b></b></i>", notes: "<i></i><i></i>",
  };
  const art = (k) => '<span class="art-box fx-' + k + '" aria-hidden="true">' + ART[k] + "</span>";

  // ================= Word =================
  const WORD_EX = [
    { title: "Lease agreement, 14 Ridge Road", head: "Residential Lease Agreement", text: "This agreement is made between the landlord and the tenant for the property at 14 Ridge Road. The lease runs for twelve months from the first of March. Rent is payable monthly in advance on or before the first day of each month.", words: 2140 },
    { title: "CV 2026", head: "Ahmed Samad", text: "Profile. Detail-minded builder of tools and systems. Experience with Android, camera systems and automation. Skills: Kotlin, Python, networking, video streaming.", words: 610 },
    { title: "Trip plan, Garden Route", head: "Garden Route, five days", text: "Day one: Mossel Bay to Wilderness, stop at the Map of Africa viewpoint. Day two: Knysna Heads and the forest walk. Day three: Plettenberg Bay and Robberg.", words: 880 },
  ].map((d, i) => ({ ...d, id: "ex-word-" + i, example: true, section: "word", kind: "doc", name: d.title + ".docx", addedAt: Date.now() - (i + 1) * 86400000 * 4 }));
  const docs = () => { const r = V.of("word"); return r.length ? r : WORD_EX; };
  V.register({
    id: "word", name: "Word", view: "word",
    door() {
      const n = V.of("word").length;
      return '<button class="mini mini-word" data-door="word" aria-label="Open Word documents"><span class="mini-name">Word</span><span class="mini-count">' + V.count(n, "document", "documents") +
        "</span>" + art("word") + "</button>";
    },
    render(el) {
      const n = V.of("word").length;
      const listHTML = () => {
        const list = sorted(docs(), sortBy.word).filter((d) => matches(d, q.word));
        if (!list.length) return '<div class="of-empty">No documents match.</div>';
        return '<div class="pages">' + list.map((d) => '<button class="pagecard" data-open="' + esc(d.id) + '"><span class="pg"><span class="typebadge" style="background:var(--word-blue)">' + esc((V.ext(d.name) || "doc").toUpperCase()) + '</span><div class="ph">' + esc(d.head || d.title) +
          '</div><div class="pt">' + esc((d.text || "").slice(0, 520)) + '</div></span><span class="nm">' + esc(d.title) + (d.example ? " (example)" : "") + '</span><span class="mt">' +
          (d.words ? nf.format(d.words) + " words, about " + Math.max(1, Math.round(d.words / 230)) + " min, " : "") + V.date(d.addedAt) + "</span></button>").join("") + "</div>";
      };
      el.innerHTML = '<div class="inner" style="--brand:#1f5ff0">' + top("Word", "Add documents", "word") +
        '<div class="of-hero hero-word">' + art("word") + "<h1>Documents</h1>" + '<p>Word documents kept to read, on this device.</p></div>' +
        search("word", "Search documents") +
        bar(nf.format(n) + (n === 1 ? " document" : " documents"), [["recent", "Recent"], ["name", "Name"]], sortBy.word, "word") +
        (n ? "" : exNote("word", "a document from Word, email or your files")) +
        '<div id="list-word">' + listHTML() + "</div></div>";
      wire(el, "word", (id, from) => {
        const d = docs().find((x) => x.id === id);
        if (!d) return;
        if (d.example) {
          const r = V.reader(d.title, "Example", "#185abd", { from, theme: "word" });
          r.body.innerHTML = '<article class="docpage"><h1>' + esc(d.head) + "</h1><p>" + esc(d.text) + "</p><p>" + esc(d.text) + "</p></article>";
          return;
        }
        openStored(d, "#3a7bff", "Word", from, "word");
      }, listHTML);
    },
  });
  V.dest({ id: "word", name: "Word", sub: "Documents", cls: "d-word", section: "word",
    accepts: (f) => f.every((x) => ["docx", "doc", "rtf", "odt", "dotx"].includes(V.ext(x.name))) ? 10 : 0,
    async import(files, el, progress) {
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i], e = V.ext(f.name);
        const text = e === "docx" || e === "dotx" ? await V.docxText(f) : "";
        const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
        await V.save({ id: V.uid(), section: "word", kind: "doc", name: f.name, title: V.base(f.name), head: (lines[0] || V.base(f.name)).slice(0, 90),
          text: lines.slice(1).join(" ").slice(0, 700), words: words(text), blob: f, addedAt: Date.now() });
        added++; progress((i + 1) / files.length);
      }
      return { added, msg: "Added " + added + (added === 1 ? " document" : " documents") + " to Word" };
    } });

  // ================= Excel =================
  const EXCEL_EX = [
    { title: "Budget 2026", sheets: ["Monthly", "Savings", "Car"], peek: [["Item", "Jan", "Feb", "Mar"], ["Rent", "8,500", "8,500", "8,500"], ["Groceries", "3,120", "2,980", "3,340"], ["Fuel", "1,450", "1,610", "1,380"], ["Data", "399", "399", "399"]] },
    { title: "Camera stream log", sheets: ["Front", "Garage"], peek: [["Camera", "Bitrate", "FPS", "Drops"], ["Front 1", "4,096", "25", "0"], ["Front 2", "2,048", "20", "3"], ["Gate", "1,024", "15", "1"], ["Garage", "2,048", "20", "0"]] },
  ].map((b, i) => ({ ...b, id: "ex-xl-" + i, example: true, section: "excel", kind: "book", name: b.title + ".xlsx", addedAt: Date.now() - (i + 1) * 86400000 * 6 }));
  const books = () => { const r = V.of("excel"); return r.length ? r : EXCEL_EX; };
  function miniSheet(peek) {
    const cols = 4, rows = 5;
    let h = '<div class="mini-sheet" style="grid-template-columns:28px repeat(' + cols + ',1fr)"><span class="h"></span>';
    for (let c = 0; c < cols; c++) h += '<span class="h">' + String.fromCharCode(65 + c) + "</span>";
    for (let r = 0; r < rows; r++) {
      h += '<span class="h">' + (r + 1) + "</span>";
      for (let c = 0; c < cols; c++) h += "<span" + (r === 1 && c === 1 ? ' class="sel"' : "") + (r === 0 ? ' style="font-weight:600"' : "") + ">" + esc(((peek || [])[r] || [])[c] || "") + "</span>";
    }
    return h + "</div>";
  }
  V.register({
    id: "excel", name: "Excel", view: "excel",
    door() {
      const n = V.of("excel").length;
      return '<button class="mini mini-excel" data-door="excel" aria-label="Open Excel workbooks"><span class="mini-name">Excel</span><span class="mini-count">' + V.count(n, "workbook", "workbooks") +
        "</span>" + art("excel") + "</button>";
    },
    render(el) {
      const n = V.of("excel").length;
      const listHTML = () => {
        const list = sorted(books(), sortBy.excel).filter((b) => matches(b, q.excel));
        if (!list.length) return '<div class="of-empty">No workbooks match.</div>';
        return '<div class="books">' + list.map((b) => '<button class="book" data-open="' + esc(b.id) + '">' + miniSheet(b.peek) + '<span class="bt"><b>' + esc(b.title) + (b.example ? " (example)" : "") + "</b><span>" +
          (b.sheets && b.sheets.length ? b.sheets.length + (b.sheets.length === 1 ? " sheet" : " sheets") + ", " : "") + V.date(b.addedAt) + "</span></span></button>").join("") + "</div>";
      };
      el.innerHTML = '<div class="inner" style="--brand:#16a34a">' + top("Excel", "Add workbooks", "excel") +
        '<div class="of-hero hero-excel">' + art("excel") + "<h1>Workbooks</h1>" + '<p>Spreadsheets kept to read, on this device.</p></div>' +
        search("excel", "Search workbooks and cells") +
        bar(nf.format(n) + (n === 1 ? " workbook" : " workbooks"), [["recent", "Recent"], ["name", "Name"]], sortBy.excel, "excel") +
        (n ? "" : exNote("excel", "a spreadsheet from Excel, email or your files")) +
        '<div id="list-excel">' + listHTML() + "</div></div>";
      wire(el, "excel", async (id, from) => {
        const b = books().find((x) => x.id === id);
        if (!b) return;
        if (b.example) {
          const XLSX = await V.lib("xlsx");
          const wb = XLSX.utils.book_new();
          b.sheets.forEach((s, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(i === 0 ? b.peek : [["Example sheet"], ["Add your own workbook to see it here"]]), s));
          const blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })]);
          const r = V.reader(b.title, "Example", "#107c41", { from, theme: "excel" });
          V.showSheet(blob, r.el, r.body);
          return;
        }
        openStored(b, "#22c55e", "Excel", from, "excel");
      }, listHTML);
    },
  });
  V.dest({ id: "excel", name: "Excel", sub: "Workbooks", cls: "d-excel", section: "excel",
    accepts: (f) => f.every((x) => ["xlsx", "xls", "xlsm", "csv", "ods"].includes(V.ext(x.name))) ? 10 : 0,
    async import(files, el, progress) {
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const p = await V.sheetPeek(f);
        await V.save({ id: V.uid(), section: "excel", kind: "book", name: f.name, title: V.base(f.name), sheets: p.sheets, peek: p.peek, blob: f, addedAt: Date.now() });
        added++; progress((i + 1) / files.length);
      }
      return { added, msg: "Added " + added + (added === 1 ? " workbook" : " workbooks") + " to Excel" };
    } });

  // ================= Samsung Notes =================
  const NOTES_EX = [
    { title: "Shopping", kind: "text", text: "Milk\nBread\nEggs\nChicken thighs\nRice\nCoffee beans\nBatteries for the gate remote" },
    { title: "Ideas", kind: "text", text: "Vault: add WhatsApp section\nCamera wall: night profile\nCheck the garage camera bitrate" },
    { title: "Passwords to change", kind: "text", text: "Router admin\nCamera NVR\nOld email" },
  ].map((n, i) => ({ ...n, id: "ex-note-" + i, example: true, section: "notes", name: n.title + ".txt", addedAt: Date.now() - (i + 1) * 86400000 * 2 }));
  const notes = () => { const r = V.of("notes"); return r.length ? r : NOTES_EX; };
  const NOTE_KIND = (name, type) => {
    const e = V.ext(name);
    if (["sdoc", "sdocx", "spd", "snb"].includes(e)) return "samsung";
    if (e === "pdf" || type === "application/pdf") return "pdf";
    if (/^image\//.test(type) || ["jpg", "jpeg", "png", "webp", "heic"].includes(e)) return "picture";
    if (["docx", "doc"].includes(e)) return "word";
    if (/^text\//.test(type) || ["txt", "md"].includes(e)) return "text";
    return "file";
  };
  V.register({
    id: "notes", name: "Samsung Notes", view: "notes",
    door() {
      const n = V.of("notes").length;
      return '<button class="mini mini-notes" data-door="notes" aria-label="Open Samsung Notes"><span class="mini-name">Samsung<br>Notes</span><span class="mini-count">' + V.count(n, "note", "notes") +
        "</span>" + art("notes") + "</button>";
    },
    render(el) {
      const f = sortBy.notes, count = V.of("notes").length;
      const listHTML = () => {
        let list = sorted(notes(), "recent").filter((n) => matches(n, q.notes));
        if (f === "pdf") list = list.filter((n) => n.kind === "pdf");
        if (f === "text") list = list.filter((n) => n.kind === "text" || n.kind === "word");
        if (f === "picture") list = list.filter((n) => n.kind === "picture");
        if (!list.length) return '<div class="of-empty">No notes match.</div>';
        return '<div class="notes">' + list.map((n) => {
          let cover;
          if (n.kind === "text" || n.kind === "word") cover = '<span class="cover text">' + esc((n.text || "").slice(0, 300)) + "</span>";
          else if (n.thumb || n.thumbData) cover = '<span class="cover" style="background-image:url(' + V.thumbURL(n) + ')"></span>';
          else cover = '<span class="cover text" style="display:grid;place-items:center;color:var(--notes-deep);font-weight:700">' + (n.kind === "samsung" ? "Samsung Notes file" : esc((V.ext(n.name) || "file").toUpperCase())) + "</span>";
          const label = { pdf: "PDF" + (n.pages ? ", " + n.pages + (n.pages === 1 ? " page" : " pages") : ""), text: "Text", word: "Word", picture: "Picture", samsung: "Samsung Notes", file: "File" }[n.kind];
          return '<button class="notecard" data-open="' + esc(n.id) + '">' + cover + '<span class="nt"><b>' + esc(n.title) + (n.example ? " (example)" : "") + "</b><span>" + label + ", " + V.date(n.addedAt) + "</span></span></button>";
        }).join("") + "</div>";
      };
      el.innerHTML = '<div class="inner sec-notes" style="--brand:#f0443a">' + top("Samsung Notes", "Add notes", "notes") +
        '<div class="of-hero hero-notes">' + art("notes") + "<h1>All notes</h1>" + '<p>Notes shared out of Samsung Notes, kept here.</p></div>' +
        search("notes", "Search notes") +
        bar(nf.format(count) + (count === 1 ? " note" : " notes"), [["all", "All"], ["pdf", "PDF"], ["text", "Text"], ["picture", "Pictures"]], f, "notes") +
        (count ? "" : exNote("notes", "a note from Samsung Notes (⋮, Share, then PDF, Word, image or text)")) +
        '<div id="list-notes">' + listHTML() + "</div></div>";
      wire(el, "notes", (id, from) => {
        const n = notes().find((x) => x.id === id);
        if (!n) return;
        if (n.example) { const r = V.reader(n.title, "Example", "#f0623a", { from, theme: "notes" }); r.body.innerHTML = '<div class="textnote"></div>'; $(".textnote", r.body).textContent = n.text; return; }
        if (n.kind === "samsung") {
          const r = V.reader(n.title, V.size(n.blob && n.blob.size), "#f0623a", { from, theme: "notes" });
          r.body.innerHTML = '<div class="cant"><b>Samsung Notes file</b>Vault keeps it safe. ' + (V.android ? "Tap Open to view it in Samsung Notes." : "Open it on your phone in Samsung Notes.") + "</div>";
          if (V.android && V.android.openWith) r.acts.innerHTML = '<button aria-label="Open in Samsung Notes">' + I.open + "</button>", r.acts.onclick = () => V.android.openWith(n);
          return;
        }
        openStored(n, "#ff8a3d", "Samsung Notes", from, "notes");
      }, listHTML);
    },
  });
  V.dest({ id: "notes", name: "Samsung Notes", sub: "Notes", cls: "d-notes", section: "notes",
    accepts: (f) => f.some((x) => NOTE_KIND(x.name, x.type) === "samsung") ? 10 : f.every((x) => ["pdf", "text"].includes(NOTE_KIND(x.name, x.type))) ? 4 : 0,
    async import(files, el, progress) {
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i], kind = NOTE_KIND(f.name, f.type);
        const it = { id: V.uid(), section: "notes", kind, name: f.name, title: V.base(f.name), blob: f, addedAt: Date.now() };
        if (kind === "pdf") { const c = await V.pdfCover(f); it.thumb = c.thumb; it.pages = c.pages; it.text = c.text; }
        else if (kind === "picture") { const t = await V.thumbnail(f, "image", 480); it.thumb = t.thumb; }
        else if (kind === "text") it.text = (await f.text()).slice(0, 2000);
        else if (kind === "word") it.text = (await V.docxText(f)).slice(0, 2000);
        await V.save(it); added++; progress((i + 1) / files.length);
      }
      return { added, msg: "Added " + added + (added === 1 ? " note" : " notes") + " to Samsung Notes" };
    } });

  // ================= OneDrive =================
  const OD_URL = "https://onedrive.live.com/";
  const FILECOL = { pdf: "#e2574c", docx: "#185abd", doc: "#185abd", xlsx: "#107c41", xls: "#107c41", csv: "#107c41", pptx: "#c43e1c", txt: "#5f6b73", zip: "#6d6d6d" };
  V.register({
    id: "onedrive", name: "OneDrive", view: "od",
    door() {
      const n = V.of("onedrive").length;
      return '<button class="mini mini-od" data-door="onedrive" aria-label="Open OneDrive"><span class="mini-name">OneDrive</span><span class="mini-count">' + (n ? V.count(n, "file saved", "files saved") : "Your cloud") +
        "</span>" + art("od") + "</button>";
    },
    render(el) {
      const all = sorted(V.of("onedrive"), "recent");
      const inApp = V.android && V.android.openOneDrive;
      const tiles = sortBy.od === "tiles";
      const icon = (f) => {
        const e = V.ext(f.name);
        return f.thumb ? '<span class="fileico" style="background-image:url(' + V.thumbURL(f) + ')"></span>'
          : '<span class="fileico" style="background:linear-gradient(150deg,' + (FILECOL[e] || "#0078d4") + "," + shade(FILECOL[e] || "#0364b8") + ')">' + esc((e || "file").toUpperCase().slice(0, 4)) + "</span>";
      };
      const listHTML = () => {
        const files = all.filter((f) => matches(f, q.onedrive));
        if (!all.length) return '<div class="of-empty">Nothing saved yet. Files you download in your OneDrive (in the Vault app), or add here, are kept on this device.</div>';
        if (!files.length) return '<div class="of-empty">No files match.</div>';
        const day = 86400000, now = Date.now();
        const groups = [["Today", (f) => now - f.addedAt < day], ["This week", (f) => now - f.addedAt < 7 * day], ["Earlier", () => true]];
        const seen = new Set();
        return groups.map(([label, test]) => {
          const g = files.filter((f) => !seen.has(f.id) && test(f));
          g.forEach((f) => seen.add(f.id));
          if (!g.length) return "";
          return '<div class="of-group">' + label + '</div><div class="files' + (tiles ? " tiles" : "") + '">' + g.map((f) =>
            '<button class="filerow" data-open="' + esc(f.id) + '">' + icon(f) + '<span style="min-width:0"><div class="n">' + esc(f.name) + '</div><div class="m">' + V.size(f.blob && f.blob.size) + ", " + V.date(f.addedAt) + "</div></span>" + I.chev + "</button>").join("") + "</div>";
        }).join("");
      };
      el.innerHTML = '<div class="inner" style="--brand:#1677f2">' + top("OneDrive", "Add files", "onedrive") +
        '<div class="of-hero hero-od">' + art("od") + "<h1>OneDrive</h1><p>" +
        (inApp ? "Your OneDrive, signed in, right here. Files you save from it are kept in Vault." : "Opens your real OneDrive. In the Vault app it opens inside Vault; here it opens in a new tab.") + "</p>" +
        (inApp ? '<button class="od-open" data-od>' + I.cloud + "Open my OneDrive</button>" : '<a class="od-open" href="' + OD_URL + '" target="_blank" rel="noopener">' + I.cloud + "Open my OneDrive</a>") + "</div>" +
        search("onedrive", "Search saved files") +
        bar("Saved from OneDrive", [["list", "List"], ["tiles", "Tiles"]], sortBy.od, "od") +
        '<div id="list-onedrive">' + listHTML() + "</div></div>";
      wire(el, "onedrive", (id, from) => openStored(V.items.find((x) => x.id === id), "#46b7ff", "OneDrive", from, "od"), listHTML);
    },
  });
  // a deeper tone of a colour, for the file tiles' gradient
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16), k = .72;
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, "0")).join("");
  }
  V.dest({ id: "onedrive", name: "OneDrive", sub: "Saved files", cls: "d-onedrive", section: "onedrive", accepts: () => 1,
    async import(files, el, progress) {
      let added = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const it = { id: V.uid(), section: "onedrive", kind: "file", name: f.name || "file", title: V.base(f.name), blob: f, addedAt: Date.now() };
        if (/^image\//.test(f.type)) { const t = await V.thumbnail(f, "image", 200); it.thumb = t.thumb; }
        await V.save(it); added++; progress((i + 1) / files.length);
      }
      return { added, msg: "Added " + added + (added === 1 ? " file" : " files") + " to OneDrive" };
    } });
})();
