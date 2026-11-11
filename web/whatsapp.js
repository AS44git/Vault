/* Vault: WhatsApp. Chat exports become chats; their photos, videos, voice notes and documents
   fill Media; screenshots of the Calls tab fill Calls. */
(() => {
  "use strict";
  const V = window.Vault, $ = V.$, I = V.I, esc = V.esc, nf = V.nf;

  // ---------- reading an export ----------
  // Android: "11/11/2026, 15:48 - Thandi: hello"   iOS: "[11/11/2026, 15:48:12] Thandi: hello"
  const HEAD = /^‎?\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s+)?(.*)$/;
  function parseChat(text) {
    const lines = text.replace(/\r/g, "").replace(/[‎‏‪-‮]/g, "").split("\n");
    const raw = [];
    for (const line of lines) {
      const m = line.match(HEAD);
      if (m && m[8] !== undefined) raw.push({ p: m, rest: m[8] });
      else if (raw.length) raw[raw.length - 1].rest += "\n" + line;
    }
    // Day or month first? Whichever is ever over 12 tells; this part of the world writes day first.
    let dayFirst = true;
    for (const { p } of raw) {
      if (p[1].length === 4) { dayFirst = null; break; }
      if (+p[1] > 12) { dayFirst = true; break; }
      if (+p[2] > 12) { dayFirst = false; break; }
    }
    const msgs = [], people = {};
    for (const { p, rest } of raw) {
      let y, mo, d;
      if (dayFirst === null) { y = +p[1]; mo = +p[2]; d = +p[3]; } else if (dayFirst) { d = +p[1]; mo = +p[2]; y = +p[3]; } else { mo = +p[1]; d = +p[2]; y = +p[3]; }
      if (y < 100) y += 2000;
      let h = +p[4];
      const ap = (p[7] || "").toLowerCase().replace(/[.\s]/g, "");
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      const t = new Date(y, mo - 1, d, h, +p[5], +(p[6] || 0)).getTime();
      const colon = rest.indexOf(": ");
      const msg = { t };
      if (colon > 0 && colon < 60 && !/\n/.test(rest.slice(0, colon))) {
        msg.from = rest.slice(0, colon).trim();
        msg.text = rest.slice(colon + 2);
        people[msg.from] = (people[msg.from] || 0) + 1;
      } else { msg.sys = true; msg.text = rest; }
      // attachments
      let a = msg.text.match(/^([^\n]+?\.[A-Za-z0-9]{2,5}) \((?:file attached|[^)]*attached[^)]*)\)\n?/i) || msg.text.match(/<attached: ([^>]+)>\n?/);
      if (a) { msg.att = a[1].trim(); msg.text = msg.text.replace(a[0], "").trim(); }
      else if (/^(<Media omitted>|(image|video|audio|sticker|GIF|document) omitted)$/i.test(msg.text.trim())) { msg.omitted = msg.text.trim().replace(/[<>]/g, ""); msg.text = ""; }
      if (/^This message was deleted$|^You deleted this message$/.test(msg.text)) msg.deleted = true;
      // Calls written into the chat: "[Call]", "Missed voice call", "Video call, 12 min"…
      const call = msg.text.trim().match(/^\[?(missed\s+)?(voice\s+|video\s+|group\s+)?call\]?(?:[.,:]?\s*(.{0,30}))?$/i);
      if (call && !msg.att) { msg.call = { missed: !!call[1] || /no answer|missed|declined/i.test(call[3] || ""), video: /video/i.test(call[2] || ""), extra: (call[3] || "").trim() }; msg.text = ""; }
      msgs.push(msg);
    }
    return { msgs, people };
  }
  const chatName = (fileName) => {
    const b = V.base(fileName || "");
    const m = b.match(/WhatsApp Chat (?:with|-|–)\s*(.+)$/i);
    return m ? m[1].trim() : "";
  };
  function mediaKind(name) {
    const e = V.ext(name), n = String(name || "").toUpperCase();
    if (n.startsWith("PTT-") || (e === "opus" && !n.startsWith("AUD-"))) return "voice";
    if (["opus", "ogg", "m4a", "mp3", "aac", "amr", "wav"].includes(e)) return "audio";
    if (n.startsWith("STK-") && e === "webp") return "sticker";
    if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(e)) return "photo";
    if (["mp4", "3gp", "mov", "mkv", "webm"].includes(e)) return "video";
    return "doc";
  }
  const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime", webm: "video/webm",
    opus: "audio/ogg", ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", aac: "audio/aac", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", vcf: "text/vcard" };

  function audioLength(blob) {
    return new Promise((resolve) => {
      const a = new Audio(); const u = URL.createObjectURL(blob);
      const done = (d) => { URL.revokeObjectURL(u); resolve(isFinite(d) ? d : 0); };
      const timer = setTimeout(() => done(0), 3000);
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        if (a.duration === Infinity) { a.currentTime = 1e7; a.ontimeupdate = () => { a.ontimeupdate = null; clearTimeout(timer); done(a.duration); }; }
        else { clearTimeout(timer); done(a.duration); }
      };
      a.onerror = () => { clearTimeout(timer); done(0); };
      a.src = u;
    });
  }

  async function importExport(files, el, progress) {
    // A chat export arrives as a .zip (from a phone) or as the .txt plus its media files.
    const sets = [];
    const loose = [];
    for (const f of files) {
      if (V.ext(f.name) === "zip") {
        const JSZip = await V.lib("zip");
        const z = await JSZip.loadAsync(f);
        const entries = Object.values(z.files).filter((e) => !e.dir);
        const txtEntry = entries.find((e) => /(^|\/)_chat\.txt$|WhatsApp Chat.*\.txt$/i.test(e.name)) || entries.find((e) => /\.txt$/i.test(e.name));
        if (!txtEntry) continue;
        const media = [];
        for (const e of entries) {
          if (e === txtEntry) continue;
          const name = e.name.split("/").pop();
          const b = await e.async("blob");
          media.push(new File([b], name, { type: MIME[V.ext(name)] || "" }));
        }
        sets.push({ name: chatName(f.name) || chatName(txtEntry.name), text: await txtEntry.async("string"), media });
      } else loose.push(f);
    }
    const txts = loose.filter((f) => V.ext(f.name) === "txt");
    const others = loose.filter((f) => V.ext(f.name) !== "txt");
    if (txts.length === 1) sets.push({ name: chatName(txts[0].name), text: await txts[0].text(), media: others });
    else if (txts.length > 1) for (const t of txts) sets.push({ name: chatName(t.name), text: await t.text(), media: [] });
    else if (others.length && !sets.length) return importLooseMedia(others, progress);

    let chats = 0, mediaCount = 0;
    const totalWork = sets.reduce((s, x) => s + x.media.length + 1, 0) || 1;
    let done = 0;
    for (const set of sets) {
      const { msgs, people } = parseChat(set.text);
      if (!msgs.length) continue;
      const ranked = Object.entries(people).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      const me = ranked.includes("You") ? "You" : null;
      const chat = {
        id: V.uid(), section: "whatsapp", kind: "chat", name: set.name || ranked.filter((p) => p !== me).slice(0, 3).join(", ") || "Chat",
        messages: msgs, people: ranked, me, first: msgs[0].t, last: msgs[msgs.length - 1].t, addedAt: Date.now(),
      };
      const byName = new Map(set.media.map((f) => [f.name, f]));
      const kids = [];
      const whenFor = new Map();
      msgs.forEach((m) => { if (m.att) whenFor.set(m.att, m); });
      for (const [name, f] of byName) {
        const kind = mediaKind(name);
        const m = whenFor.get(name);
        const it = { id: V.uid(), section: "whatsapp", kind, parent: chat.id, child: true, name, blob: f, at: m ? m.t : chat.last, from: m ? m.from : "", addedAt: Date.now() };
        if (kind === "photo" || kind === "sticker" || kind === "video") {
          const t = await V.thumbnail(f, kind === "video" ? "video" : "image", 360);
          it.thumb = t.thumb; it.duration = t.duration;
        } else if (kind === "voice" || kind === "audio") it.duration = await audioLength(f);
        kids.push(it);
        done++; progress(done / totalWork);
      }
      chat.mediaCount = kids.length;
      await V.save([chat, ...kids]);
      chats++; mediaCount += kids.length; done++; progress(done / totalWork);
    }
    if (!chats) return { added: 0, failed: files.length, msg: "That doesn't look like a WhatsApp chat export" };
    tab = "chats";
    return { added: chats, msg: "Added " + chats + (chats === 1 ? " chat" : " chats") + (mediaCount ? " with " + nf.format(mediaCount) + " photos, videos and notes" : "") };
  }
  async function importLooseMedia(files, progress) {
    let added = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i], kind = mediaKind(f.name);
      const it = { id: V.uid(), section: "whatsapp", kind, child: true, name: f.name, blob: f, at: f.lastModified || Date.now(), from: "", addedAt: Date.now() };
      if (kind === "photo" || kind === "sticker" || kind === "video") { const t = await V.thumbnail(f, kind === "video" ? "video" : "image", 360); it.thumb = t.thumb; it.duration = t.duration; }
      else if (kind === "voice" || kind === "audio") it.duration = await audioLength(f);
      await V.save(it); added++; progress((i + 1) / files.length);
    }
    tab = "media";
    return { added, msg: "Added " + added + " to WhatsApp media" };
  }
  async function importCalls(files, el, progress) {
    let added = 0, failed = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!/^image\//.test(f.type) && !["png", "jpg", "jpeg", "webp"].includes(V.ext(f.name))) { failed++; continue; }
      const t = await V.thumbnail(f, "image", 480);
      await V.save({ id: V.uid(), section: "whatsapp", kind: "callshot", child: true, name: f.name, blob: f, thumb: t.thumb, w: t.w, h: t.h, note: (($("#callNote", el) || {}).value || "").trim(), addedAt: Date.now(), at: f.lastModified || Date.now() });
      added++; progress((i + 1) / files.length);
    }
    tab = "calls";
    return { added, failed, msg: added ? "Added " + added + (added === 1 ? " call screenshot" : " call screenshots") : "Call logs are kept as screenshots: pick images" };
  }
  const looksLikeExport = (files) => files.some((f) => /WhatsApp Chat|^_chat\.txt$/i.test(f.name)) ? 10 : files.some((f) => V.ext(f.name) === "zip") ? 6 : 0;
  V.dest({ id: "whatsapp", name: "WhatsApp", sub: "Chats, media", cls: "d-whatsapp", section: "whatsapp", accepts: (f) => looksLikeExport(f) || (f.some((x) => /^(PTT|AUD|IMG|VID|STK|DOC)-\d{8}-WA/i.test(x.name)) ? 9 : 0), import: importExport });
  V.dest({ id: "wacalls", name: "WhatsApp", sub: "Call screenshots", cls: "d-wacalls", section: "whatsapp", accepts: (f) => f.every((x) => /^image\//.test(x.type)) && f.some((x) => /screenshot/i.test(x.name)) ? 3 : 0,
    fields: () => '<label class="field" for="callNote">Note (optional)<input id="callNote" type="text" placeholder="Which calls, which week"></label>', import: importCalls });

  // ---------- an example chat until the first real one ----------
  const EX = (() => {
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const day = 86400000, t = (dOff, h, m) => base.getTime() - dOff * day + (h * 60 + m) * 60000;
    const msgs = [
      { t: t(2, 8, 41), sys: true, text: "Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them." },
      { t: t(2, 9, 2), from: "Thandi", text: "Morning! Are we still on for Saturday?" },
      { t: t(2, 9, 5), from: "Ahmed", text: "Yes, 10am at the market" },
      { t: t(2, 9, 5), from: "Ahmed", text: "I'll bring the camera" },
      { t: t(2, 9, 7), from: "Thandi", text: "Perfect. Parking is a mission there so leave early" },
      { t: t(1, 18, 30), from: "Thandi", text: "Sent you the photos from last time" },
      { t: t(1, 18, 31), from: "Ahmed", text: "These came out so clean" },
      { t: t(1, 18, 33), from: "Thandi", text: "Told you the light there is unreal" },
      { t: t(0, 7, 55), from: "Ahmed", text: "Leaving now, see you just now" },
      { t: t(0, 7, 56), from: "Thandi", text: "On my way too" },
    ];
    return { id: "ex-chat", example: true, section: "whatsapp", kind: "chat", name: "Thandi", messages: msgs, people: ["Thandi", "Ahmed"], me: "Ahmed", first: msgs[0].t, last: msgs[msgs.length - 1].t, addedAt: Date.now(), mediaCount: 0 };
  })();
  function tidy(c) {
    if (c.example || c.tidied) return;
    c.tidied = true;
    if (!c.me && c.people.includes("You")) c.me = "You";
    if (c.people.includes("You") && c.name === c.people.slice(0, 2).join(", ")) c.name = c.people.filter((p) => p !== "You").slice(0, 3).join(", ") || c.name;
    c.messages.forEach((m) => {
      if (m.call || m.att || !m.text) return;
      const call = m.text.trim().match(/^\[?(missed\s+)?(voice\s+|video\s+|group\s+)?call\]?(?:[.,:]?\s*(.{0,30}))?$/i);
      if (call) { m.call = { missed: !!call[1] || /no answer|missed|declined/i.test(call[3] || ""), video: /video/i.test(call[2] || ""), extra: (call[3] || "").trim() }; m.text = ""; }
    });
    V.store.put(c);
  }
  const chats = () => { const c = V.of("whatsapp", "chat"); c.forEach(tidy); return c.length ? c : [EX]; };
  const realChats = () => V.of("whatsapp", "chat").length > 0;

  // ---------- look ----------
  const PALETTE = ["#ff8a65", "#4fc3f7", "#81c784", "#ba68c8", "#f06292", "#ffb74d", "#4db6ac", "#7986cb", "#a1887f", "#90a4ae"];
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const initials = (n) => String(n || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#";
  const avatar = (n, c) => c && c.photo ? '<span class="wa-av" style="background-image:url(' + V.thumbURL({ id: c.id + ":photo", thumb: c.photo }) + ');background-size:cover;background-position:center"></span>'
    : '<span class="wa-av" style="background:' + hue(n) + '">' + esc(initials(n)) + "</span>";
  const short = (n) => n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  function dayLabel(t) {
    const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const rowDate = (t) => {
    const d = new Date(t), today = new Date();
    if (d.toDateString() === today.toDateString()) return hm(t);
    if (Date.now() - t < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
  };
  function preview(c) {
    for (let i = c.messages.length - 1; i >= 0; i--) {
      const m = c.messages[i];
      if (m.sys) continue;
      const who = m.from === c.me ? "You: " : c.people.length > 2 ? m.from.split(" ")[0] + ": " : "";
      if (m.call) return esc(who) + I.call.replace(/width="24" height="24"/, 'width="15" height="15"') + (m.call.missed ? "Missed " : "") + (m.call.video ? "Video call" : "Voice call");
      if (m.att || m.omitted) {
        const k = m.att ? mediaKind(m.att) : (m.omitted.match(/image|video|audio|sticker|document/i) || ["media"])[0].toLowerCase();
        const label = { photo: "Photo", image: "Photo", video: "Video", voice: "Voice message", audio: "Audio", sticker: "Sticker", doc: "Document", document: "Document" }[k] || "Media";
        return esc(who) + (k === "voice" || k === "audio" ? I.mic : "") + esc(label);
      }
      return esc(who + m.text.split("\n")[0]);
    }
    return "";
  }

  let tab = "chats", query = "", filter = "all", mediaTab = "visual";
  V.register({
    id: "whatsapp", name: "WhatsApp", view: "wa", big: true,
    door() {
      const cs = chats(), n = realChats() ? cs.length : 0;
      return '<button class="door door-wa" data-door="whatsapp" aria-label="Open WhatsApp"><div><div class="door-name">WhatsApp</div><div class="door-sub">Chats, media and calls</div></div>' +
        '<div class="bubbles" aria-hidden="true"><span><i style="width:90%"></i><i style="width:55%"></i></span><span><i style="width:80%"></i></span><span><i style="width:95%"></i><i style="width:70%"></i></span></div>' +
        '<div class="door-foot"><span class="door-count">' + V.count(n, "chat", "chats") + '</span><span class="door-open">Open' + I.chev + "</span></div></button>";
    },
    render(el) {
      const navBtn = (id, icon, label) => '<button data-tab="' + id + '"' + (tab === id ? ' aria-current="true"' : "") + "><i>" + icon + "</i>" + label + "</button>";
      el.innerHTML = '<div class="wa-aurora" aria-hidden="true"></div><div class="inner">' +
        '<div class="topbar"><button class="back" data-home aria-label="Back to Vault">' + I.back + '</button><div class="title">WhatsApp</div>' +
        '<div class="acts"><button class="act" data-add aria-label="Add">' + I.plus + "</button></div></div>" +
        '<div id="waBody">' + (tab === "chats" ? chatsTab() : tab === "media" ? mediaTabHTML() : callsTab()) + "</div></div>" +
        '<nav class="wa-nav">' + navBtn("chats", I.chat, "Chats") + navBtn("media", I.media, "Media") + navBtn("calls", I.call, "Calls") + "</nav>" +
        '<button class="wa-fab" data-add aria-label="Add">' + (tab === "calls" ? I.call : tab === "media" ? I.media : I.plus) + "</button>";
      el.onclick = onClick;
      el.oninput = (e) => {
        if (e.target.id === "waQuery") { query = e.target.value; $("#chatList", el).innerHTML = chatRows(); }
      };
      if (tab === "media") drawWaves(el);
    },
  });

  function chatRows() {
    let cs = [...chats()].sort((a, b) => b.last - a.last);
    if (filter === "groups") cs = cs.filter((c) => c.people.length > 2);
    if (filter === "media") cs = cs.filter((c) => c.mediaCount > 0);
    const q = query.trim().toLowerCase();
    if (q) cs = cs.filter((c) => c.name.toLowerCase().includes(q) || c.people.some((p) => p.toLowerCase().includes(q)));
    if (!cs.length) return '<div class="wa-empty">No chats match.</div>';
    return cs.map((c) => '<button class="chatrow" data-chat="' + esc(c.id) + '" style="--ring:' + hue(c.name) + '">' + avatar(c.name, c) +
      '<span class="who"><span class="name">' + esc(c.name) + (c.example ? ' <small style="font-weight:500;color:var(--wa-dim)">(example)</small>' : "") + '</span><span class="last">' + preview(c) + "</span></span>" +
      '<span class="side"><span>' + rowDate(c.last) + '</span><span class="count">' + short(c.messages.length) + "</span></span></button>").join("");
  }
  function chatsTab() {
    const cs = V.of("whatsapp", "chat");
    const groups = cs.filter((c) => c.people.length > 2).length, withMedia = cs.filter((c) => c.mediaCount > 0).length;
    const pill = (id, label, n) => '<button class="wa-filter" data-filter="' + id + '" aria-pressed="' + (filter === id) + '">' + label + (n != null ? " " + nf.format(n) : "") + "</button>";
    return '<label class="wa-search">' + I.search + '<input id="waQuery" type="search" placeholder="Search chats" value="' + esc(query) + '"></label>' +
      '<div class="wa-filters">' + pill("all", "All") + pill("groups", "Groups", groups) + pill("media", "With media", withMedia) + "</div>" +
      summary() +
      (realChats() ? "" : '<div class="wa-how"><b>Back up a chat:</b> in WhatsApp open the chat, tap ⋮ then More then Export chat, choose Include media, and share it to Vault. The chat below is an example.</div>') +
      '<div id="chatList">' + chatRows() + "</div>";
  }

  // A bright card at the top of the deck: what's kept, at a glance.
  function summary() {
    const cs = V.of("whatsapp", "chat");
    if (!cs.length) return "";
    const msgs = cs.reduce((n, c) => n + c.messages.length, 0);
    const media = V.items.filter((it) => it.section === "whatsapp" && it.child && it.kind !== "callshot").length;
    return '<div class="wa-summary"><b>' + nf.format(cs.length) + (cs.length === 1 ? " chat" : " chats") + " kept</b><span>" + nf.format(msgs) + " messages, " + nf.format(media) +
      (media === 1 ? " photo, video or note" : " photos, videos and notes") + '</span><i></i><i></i><i></i></div>';
  }

  // ---------- media ----------
  const media = () => V.items.filter((it) => it.section === "whatsapp" && ["photo", "video", "sticker", "voice", "audio", "doc"].includes(it.kind));
  function mediaTabHTML() {
    const all = media().sort((a, b) => (b.at || b.addedAt) - (a.at || a.addedAt));
    const visual = all.filter((m) => ["photo", "video", "sticker"].includes(m.kind));
    const voice = all.filter((m) => m.kind === "voice" || m.kind === "audio");
    const docs = all.filter((m) => m.kind === "doc");
    const pill = (id, label, n) => '<button class="wa-filter" data-mtab="' + id + '" aria-pressed="' + (mediaTab === id) + '">' + label + " " + nf.format(n) + "</button>";
    let body = "";
    if (!all.length) body = '<div class="wa-empty"><b>No media yet</b>Photos, videos, voice notes and documents from your chat exports show up here. Export a chat with media included, or share them straight to Vault.</div>';
    else if (mediaTab === "visual") {
      let month = "";
      body = visual.map((m) => {
        const mo = new Date(m.at || m.addedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
        const head = mo !== month ? (month ? "</div>" : "") + '<div class="wa-month">' + esc(mo) + '</div><div class="wa-grid">' : "";
        month = mo;
        return head + '<button data-file="' + esc(m.id) + '" style="background-image:url(' + V.thumbURL(m) + ')" aria-label="' + esc(m.name) + '">' +
          (m.kind === "video" ? '<span class="dur">' + I.play + V.dur(m.duration) + "</span>" : "") + "</button>";
      }).join("") + (visual.length ? "</div>" : '<div class="wa-empty">No photos or videos yet.</div>');
    } else if (mediaTab === "voice") {
      body = voice.length ? voice.map((m) => {
        const chat = V.items.find((c) => c.id === m.parent);
        return '<div class="voice" data-voice="' + esc(m.id) + '"><button class="play" aria-label="Play">' + I.playbig + '</button><div><div class="who">' + esc(m.from || (chat ? chat.name : "Voice note")) +
          '</div><canvas class="wave" data-wave="' + esc(m.id) + '"></canvas><div class="info"><span>' + esc(chat ? chat.name : "") + ", " + V.date(m.at || m.addedAt) + "</span><span>" + V.dur(m.duration) + "</span></div></div></div>";
      }).join("") : '<div class="wa-empty">No voice notes yet.</div>';
    } else {
      body = docs.length ? docs.map((m) => docRow(m)).join("") : '<div class="wa-empty">No documents yet.</div>';
    }
    return '<div class="wa-filters" style="padding-top:6px">' + pill("visual", "Photos and videos", visual.length) + pill("voice", "Voice notes", voice.length) + pill("docs", "Documents", docs.length) + "</div>" + body;
  }
  const DOCCOL = { pdf: "#e2574c", docx: "#185abd", doc: "#185abd", xlsx: "#107c41", xls: "#107c41", pptx: "#c43e1c", vcf: "#7e57c2", zip: "#6d6d6d" };
  function docRow(m) {
    const e = V.ext(m.name);
    return '<button class="docrow" data-file="' + esc(m.id) + '"><span class="badge" style="background:' + (DOCCOL[e] || "#5f6b73") + '">' + esc((e || "file").toUpperCase()) + '</span><span style="min-width:0"><div class="n">' + esc(m.name) +
      '</div><div class="m">' + V.size(m.blob && m.blob.size) + ", " + V.date(m.at || m.addedAt) + "</div></span></button>";
  }

  // Voice notes: a real waveform, worked out once from the audio and kept.
  const AC = window.AudioContext || window.webkitAudioContext;
  async function peaksFor(it) {
    if (it.peaks) return it.peaks;
    try {
      const ctx = new AC();
      const buf = await ctx.decodeAudioData(await it.blob.arrayBuffer());
      const data = buf.getChannelData(0), n = 48, step = Math.floor(data.length / n) || 1, out = [];
      for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) m = Math.max(m, Math.abs(data[j])); out.push(m); }
      const max = Math.max(...out, .01);
      it.peaks = out.map((v) => +(v / max).toFixed(2));
      ctx.close && ctx.close();
      if (!it.example) V.store.put(it);
      return it.peaks;
    } catch (e) { return Array.from({ length: 48 }, (_, i) => .3 + .25 * Math.abs(Math.sin(i * 1.7))); }
  }
  function paintWave(canvas, peaks, played) {
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 28, dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext("2d"); g.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const dim = css.getPropertyValue("--wa-dim").trim() || "#8696a0", on = css.getPropertyValue("--wa-green").trim() || "#25d366";
    const bw = w / peaks.length;
    peaks.forEach((p, i) => {
      const bh = Math.max(3, p * (h - 4));
      g.fillStyle = i / peaks.length < played ? on : dim;
      g.globalAlpha = i / peaks.length < played ? 1 : .55;
      g.beginPath();
      if (g.roundRect) g.roundRect(i * bw + bw * .2, (h - bh) / 2, bw * .6, bh, 2); else g.rect(i * bw + bw * .2, (h - bh) / 2, bw * .6, bh);
      g.fill();
    });
  }
  function drawWaves(root) {
    const io = new IntersectionObserver((entries) => entries.forEach(async (e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const it = V.items.find((x) => x.id === e.target.dataset.wave);
      if (it) paintWave(e.target, await peaksFor(it), 0);
    }));
    V.$$("canvas[data-wave]", root).forEach((c) => io.observe(c));
  }
  let player = null;
  function playVoice(it, button, canvas) {
    if (player && player.it === it) {
      if (player.a.paused) { player.a.play(); button.innerHTML = I.pause; } else { player.a.pause(); button.innerHTML = I.playbig; }
      return;
    }
    if (player) { player.a.pause(); player.button.innerHTML = I.playbig; URL.revokeObjectURL(player.url); }
    const url = URL.createObjectURL(it.blob);
    const a = new Audio(url);
    player = { it, a, button, url };
    button.innerHTML = I.pause;
    a.ontimeupdate = async () => { if (canvas && a.duration) paintWave(canvas, await peaksFor(it), a.currentTime / a.duration); };
    a.onended = () => { button.innerHTML = I.playbig; if (canvas) peaksFor(it).then((p) => paintWave(canvas, p, 0)); };
    a.play().catch(() => { button.innerHTML = I.playbig; V.toast("This voice note can't be played here"); });
  }

  // A profile picture: the middle square of the image, 320 px, as a JPEG.
  function squarePhoto(file) {
    return new Promise((resolve) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas");
        c.width = c.height = 320;
        c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 320, 320);
        URL.revokeObjectURL(u);
        c.toBlob((b) => resolve(b), "image/jpeg", .86);
      };
      img.onerror = () => { URL.revokeObjectURL(u); resolve(null); };
      img.src = u;
    });
  }

  // ---------- calls ----------
  function callsTab() {
    const shots = V.of("whatsapp", "callshot").sort((a, b) => b.addedAt - a.addedAt);
    if (!shots.length) return '<div class="wa-how" style="margin-top:12px"><b>Keep your call history:</b> in WhatsApp go to Calls, take screenshots of the list (scroll for more), then share them to Vault and choose WhatsApp call screenshots.</div>' +
      '<div class="wa-empty">No call screenshots yet.</div>';
    return '<div class="calls">' + shots.map((s) => '<button class="callcard" data-file="' + esc(s.id) + '"><span class="shot" style="background-image:url(' + V.thumbURL(s) + ')"></span><span><span class="ic">' +
      V.ic('<path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>', 16, 2.4) +
      '</span><div class="t">' + esc(s.note || "Call log") + '</div><div class="d">Saved ' + V.date(s.addedAt, true) + ", " + hm(s.addedAt) + "</div></span></button>").join("") + "</div>";
  }

  // ---------- clicks ----------
  function onClick(e) {
    const t = e.target.closest("[data-tab], [data-add], [data-chat], [data-filter], [data-mtab], [data-file], .voice .play");
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; V.render(); window.scrollTo(0, 0); }
    else if ("add" in t.dataset) V.addSheet([], tab === "calls" ? "wacalls" : "whatsapp");
    else if (t.dataset.chat) openChat(t.dataset.chat === "ex-chat" ? EX : V.items.find((c) => c.id === t.dataset.chat), t);
    else if (t.dataset.filter) { filter = t.dataset.filter; V.render(); }
    else if (t.dataset.mtab) { mediaTab = t.dataset.mtab; V.render(); }
    else if (t.dataset.file) openMedia(V.items.find((x) => x.id === t.dataset.file), t);
    else if (t.classList.contains("play")) {
      const row = t.closest(".voice"), it = V.items.find((x) => x.id === row.dataset.voice);
      if (it) playVoice(it, t, $("canvas", row));
    }
  }
  function openMedia(it, from) {
    if (!it) return;
    const r = V.openFile(it, "#25d366", { from });
    r.acts.innerHTML = '<button aria-label="Delete">' + I.trash + "</button>";
    r.acts.onclick = () => V.askDelete(it, "WhatsApp", () => V.closeLayer(r.el));
  }

  // ---------- a chat, opened ----------
  function openChat(c, from) {
    if (!c) return;
    const el = document.createElement("div");
    el.className = "chatview";
    document.body.appendChild(el);
    V.layer(el, () => { if (player) { player.a.pause(); player = null; } });
    V.zoomIn(el, from);
    const kids = new Map(V.items.filter((x) => x.parent === c.id).map((x) => [x.name, x]));
    const group = c.people.length > 2;
    let start = Math.max(0, c.messages.length - 250), q = "", hits = [], hit = -1;

    const head = () => {
      const span = c.messages.length ? V.date(c.first, true) + " to " + V.date(c.last, true) : "";
      return '<div class="chathead"><button data-x aria-label="Back">' + I.back + '</button><button data-photo class="avbtn" aria-label="Chat photo">' + avatar(c.name, c) + "</button>" +
        '<div style="min-width:0"><div class="nm">' + esc(c.name) + '</div><div class="sub">' + nf.format(c.messages.length) + " messages, " + esc(span) + "</div></div>" +
        '<div style="display:flex"><button data-find aria-label="Search">' + I.search + '</button><button data-menu aria-label="More">' + I.more + "</button></div></div>";
    };
    const meAsk = () => c.me || c.example || !c.people.length ? "" :
      '<div class="meask"><span>Which one is you?</span>' + c.people.slice(0, 5).map((p) => '<button data-me="' + esc(p) + '">' + esc(p) + "</button>").join("") + "</div>";
    const sameDay = (a, b) => a && b && new Date(a.t).toDateString() === new Date(b.t).toDateString();
    function bubble(m, i, prev) {
      const next = c.messages[i + 1];
      const newDay = !sameDay(prev, m);
      let h = newDay ? '<div class="daychip">' + esc(dayLabel(m.t)) + "</div>" : "";
      const out = c.me && m.from === c.me;
      if (m.call) {
        const label = (m.call.missed ? "Missed " : "") + (m.call.video ? "video call" : "voice call");
        return h + '<div class="msg call ' + (m.sys ? "mid" : out ? "out" : "in") + '" data-i="' + i + '"><div class="callbub' + (m.call.missed ? " missed" : "") + '"><span class="callic">' +
          (m.call.video ? V.ic('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>', 18, 2.2) : I.call.replace(/width="24" height="24"/, 'width="18" height="18"')) +
          '</span><span><b>' + esc(label.charAt(0).toUpperCase() + label.slice(1)) + "</b><small>" + esc(m.call.extra || (m.from && !m.sys ? m.from : "Call")) + '</small></span><span class="tm">' + hm(m.t) + "</span></div></div>";
      }
      if (m.sys) return h + '<div class="sysmsg">' + esc(m.text) + "</div>";
      const first = newDay || !prev || prev.sys || prev.call || prev.from !== m.from;
      const last = !next || next.sys || next.call || next.from !== m.from || !sameDay(m, next);
      let inner = "";
      if (group && !out && first) inner += '<div class="from" style="color:' + hue(m.from) + '">' + esc(m.from) + "</div>";
      if (m.att) {
        const it = kids.get(m.att), k = mediaKind(m.att);
        if (!it) inner += '<div class="missing">' + esc(m.att) + " (not in the export)</div>";
        else if (k === "photo" || k === "sticker") inner += '<button class="media" data-file="' + esc(it.id) + '"' + (k === "sticker" ? ' style="background:transparent;max-width:150px"' : "") + '><img alt="" loading="lazy" src="' + V.thumbURL(it) + '"></button>';
        else if (k === "video") inner += '<button class="media" data-file="' + esc(it.id) + '" style="position:relative"><img alt="" loading="lazy" src="' + V.thumbURL(it) + '"><span class="dur" style="position:absolute;left:8px;bottom:6px;color:#fff;font-size:12px;font-weight:600;display:flex;gap:4px;align-items:center;text-shadow:0 1px 2px rgba(0,0,0,.6)">' + I.play + V.dur(it.duration) + "</span></button>";
        else if (k === "voice" || k === "audio") inner += '<div class="vn" data-voice="' + esc(it.id) + '"><button aria-label="Play">' + I.playbig + '</button><div><canvas data-wave="' + esc(it.id) + '"></canvas><div style="font-size:11px;color:var(--wa-dim)">' + V.dur(it.duration) + "</div></div></div>";
        else inner += '<button class="file" data-file="' + esc(it.id) + '">' + I.doc + "<span>" + esc(it.name) + "<br><small style=\"color:var(--wa-dim)\">" + V.size(it.blob && it.blob.size) + "</small></span></button>";
      } else if (m.omitted) inner += '<div class="missing">' + esc(m.omitted.replace(/omitted/i, "not included in the export")) + "</div>";
      if (m.text) inner += '<span class="tx">' + mark(m.text) + "</span>";
      if (m.deleted) inner = '<span class="missing">' + esc(m.text) + "</span>";
      inner += '<span class="tm">' + hm(m.t) + "</span>";
      return h + '<div class="msg ' + (out ? "out" : "in") + (first ? " first" : "") + (last ? " last" : "") + '" data-i="' + i + '"><div class="bub">' + inner + "</div></div>";
    }
    function mark(text) {
      const s = esc(text);
      if (!q) return s.replace(/\n/g, "<br>");
      const rx = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      return s.replace(rx, (x) => "<mark>" + x + "</mark>").replace(/\n/g, "<br>");
    }
    function list() {
      let h = start > 0 ? '<button class="earlier" data-earlier>Show earlier messages (' + nf.format(start) + ")</button>" : "";
      for (let i = start; i < c.messages.length; i++) h += bubble(c.messages[i], i, c.messages[i - 1]);
      return h;
    }
    el.innerHTML = '<div class="wa-aurora" aria-hidden="true"></div><div class="chattop">' + head() + '<div id="findBar"></div>' + meAsk() + '</div><div class="msgs">' + list() + "</div>";
    // the conversation scrolls under the frosted header
    const topEl = $(".chattop", el);
    const pad = () => { el.style.setProperty("--top", topEl.offsetHeight + "px"); };
    pad();
    try { new ResizeObserver(pad).observe(topEl); } catch (e) { /* fixed padding is fine */ }
    const box = $(".msgs", el);
    box.scrollTop = box.scrollHeight;
    // the doodles drift by at a third of the speed of the messages, for depth
    let ticking = false;
    const drift = () => { ticking = false; el.style.setProperty("--drift", (-box.scrollTop * .33).toFixed(1) + "px"); };
    box.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, { passive: true });
    drift();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const recent = V.$$(".msg, .daychip, .sysmsg", box).slice(-16);
      recent.forEach((b, k) => { b.style.animationDelay = (k * 22) + "ms"; b.classList.add("rise"); });
      setTimeout(() => recent.forEach((b) => b.classList.remove("rise")), 1200);
    }
    const waves = () => {
      const io = new IntersectionObserver((entries) => entries.forEach(async (e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const it = V.items.find((x) => x.id === e.target.dataset.wave);
        if (it) paintWave(e.target, await peaksFor(it), 0);
      }), { root: box });
      V.$$("canvas[data-wave]", box).forEach((cv) => io.observe(cv));
    };
    waves();
    const redraw = (keepBottomOffset) => {
      const fromBottom = box.scrollHeight - box.scrollTop;
      box.innerHTML = list();
      if (keepBottomOffset) box.scrollTop = box.scrollHeight - fromBottom;
      waves();
    };

    el.addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if ("x" in t.dataset) V.zoomOut(el);
      else if ("earlier" in t.dataset) { start = Math.max(0, start - 400); redraw(true); }
      else if (t.dataset.me) { c.me = t.dataset.me; if (!c.example) await V.save(c); const ask = $(".meask", el); ask && ask.remove(); redraw(true); V.render(); }
      else if (t.dataset.file) openMedia(V.items.find((x) => x.id === t.dataset.file), t);
      else if (t.closest(".vn")) { const vn = t.closest(".vn"), it = V.items.find((x) => x.id === vn.dataset.voice); if (it) playVoice(it, t, $("canvas", vn)); }
      else if ("find" in t.dataset) openFind();
      else if ("photo" in t.dataset) choosePhoto();
      else if ("menu" in t.dataset) chatMenu();
      else if ("prev" in t.dataset) jump(-1);
      else if ("next" in t.dataset) jump(1);
    });

    function openFind() {
      const fb = $("#findBar", el);
      if (fb.innerHTML) { fb.innerHTML = ""; q = ""; redraw(true); return; }
      fb.innerHTML = '<div class="chatsearch"><input id="findQ" type="search" placeholder="Search this chat" autocomplete="off"><span id="findN"></span>' +
        '<button data-prev aria-label="Earlier match">' + V.ic('<path d="M6 15l6-6 6 6"/>', 22, 2.4) + '</button><button data-next aria-label="Later match">' + V.ic('<path d="M6 9l6 6 6-6"/>', 22, 2.4) + "</button></div>";
      const inp = $("#findQ", el);
      inp.focus();
      let timer = 0;
      inp.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          q = inp.value.trim();
          const lq = q.toLowerCase();
          hits = q.length < 2 ? [] : c.messages.map((m, i) => (m.text || "").toLowerCase().includes(lq) || (m.att || "").toLowerCase().includes(lq) ? i : -1).filter((i) => i >= 0);
          hit = hits.length ? hits.length - 1 : -1;
          show();
        }, 200);
      };
      inp.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); jump(ev.shiftKey ? 1 : -1); } };
    }
    function jump(d) { if (!hits.length) return; hit = (hit + d + hits.length) % hits.length; show(); }
    function show() {
      $("#findN", el).textContent = q.length < 2 ? "" : hits.length ? (hit + 1) + " of " + hits.length : "None";
      if (hit < 0) { redraw(true); return; }
      const i = hits[hit];
      if (i < start) start = Math.max(0, i - 40);
      box.innerHTML = list(); waves();
      const target = $('.msg[data-i="' + i + '"]', box);
      if (target) target.scrollIntoView({ block: "center" });
    }
    function choosePhoto() {
      if (c.example) { V.toast("Add a chat of your own to give it a photo"); return; }
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/*";
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        c.photo = await squarePhoto(f);
        if (!c.photo) { V.toast("That picture couldn't be read"); return; }
        V.forget(c.id + ":photo");
        await V.save(c);
        const av = $(".avbtn", el); if (av) av.innerHTML = avatar(c.name, c);
        V.render(); V.toast("Chat photo set");
      };
      inp.click();
    }
    function chatMenu() {
      V.sheet("<h2>" + esc(c.name) + "</h2>" +
        '<div class="photoset">' + avatar(c.name, c) + '<div><b>Chat photo</b><span>Save their profile picture from WhatsApp (open the chat, tap their name, tap the photo, then share or save), then choose it here.</span>' +
        '<div class="actions" style="margin-top:8px"><button class="btn" id="photoPick">Choose photo</button>' + (c.photo ? '<button class="btn" id="photoOff">Remove</button>' : "") + "</div></div></div>" +
        '<label class="field" for="chatName">Name<input id="chatName" type="text" value="' + esc(c.name) + '"></label>' +
        (c.people.length ? '<label class="field" for="chatMe">Which one is you?<select id="chatMe" style="font:inherit;font-size:15px;padding:11px 12px;border-radius:10px;border:0;background:var(--sheet-field);color:var(--sheet-fg)">' +
          '<option value="">Not set</option>' + c.people.map((p) => "<option" + (p === c.me ? " selected" : "") + ">" + esc(p) + "</option>").join("") + "</select></label>" : "") +
        '<div class="actions"><button class="btn danger" id="chatDel">Delete chat</button><button class="btn primary" id="chatSave">Save</button></div>',
        (s) => {
          $("#photoPick", s).onclick = () => { V.closeSheet(); choosePhoto(); };
          if ($("#photoOff", s)) $("#photoOff", s).onclick = async () => { delete c.photo; V.forget(c.id + ":photo"); await V.save(c); V.closeSheet(); const av = $(".avbtn", el); if (av) av.innerHTML = avatar(c.name, c); V.render(); };
          $("#chatSave", s).onclick = async () => {
            c.name = $("#chatName", s).value.trim() || c.name;
            const me = $("#chatMe", s); if (me) c.me = me.value || null;
            if (!c.example) await V.save(c);
            V.closeSheet(); $(".nm", el).textContent = c.name; redraw(true); V.render();
          };
          $("#chatDel", s).onclick = () => {
            if (c.example) { V.closeSheet(); V.toast("The example goes once you add a chat"); return; }
            V.closeSheet();
            V.askDelete(c, "WhatsApp", () => V.closeLayer(el));
          };
        });
    }
  }
})();
