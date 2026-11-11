/* Vault: TikTok and Instagram reposts, each dressed as its app, with the swipe-up player. */
(() => {
  "use strict";
  const V = window.Vault, $ = V.$, I = V.I, esc = V.esc, nf = V.nf;

  // Examples until the first real one is added (marked as such everywhere they appear).
  const EXAMPLES = (() => {
    const out = [];
    const palettes = {
      tiktok: [["#1b1b3a", "#fe2c55"], ["#0e2a2a", "#25f4ee"], ["#2a1426", "#ff8a3d"], ["#101820", "#7c5cff"], ["#231a12", "#ffd166"], ["#14202a", "#3ddc97"]],
      instagram: [["#4f5bd5", "#feda75"], ["#962fbf", "#fa7e1e"], ["#d62976", "#ffd6a5"], ["#1f3c88", "#f9a8d4"], ["#5b2a86", "#ffcf56"], ["#ff5e62", "#ffc371"]],
    };
    const captions = {
      tiktok: ["Street food tour, Durban", "That bass drop", "Quick pasta, 15 minutes", "Sunset drift edit", "Gym form check", "Cat vs cucumber"],
      instagram: ["Cape Town from above", "Morning espresso pour", "Fit check", "Studio light test", "Road trip, N2", "Rooftop golden hour"],
    };
    for (const sec of ["tiktok", "instagram"]) {
      palettes[sec].forEach(([a, b], i) => {
        const c = document.createElement("canvas");
        c.width = 270; c.height = 360;
        const g = c.getContext("2d");
        const grad = g.createLinearGradient(0, 0, 270, 360);
        grad.addColorStop(0, a); grad.addColorStop(1, b);
        g.fillStyle = grad; g.fillRect(0, 0, 270, 360);
        g.globalAlpha = .18; g.fillStyle = "#fff";
        g.beginPath(); g.arc(200, 90 + i * 22, 90, 0, Math.PI * 2); g.fill();
        out.push({
          id: "ex-" + sec + "-" + i, example: true, section: sec, collection: "reposts",
          kind: i % 3 === 2 ? "image" : "video", duration: 9 + i * 7, note: captions[sec][i],
          url: "", addedAt: Date.now() - (i + 1) * 86400000 * 3, thumbData: c.toDataURL("image/jpeg", .8),
        });
      });
    }
    return out;
  })();
  const list = (sec) => { const r = V.of(sec); return r.length ? r : EXAMPLES.filter((e) => e.section === sec); };
  const real = (sec) => V.of(sec).length > 0;

  const state = { tiktok: { tab: "reposts" }, instagram: { tab: "reposts" }, order: "newest" };
  const sorted = (l) => [...l].sort((a, b) => state.order === "newest" ? b.addedAt - a.addedAt : a.addedAt - b.addedAt);
  const filterTab = (sec, l) => {
    const tab = state[sec].tab;
    if (tab === "reposts") return l;
    if (tab === "photos") return l.filter((i) => i.kind === "image");
    return l.filter((i) => i.kind === "video");
  };
  const latest = (l) => [...l].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3);

  function tile(it, sec) {
    let inner = "";
    if (sec === "tiktok") inner = it.kind === "video" ? '<span class="meta">' + I.play + V.dur(it.duration) + "</span>" : '<span class="meta">' + V.ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', 14, 2.6) + "</span>";
    else if (it.kind === "video") inner = '<span class="kind">' + V.ic('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8.5 3l3 5M14 3l3 5"/><path d="M10 11.5v5l4.5-2.5z" fill="currentColor" stroke="none"/>', 18, 2.4) + "</span>";
    if (it.example) inner += '<span class="ex">Example</span>';
    return '<button class="tile" data-open="' + esc(it.id) + '" style="background-image:url(' + V.thumbURL(it) + ')" aria-label="' + esc(it.note || (it.kind === "video" ? "Video" : "Photo")) + '">' + inner + "</button>";
  }
  const tabBtn = (id, icon, label, sel) => '<button class="tab" role="tab" data-tab="' + id + '" aria-label="' + label + '" aria-selected="' + (sel === id) + '">' + icon + "</button>";
  const emptyNote = (sec) => real(sec) ? "" : '<div class="empty-note"><span>These are examples, so you can see how it looks.</span><button data-add="' + sec + '">Add your first</button></div>';

  // ---------- TikTok ----------
  V.register({
    id: "tiktok", name: "TikTok", view: "tt", big: true,
    door() {
      const l = list("tiktok"), n = real("tiktok") ? l.length : 0, top = latest(l);
      return '<button class="door door-tt" data-door="tiktok" aria-label="Open TikTok reposts"><div><div class="door-name">TikTok</div><div class="door-sub">Reposts</div></div>' +
        '<div class="fan" aria-hidden="true">' + [0, 1, 2].map((i) => '<span style="' + (top[i] ? "background-image:url(" + V.thumbURL(top[i]) + ")" : "visibility:hidden") + '"></span>').join("") + "</div>" +
        '<div class="door-foot"><span class="door-count">' + V.count(n, "video", "videos") + '</span><span class="door-open">Open' + I.chev + "</span></div></button>";
    },
    render(el) {
      const all = list("tiktok"), r = real("tiktok");
      const videos = all.filter((i) => i.kind === "video").length, photos = all.length - videos;
      const secs = all.reduce((s, i) => s + (i.kind === "video" ? (i.duration || 0) : 0), 0);
      const tab = state.tiktok.tab;
      el.innerHTML = '<div class="inner">' +
        '<div class="topbar"><button class="back" data-home aria-label="Back to Vault">' + I.back + '</button><div class="title">Reposts</div>' +
        '<button class="act" data-add="tiktok" aria-label="Add videos">' + I.plus + "</button></div>" +
        '<div class="profile"><div class="avatar" aria-hidden="true">V</div><div class="handle">@vault.reposts</div>' +
        '<div class="stats"><div class="stat"><b>' + nf.format(r ? videos : 0) + '</b><span>Videos</span></div><div class="stat"><b>' + nf.format(r ? photos : 0) +
        '</b><span>Photos</span></div><div class="stat"><b>' + (r ? Math.round(secs / 60) : 0) + 'm</b><span>Watch time</span></div></div>' +
        '<div class="bio">Videos you reposted on TikTok, kept here.</div>' +
        '<div class="tt-buttons"><button class="tt-btn" data-add="tiktok">' + I.plus + 'Add videos</button><button class="tt-btn ghost" data-order>' + (state.order === "newest" ? "Newest" : "Oldest") + "</button></div></div>" +
        '<div class="tabs" role="tablist">' + tabBtn("reposts", V.ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 26, 2.5), "Reposts", tab) +
        tabBtn("videos", V.ic('<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>', 26, 2.4), "Videos", tab) +
        tabBtn("photos", V.ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', 26, 2.4), "Photos", tab) + "</div>" +
        emptyNote("tiktok") + '<div class="grid">' + sorted(filterTab("tiktok", all)).map((it) => tile(it, "tiktok")).join("") + "</div></div>";
      wire(el, "tiktok");
    },
  });

  // ---------- Instagram ----------
  V.register({
    id: "instagram", name: "Instagram", view: "ig", big: true,
    door() {
      const l = list("instagram"), n = real("instagram") ? l.length : 0, top = latest(l);
      return '<button class="door door-ig" data-door="instagram" aria-label="Open Instagram"><div><div class="door-name">Instagram</div><div class="door-sub">Reposts</div></div>' +
        '<div class="row3" aria-hidden="true">' + [0, 1, 2].map((i) => '<span style="' + (top[i] ? "background-image:url(" + V.thumbURL(top[i]) + ")" : "visibility:hidden") + '"></span>').join("") + "</div>" +
        '<div class="door-foot"><span class="door-count">' + V.count(n, "post", "posts") + '</span><span class="door-open">Open' + I.chev + "</span></div></button>";
    },
    render(el) {
      const all = list("instagram"), r = real("instagram");
      const videos = all.filter((i) => i.kind === "video").length;
      const tab = state.instagram.tab;
      el.innerHTML = '<div class="inner">' +
        '<div class="topbar"><button class="back" data-home aria-label="Back to Vault">' + I.back + '</button><div class="title">vault.reposts</div>' +
        '<div class="acts"><button class="act" data-add="instagram" aria-label="Add posts">' + V.ic('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>', 26, 2.3) + "</button></div></div>" +
        '<div class="ig-head"><div class="ig-ring"><div>' + V.ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 30, 2.5) + "</div></div>" +
        '<div class="ig-stats"><div><b>' + nf.format(r ? all.length : 0) + "</b><span>posts</span></div><div><b>" + nf.format(r ? videos : 0) + "</b><span>reels</span></div><div><b>1</b><span>collection</span></div></div></div>" +
        '<div class="ig-name"><b>Instagram reposts</b><span>Posts and reels you reposted, kept here.</span></div>' +
        '<div class="ig-buttons"><button class="ig-btn" data-add="instagram">Add posts</button><button class="ig-btn" data-order>' + (state.order === "newest" ? "Newest first" : "Oldest first") + "</button></div>" +
        '<div class="ig-collections"><button class="ig-coll"><span><i>' + V.ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 26, 2.5) + "</i></span><span>Reposts</span></button></div>" +
        '<div class="tabs" role="tablist">' + tabBtn("reposts", V.ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 26, 2.5), "Reposts", tab) +
        tabBtn("reels", V.ic('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8.5 3l3 5M14 3l3 5"/><path d="M10 11.5v5l4.5-2.5z" fill="currentColor" stroke="none"/>', 26, 2.4), "Reels", tab) +
        tabBtn("photos", V.ic('<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>', 26, 2.4), "Photos", tab) + "</div>" +
        emptyNote("instagram") + '<div class="grid">' + sorted(filterTab("instagram", all)).map((it) => tile(it, "instagram")).join("") + "</div></div>";
      wire(el, "instagram");
    },
  });

  function wire(el, sec) {
    el.onclick = (e) => {
      const t = e.target.closest("[data-open], [data-tab], [data-add], [data-order]");
      if (!t) return;
      if (t.dataset.open) openPlayer(sec, t.dataset.open);
      else if (t.dataset.tab) { state[sec].tab = t.dataset.tab; V.render(); }
      else if (t.dataset.add) V.addSheet([], t.dataset.add);
      else if ("order" in t.dataset) { state.order = state.order === "newest" ? "oldest" : "newest"; V.render(); }
    };
  }

  // ---------- adding ----------
  const isMedia = (f) => /^(video|image)\//.test(f.type) || ["mp4", "mov", "webm", "3gp", "jpg", "jpeg", "png", "webp", "gif", "heic"].includes(V.ext(f.name));
  const fields = (sec) => () =>
    '<label class="field" for="addLink">Link to the original (optional)<input id="addLink" type="url" inputmode="url" placeholder="' + (sec === "tiktok" ? "https://www.tiktok.com/@…" : "https://www.instagram.com/p/…") + '"></label>' +
    '<label class="field" for="addNote">Note (optional)<input id="addNote" type="text" placeholder="What it is, who posted it"></label>';
  async function importMedia(sec, files, el, progress) {
    const link = ($("#addLink", el) || {}).value || "", note = ($("#addNote", el) || {}).value || "";
    let added = 0, failed = 0;
    const media = files.filter(isMedia);
    failed += files.length - media.length;
    for (let i = 0; i < media.length; i++) {
      const f = media[i];
      const kind = /^image\//.test(f.type) || ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(V.ext(f.name)) ? "image" : "video";
      const t = await V.thumbnail(f, kind);
      if (!t.thumb && kind === "image") { failed++; continue; }
      await V.save({ id: V.uid(), section: sec, collection: "reposts", kind, blob: f, thumb: t.thumb, duration: t.duration, w: t.w, h: t.h,
        name: f.name || "", note: note.trim(), url: media.length === 1 ? link.trim() : "", addedAt: Date.now() });
      added++;
      progress((i + 1) / media.length);
    }
    return { added, failed, msg: added ? "Added " + added + " to " + V.sections[sec].name + (failed ? ", " + failed + " skipped" : "") : "Those files aren't videos or photos" };
  }
  const score = (files) => files.length && files.every(isMedia) ? 5 : 0;
  V.dest({ id: "tiktok", name: "TikTok", sub: "Reposts", cls: "d-tiktok", section: "tiktok", accepts: score, fields: fields("tiktok"), import: (f, el, p) => importMedia("tiktok", f, el, p) });
  V.dest({ id: "instagram", name: "Instagram", sub: "Reposts", cls: "d-instagram", section: "instagram", accepts: (f) => score(f) - 1, fields: fields("instagram"), import: (f, el, p) => importMedia("instagram", f, el, p) });

  // ---------- the player ----------
  function openPlayer(sec, id) {
    const items = sorted(filterTab(sec, list(sec)));
    const v = document.createElement("div");
    v.id = "viewer";
    v.style.fontFamily = sec === "tiktok" ? "var(--font-tt)" : "var(--font-ig)";
    v.innerHTML = '<div class="vtop"><button data-x aria-label="Close">' + I.back + '</button><span class="vlabel">' + (sec === "tiktok" ? "Reposts" : "Reels") +
      '</span><span style="width:44px"></span></div><div class="vscroll">' + items.map((it) => page(it, sec)).join("") + "</div>";
    document.body.appendChild(v);
    const urls = [];
    let io = null, muted = false;
    V.layer(v, () => { io && io.disconnect(); v.querySelectorAll("video").forEach((x) => { x.pause(); x.removeAttribute("src"); x.load(); }); urls.forEach((u) => URL.revokeObjectURL(u)); });
    const sc = $(".vscroll", v);
    sc.scrollTop = Math.max(0, items.findIndex((i) => i.id === id)) * sc.clientHeight;
    const observe = () => {
      io && io.disconnect();
      io = new IntersectionObserver((entries) => entries.forEach((e) => e.intersectionRatio > .6 ? play(e.target) : stop(e.target)), { root: sc, threshold: [0, .6] });
      sc.querySelectorAll(".vpage").forEach((p) => io.observe(p));
    };
    observe();
    function play(pg) {
      const it = items.find((i) => i.id === pg.dataset.id), vid = $("video", pg);
      if (!it || !vid) return;
      if (!vid.src) {
        const u = URL.createObjectURL(it.blob); urls.push(u); vid.src = u;
        vid.addEventListener("timeupdate", () => { const bar = $(".scrub i", pg); if (bar && vid.duration) bar.style.width = (vid.currentTime / vid.duration * 100) + "%"; });
      }
      vid.muted = muted;
      vid.play().then(() => pg.classList.remove("is-paused")).catch(() => {
        vid.muted = muted = true;
        vid.play().then(() => {
          pg.classList.remove("is-paused");
          if (!$(".sound", pg)) { const b = document.createElement("button"); b.className = "sound"; b.dataset.unmute = ""; b.innerHTML = I.mute + "Tap for sound"; pg.appendChild(b); }
        }).catch(() => {});
      });
    }
    function stop(pg) { const vid = $("video", pg); if (vid && !vid.paused) vid.pause(); pg.classList.add("is-paused"); }
    v.addEventListener("click", async (e) => {
      if (e.target.closest("[data-x]")) { V.closeLayer(v); return; }
      const pg = e.target.closest(".vpage");
      const it = pg && items.find((i) => i.id === pg.dataset.id);
      const b = e.target.closest("button, a");
      if (!b) {
        const vid = pg && $("video", pg);
        if (!vid) return;
        if (vid.paused) { vid.play().catch(() => {}); pg.classList.remove("is-paused"); } else { vid.pause(); pg.classList.add("is-paused"); }
        return;
      }
      if (!it) return;
      if ("unmute" in b.dataset) { muted = false; const vid = $("video", pg); if (vid) vid.muted = false; b.remove(); }
      else if (b.dataset.act === "note") noteSheet(it, () => { pg.outerHTML = page(it, sec); observe(); });
      else if (b.dataset.act === "move") {
        if (it.example) { V.toast("Examples can't be moved"); return; }
        const other = sec === "tiktok" ? "instagram" : "tiktok";
        if (await V.confirm("Move to " + V.sections[other].name + "?", "It moves to " + V.sections[other].name + " Reposts.", "Move")) {
          it.section = other; await V.save(it); V.closeLayer(v); V.render(); V.toast("Moved to " + V.sections[other].name);
        }
      } else if (b.dataset.act === "delete") {
        if (it.example) { V.toast("Examples disappear once you add your own"); return; }
        V.askDelete(it, V.sections[sec].name, () => V.closeLayer(v));
      }
    });
  }
  function page(it, sec) {
    const cap = (it.note ? "<p>" + esc(it.note) + "</p>" : "") +
      (it.url ? '<a class="src" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + I.out + esc(V.host(it.url) || "Original") + "</a>" : "") +
      '<div class="when">' + V.when(it.addedAt) + (it.example ? ", example" : "") + "</div>";
    const vid = it.kind === "video" && !it.example;
    return '<div class="vpage is-paused" data-id="' + esc(it.id) + '">' +
      (vid ? '<video playsinline loop preload="none" poster="' + V.thumbURL(it) + '"></video>' : '<img alt="" src="' + (it.example ? V.thumbURL(it) : V.blobURL(it)) + '">') +
      '<div class="shade"></div>' + (vid ? '<div class="paused">' + I.bigplay + "</div>" : "") +
      '<div class="rail"><button data-act="note">' + I.note + "<span>Note</span></button>" +
      (it.url ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener" style="display:flex;flex-direction:column;align-items:center;gap:2px;color:#fff;font-size:12px;font-weight:700;text-decoration:none">' + I.link + "<span>Original</span></a>" : "") +
      '<button data-act="move">' + I.move + '<span>Move</span></button><button data-act="delete">' + I.trashbig + "<span>Delete</span></button></div>" +
      '<div class="caption"><b>' + (sec === "tiktok" ? "@vault.reposts" : "vault.reposts") + "</b>" + cap + "</div>" +
      (vid ? '<div class="scrub"><i></i></div>' : "") + "</div>";
  }
  function noteSheet(it, done) {
    V.sheet('<h2>Note and link</h2><label class="field" for="editNote">Note<textarea id="editNote" rows="3" placeholder="What it is, who posted it">' + esc(it.note) + "</textarea></label>" +
      '<label class="field" for="editLink">Link to the original<input id="editLink" type="url" inputmode="url" value="' + esc(it.url) + '" placeholder="https://"></label>' +
      '<div class="actions"><button class="btn" id="nCancel">Cancel</button><button class="btn primary" id="nSave">Save</button></div>',
      (el) => {
        $("#nCancel", el).onclick = V.closeSheet;
        $("#nSave", el).onclick = async () => {
          it.note = $("#editNote", el).value.trim(); it.url = $("#editLink", el).value.trim();
          if (!it.example) await V.save(it);
          V.closeSheet(); V.toast("Saved"); done && done(); V.render();
        };
      });
  }
})();
