/* Vault core: storage on this device, the home screen, routing, the add sheet, readers. */
(() => {
  "use strict";
  const V = (window.Vault = {});
  const $ = (V.$ = (s, el = document) => el.querySelector(s));
  V.$$ = (s, el = document) => [...el.querySelectorAll(s)];
  const nf = (V.nf = new Intl.NumberFormat());
  V.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  V.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- icons (strokes kept bold, as the apps draw them) ----------
  const ic = (d, w = 24, sw = 2.2, extra = "") =>
    '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"' + extra + ">" + d + "</svg>";
  V.ic = ic;
  V.I = {
    back: ic('<path d="M15 5l-7 7 7 7"/>', 26, 2.4),
    close: ic('<path d="M6 6l12 12M18 6L6 18"/>', 24, 2.4),
    plus: ic('<path d="M12 5v14M5 12h14"/>', 22, 2.6),
    search: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 22, 2.3),
    more: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    repost: ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 24, 2.3),
    grid: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>', 24, 2.2),
    reels: ic('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8.5 3l3 5M14 3l3 5"/><path d="M10 11.5v5l4.5-2.5z" fill="currentColor" stroke="none"/>', 24, 2.2),
    photo: ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', 24, 2.2),
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    playbig: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    bigplay: '<svg width="72" height="72" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>',
    note: ic('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4h.5A2.5 2.5 0 0 1 4 13.5z"/>', 32, 2.1),
    link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 32, 2.1),
    move: ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 32, 2.1),
    trash: ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 24, 2.2),
    trashbig: ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 32, 2.1),
    mute: ic('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>', 16, 2.4),
    out: ic('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', 16, 2.4),
    chat: ic('<path d="M4 18.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8z"/><path d="M8 9h8M8 12.5h5"/>', 24, 2.1),
    media: ic('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15l-4.5-4.5L7 20"/>', 24, 2.1),
    call: ic('<path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>', 24, 2.1),
    mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 18, 2.2),
    doc: ic('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>', 22, 2.1),
    cloud: ic('<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/>', 20, 2.2),
    open: ic('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', 22, 2.2),
    chev: ic('<path d="M9 6l6 6-6 6"/>', 16, 2.6),
    user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 18, 2.2),
  };

  // ---------- small helpers ----------
  V.dur = (s) => {
    if (!isFinite(s) || s <= 0) return "";
    s = Math.round(s);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  V.size = (b) => !b ? "" : b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(1) + " MB" : (b / 1073741824).toFixed(2) + " GB";
  V.date = (t, withYear) => {
    const d = new Date(t);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: withYear || !sameYear ? "numeric" : undefined });
  };
  V.when = (t) => {
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days < 1) return "Saved today";
    if (days < 2) return "Saved yesterday";
    if (days < 7) return "Saved " + days + " days ago";
    return "Saved " + V.date(t);
  };
  V.host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  V.ext = (name) => (String(name || "").match(/\.([a-z0-9]{1,6})$/i) || [, ""])[1].toLowerCase();
  V.base = (name) => String(name || "").replace(/\.[a-z0-9]{1,6}$/i, "");

  let toastTimer = 0;
  V.toast = (msg) => {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  };
  V.busy = (msg) => {
    const b = $("#busy");
    if (!msg) { b.hidden = true; return; }
    b.innerHTML = "<div>" + V.esc(msg) + "</div>"; b.hidden = false;
  };

  // A dense hand-drawn doodle field for chats: Vault's own drawings, scattered at gentle angles.
  const DOODLES = [
    "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 4c0 1.5 1 1.5 1 3M12 4c0 1.5 1 1.5 1 3",          // cup
    "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",                 // music
    "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",                                               // camera
    "M5 19C5 10 11 5 20 5c0 9-5 15-14 14zM5 19l8-8",                                                                         // leaf
    "M12 3l2.6 5.6 6 .6-4.5 4 1.3 6-5.4-3-5.4 3 1.3-6-4.5-4 6-.6z",                                                          // star
    "M12 20s-7-4.4-8.6-8.8C2.3 8 4.4 5 7.6 5c1.9 0 3.3 1 4.4 2.4C13.1 6 14.5 5 16.4 5c3.2 0 5.3 3 4.2 6.2C19 15.6 12 20 12 20z", // heart
    "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z",                                                          // bubble
    "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5", // sun
    "M18 15A7 7 0 0 1 9 6a7 7 0 1 0 9 9z",                                                                                   // moon
    "M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.5 11 3.5 3.5 0 0 1 18 18z",                                                     // cloud
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z",     // phone
    "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0",                                                  // gift
    "M12 15c-3.5 0-6-3-6-6.5S8.5 3 12 3s6 2 6 5.5-2.5 6.5-6 6.5zM12 15l-1 2h2zM12 17c0 2 2 2 1 5",                          // balloon
    "M4 20l1-4L16 5l3 3L8 19zM14 7l3 3",                                                                                     // pencil
    "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2",                                                                    // lock
    "M3 6h18v12H3zM3 6l9 7 9-7",                                                                                             // envelope
    "M3 11l18-7-6 17-3.5-7.5zM11.5 13.5L21 4",                                                                               // plane
    "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z",                                                                   // headphones
    "M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M12 9.5V4M12 14.5V20M9.5 12H4M14.5 12H20M10 10L6.5 6.5M14 14l3.5 3.5M10 14l-3.5 3.5M14 10l3.5-3.5", // flower
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2M9 9.5h0M15 9.5h0",                         // smile
    "M3 12a9 9 0 0 1 18 0zM12 12v6a2 2 0 0 1-4 0",                                                                           // umbrella
    "M2 19l6-9 4 5 3-4 7 8z",                                                                                                // mountains
    "M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",                                                              // flask
    "M6 4h12l-2 16H8zM6 8h12",                                                                                               // glass
  ];
  // stroke: one colour, or a list to give each doodle its own
  V.doodle = (stroke) => {
    const colors = Array.isArray(stroke) ? stroke : null;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const S = 360, step = 52;
    let paths = "";
    let k = 0;
    for (let y = 0; y < S; y += step) {
      for (let x = (y / step) % 2 ? step / 2 : 0; x < S; x += step) {
        const d = DOODLES[(k++ * 7 + Math.floor(rnd() * 5)) % DOODLES.length];
        const sc = .82 + rnd() * .38, rot = Math.round(rnd() * 70 - 35);
        const jx = x + rnd() * 14 - 7, jy = y + rnd() * 14 - 7;
        const col = colors ? ' stroke="' + colors[k % colors.length] + '"' : "";
        paths += '<path' + col + ' transform="translate(' + jx.toFixed(1) + " " + jy.toFixed(1) + ") rotate(" + rot + " 12 12) scale(" + sc.toFixed(2) + ')" d="' + d + '"/>';
        // tiny accents between: dots and dashes, as WhatsApp's wallpaper has
        const acc = colors ? ' stroke="' + colors[(k + 2) % colors.length] + '"' : "";
        if (rnd() < .45) paths += '<circle' + acc + ' cx="' + (jx + 34).toFixed(1) + '" cy="' + (jy + 30).toFixed(1) + '" r="1.6"/>';
        else if (rnd() < .5) paths += '<path' + acc + ' d="M' + (jx + 30).toFixed(1) + " " + (jy + 36).toFixed(1) + "l6 -3" + '"/>';
      }
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + " " + S + '" fill="none" stroke="' + (colors ? colors[0] : stroke) + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29") + '")';
  };
  // More of Vault's own drawings, so the dense wallpaper rarely repeats itself
  const MORE = [
    "M9 21h6M10 17h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v1h5v-1c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",                       // bulb
    "M12 3c3 2.5 4.5 6 4.5 10l-2 3h-5l-2-3C7.5 9 9 5.5 12 3zM9.5 16l-2.5 4M14.5 16l2.5 4M12 9.5h0",                          // rocket
    "M4 18l2-11 4.5 5L12 5l1.5 7L18 7l2 11z",                                                                                 // crown
    "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M12 3v2",                                                              // clock
    "M12 5v15M7 20h10M5 13a7 7 0 0 0 14 0M9 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0",                                                   // anchor
    "M3 12c3-5 8-6 13-3l5-3v12l-5-3c-5 3-10 2-13-3zM8 11.5h0",                                                                // fish
    "M5 20V4M5 5c5-2 7 2 13 0v8c-6 2-8-2-13 0",                                                                               // flag
    "M12 21s6-6.2 6-11a6 6 0 0 0-12 0c0 4.8 6 11 6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",                         // pin
    "M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4",                                                                               // bell
    "M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7v15M20 5v13h-7",                                                         // book
    "M7 10l5-6 5 6-5 11zM7 10h10M12 4v17",                                                                                    // diamond
    "M8 21V9M8 9c0-3 2-5 4-5s4 2 4 5v12M4 13h4M16 11h4M4 13V9M20 11V7",                                                       // cactus
    "M8 11l4 10 4-10M7 11a5 5 0 0 1 10 0z",                                                                                   // ice cream
    "M4 7l8 14 8-14C15 4 9 4 4 7zM9 10h0M14 13h0M12 8h0",                                                                     // pizza
    "M5 16a3.5 3.5 0 1 0 0 .1M19 16a3.5 3.5 0 1 0 0 .1M5 16l4-7h7l3 7M9 9l3 7h4M14 6h3",                                       // bicycle
    "M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM11 12l9 9M17 18l2-2M15 16l2-2",                                                        // key
    "M3 10l9-6 9 6M5 10v10h14V10M10 20v-6h4v6",                                                                               // house
    "M12 12c-3-5-8-4-8 0s5 5 8 0zM12 12c3-5 8-4 8 0s-5 5-8 0zM12 9v9",                                                        // butterfly
    "M5 3v18M5 4h11l-2 4 2 4H5",                                                                                              // pennant
    "M9 4v11a3 3 0 1 1-2-2.8M9 4l9-1v3l-9 1",                                                                                 // note
    "M3 18c3 0 3-3 6-3s3 3 6 3 3-3 6-3M3 12c3 0 3-3 6-3s3 3 6 3 3-3 6-3",                                                     // waves
    "M7 4h10v5a5 5 0 0 1-10 0zM12 14v4M8 21h8M7 6H4c0 3 1.5 4 3 4M17 6h3c0 3-1.5 4-3 4",                                       // trophy
    "M12 4c-4 4-6 8-6 11a6 6 0 0 0 12 0c0-3-2-7-6-11zM10 15a2 2 0 0 0 2 2",                                                   // drop
    "M4 12h4l2-6 4 12 2-6h4",                                                                                                 // pulse
  ];
  // Tiny fillers that pack the gaps between drawings, so the wallpaper reads dense and compounded
  const FILL = [
    "M0 0h0", "M-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0", "M-3 0h6M0-3v6", "M0-3l.9 2.1L3 0l-2.1.9L0 3l-.9-2.1L-3 0l2.1-.9z",
    "M-4 1c1.3-2 2.7-2 4 0s2.7 2 4 0", "M-3-1l3 3 3-3", "M-2.5 2L0-2l2.5 4z", "M-3 2l6-4", "M-2-2h4v4h-4z",
  ];
  // A WhatsApp-style wallpaper: one ink, drawings packed edge to edge at many sizes and angles, every gap filled
  V.wallpaper = (ink) => {
    const all = DOODLES.concat(MORE);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const S = 420, placed = [];
    let out = "";
    const free = (x, y, r) => placed.every(p => {
      let dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
      dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
      return dx * dx + dy * dy >= (p.r + r) * (p.r + r);
    });
    // draw at (x, y) and again across any edge it touches, so the tile repeats without seams
    const put = (svg, x, y, r) => {
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
        const X = x + ox, Y = y + oy;
        if (X + r < 0 || X - r > S || Y + r < 0 || Y - r > S) continue;
        out += svg(X, Y);
      }
    };
    let k = 0;
    // drawings, larger first
    for (let tries = 0; tries < 9000; tries++) {
      const sc = tries < 2500 ? .95 + rnd() * .4 : .62 + rnd() * .3;
      const r = 12 * sc + 1.5, x = rnd() * S, y = rnd() * S;
      if (!free(x, y, r)) continue;
      placed.push({ x, y, r });
      const d = all[(k++ * 11 + Math.floor(rnd() * 7)) % all.length], rot = Math.round(rnd() * 80 - 40);
      put((X, Y) => '<path transform="translate(' + X.toFixed(1) + " " + Y.toFixed(1) + ") rotate(" + rot + ") scale(" + sc.toFixed(2) + ') translate(-12 -12)" d="' + d + '"/>', x, y, r);
    }
    // fillers in whatever room is left
    for (let tries = 0; tries < 9000; tries++) {
      const r = 3.6, x = rnd() * S, y = rnd() * S;
      if (!free(x, y, r)) continue;
      placed.push({ x, y, r });
      const d = FILL[Math.floor(rnd() * FILL.length)], rot = Math.round(rnd() * 360);
      put((X, Y) => '<path transform="translate(' + X.toFixed(1) + " " + Y.toFixed(1) + ") rotate(" + rot + ')" d="' + d + '"/>', x, y, r);
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + " " + S + '" fill="none" stroke="' + ink + '" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">' + out + "</svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29") + '")';
  };
  function setDoodles() {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light" || document.documentElement.dataset.theme === "dark";
    document.documentElement.style.setProperty("--doodle", V.doodle(dark ? "rgba(233,237,239,0.075)" : "rgba(84,64,44,0.13)"));
    document.documentElement.style.setProperty("--doodle-light", V.doodle("rgba(37,211,102,0.28)"));
    document.documentElement.style.setProperty("--doodle-mask", V.doodle("#ffffff"));
    // the chat wallpaper: one ink, tone on tone with the ground, densely packed
    document.documentElement.style.setProperty("--doodle-color", V.wallpaper(dark ? "rgba(206,236,230,0.15)" : "rgba(74,96,88,0.17)"));
  }
  setDoodles();
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", setDoodles); } catch (e) { /* older browsers */ }

  // ---------- libraries, loaded the first time they're needed ----------
  const LIBS = { zip: "lib/jszip.min.js", docx: "lib/mammoth.browser.min.js", xlsx: "lib/xlsx.core.min.js", pdf: "lib/pdf.min.js" };
  const loading = {};
  V.lib = (name) => loading[name] || (loading[name] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIBS[name];
    s.onload = () => {
      if (name === "pdf" && window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
      resolve({ zip: window.JSZip, docx: window.mammoth, xlsx: window.XLSX, pdf: window.pdfjsLib }[name]);
    };
    s.onerror = () => { delete loading[name]; reject(new Error("couldn't load " + name)); };
    document.head.appendChild(s);
  }));

  // ---------- storage: IndexedDB on this device (memory if it isn't available) ----------
  V.store = (() => {
    let dbp = null;
    const memory = new Map();
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve) => {
        try {
          const req = indexedDB.open("vault", 1);
          req.onupgradeneeded = () => req.result.createObjectStore("items", { keyPath: "id" });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
      return dbp;
    }
    async function tx(mode, fn) {
      const db = await open();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        try {
          const t = db.transaction("items", mode);
          const req = fn(t.objectStore("items"));
          t.oncomplete = () => resolve(req && "result" in req ? req.result : null);
          t.onerror = () => reject(t.error);
        } catch (e) { reject(e); }
      });
    }
    return {
      async all() {
        try { return (await tx("readonly", (s) => s.getAll())) || [...memory.values()]; } catch (e) { return [...memory.values()]; }
      },
      async put(item) {
        memory.set(item.id, item);
        try { await tx("readwrite", (s) => s.put(item)); } catch (e) { /* kept for this visit */ }
      },
      async putMany(list) {
        list.forEach((i) => memory.set(i.id, i));
        try { await tx("readwrite", (s) => { let r = null; for (const i of list) r = s.put(i); return r; }); } catch (e) { /* kept for this visit */ }
      },
      async remove(id) {
        memory.delete(id);
        try { await tx("readwrite", (s) => s.delete(id)); } catch (e) { /* gone from memory at least */ }
      },
    };
  })();

  V.items = [];
  const thumbs = new Map(), blobs = new Map();
  V.thumbURL = (it) => {
    if (it.thumbData) return it.thumbData;
    if (!it.thumb) return "";
    if (!thumbs.has(it.id)) thumbs.set(it.id, URL.createObjectURL(it.thumb));
    return thumbs.get(it.id);
  };
  V.blobURL = (it) => {
    if (!it.blob) return "";
    if (!blobs.has(it.id)) blobs.set(it.id, URL.createObjectURL(it.blob));
    return blobs.get(it.id);
  };
  V.forget = (id) => {
    for (const m of [thumbs, blobs]) if (m.has(id)) { URL.revokeObjectURL(m.get(id)); m.delete(id); }
  };
  V.save = async (list) => {
    list = Array.isArray(list) ? list : [list];
    await V.store.putMany(list);
    for (const it of list) {
      const i = V.items.findIndex((x) => x.id === it.id);
      if (i >= 0) V.items[i] = it; else V.items.push(it);
    }
  };
  V.remove = async (ids) => {
    ids = Array.isArray(ids) ? ids : [ids];
    for (const id of ids) { await V.store.remove(id); V.forget(id); }
    V.items = V.items.filter((x) => !ids.includes(x.id));
  };
  V.of = (section, kind) => V.items.filter((it) => it.section === section && (!kind || it.kind === kind));

  // ---------- thumbnails ----------
  V.thumbnail = (blob, kind, maxSide = 540) => new Promise((resolve) => {
    const src = URL.createObjectURL(blob);
    const finish = (el, w, h, duration) => {
      try {
        const c = document.createElement("canvas");
        const k = Math.min(1, maxSide / Math.max(1, w, h));
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(src); resolve({ thumb: b, duration, w, h }); }, "image/jpeg", .82);
      } catch (e) { URL.revokeObjectURL(src); resolve({ thumb: null, duration, w, h }); }
    };
    if (kind === "image") {
      const img = new Image();
      img.onload = () => finish(img, img.naturalWidth, img.naturalHeight, 0);
      img.onerror = () => { URL.revokeObjectURL(src); resolve({ thumb: null, duration: 0, w: 0, h: 0 }); };
      img.src = src;
    } else {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto";
      let settled = false;
      const end = (r) => { if (settled) return; settled = true; clearTimeout(timer); r(); };
      const timer = setTimeout(() => end(() => { URL.revokeObjectURL(src); resolve({ thumb: null, duration: v.duration || 0, w: 9, h: 16 }); }), 8000);
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 4); };
      v.onseeked = () => end(() => finish(v, v.videoWidth || 9, v.videoHeight || 16, v.duration));
      v.onerror = () => end(() => { URL.revokeObjectURL(src); resolve({ thumb: null, duration: 0, w: 0, h: 0 }); });
      v.src = src;
    }
  });

  // ---------- sections ----------
  // Each section registers: id, name, view (element id), render(el), door() (home HTML),
  // and the destinations it takes files into.
  V.sections = {};
  V.order = [];
  V.register = (s) => { V.sections[s.id] = s; V.order.push(s.id); };
  V.dests = [];   // { id, name, sub, cls, section, accepts(files) -> score, import(files, extra) }
  V.dest = (d) => V.dests.push(d);

  V.current = "hub";
  V.show = (view, animate) => {
    const go = () => {
      V.current = view;
      $("#hub").hidden = view !== "hub";
      for (const id of V.order) $("#" + V.sections[id].view).hidden = view !== id;
      $("#fab").hidden = view !== "hub";
      V.render();
      window.scrollTo(0, 0);
    };
    if (animate && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(go);
    else go();
  };
  V.go = (id) => { location.hash = id === "hub" ? "" : id; };
  function route() {
    const h = location.hash.replace("#", "");
    const view = V.sections[h] ? h : "hub";
    if (view !== V.current) { V.closeAll(); V.show(view, true); }
  }
  addEventListener("hashchange", route);

  V.render = () => {
    renderHub();
    const s = V.sections[V.current];
    if (s) s.render($("#" + s.view));
    V.$$(".door, .mini, .of-hero").forEach((d) => { if (!d.querySelector(":scope > .spot")) d.insertAdjacentHTML("beforeend", '<span class="spot" aria-hidden="true"></span>'); });
  };

  // Doors and heroes lean toward your finger or pointer, with a light that follows it.
  (() => {
    let cur = null;
    const set = (el, e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const k = el.classList.contains("of-hero") ? 4 : 7;
      el.style.setProperty("--ry", ((x - .5) * k).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((.5 - y) * k).toFixed(2) + "deg");
      el.style.setProperty("--px", (x - .5).toFixed(3));
      el.style.setProperty("--py", (y - .5).toFixed(3));
      el.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    };
    const reset = (el) => { if (!el) return; el.classList.remove("tilting"); ["--rx", "--ry", "--px", "--py"].forEach((v) => el.style.removeProperty(v)); };
    const calmNow = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    addEventListener("pointermove", (e) => {
      if (calmNow()) return;
      const el = e.target.closest && e.target.closest(".door, .mini, .of-hero");
      if (el !== cur) { reset(cur); cur = el; }
      if (!el) return;
      el.classList.add("tilting");
      set(el, e);
    }, { passive: true });
    addEventListener("pointerdown", (e) => {
      if (calmNow()) return;
      const el = e.target.closest && e.target.closest(".door, .mini, .of-hero");
      if (!el) return;
      reset(cur); cur = el; el.classList.add("tilting"); set(el, e);
    }, { passive: true });
    const end = () => { reset(cur); cur = null; };
    addEventListener("pointerup", end, { passive: true });
    addEventListener("pointercancel", end, { passive: true });
    addEventListener("pointerleave", end, { passive: true });
    addEventListener("scroll", end, { passive: true });
  })();

  function renderHub() {
    const big = V.order.filter((id) => V.sections[id].big);
    const small = V.order.filter((id) => !V.sections[id].big);
    $("#doors").innerHTML = big.map((id) => V.sections[id].door()).join("") +
      '<div class="minis">' + small.map((id) => V.sections[id].door()).join("") + "</div>";
    const total = V.items.filter((it) => !it.child).length;
    $("#hubNote").textContent = total ? nf.format(total) + " saved on this device" : "Everything kept on this device";
    $("#hubHint").hidden = total > 0;
  }
  V.count = (n, one, many) => "<b>" + nf.format(n) + "</b>" + (n === 1 ? one : many);

  // ---------- sheets ----------
  V.sheet = (html, onReady) => {
    const s = $("#scrim");
    s.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>' + html + "</div>";
    s.hidden = false;
    onReady && onReady($(".sheet", s));
  };
  V.closeSheet = () => { $("#scrim").hidden = true; $("#scrim").innerHTML = ""; };
  V.confirm = (title, text, label, danger) => new Promise((resolve) => {
    V.sheet("<h2>" + V.esc(title) + "</h2>" + (text ? "<p>" + V.esc(text) + "</p>" : "") +
      '<div class="actions"><button class="btn" id="cNo">Cancel</button><button class="btn ' + (danger ? "danger" : "primary") + '" id="cYes">' + V.esc(label) + "</button></div>",
      (el) => {
        $("#cNo", el).onclick = () => { V.closeSheet(); resolve(false); };
        $("#cYes", el).onclick = () => { V.closeSheet(); resolve(true); };
      });
  });

  // ---------- full-screen layers (player, chat, reader) ----------
  const layers = [];
  V.layer = (el, onClose) => {
    layers.push({ el, onClose });
    document.body.style.overflow = "hidden";
    return () => V.closeLayer(el);
  };
  V.closeLayer = (el) => {
    const i = layers.findIndex((l) => l.el === el);
    if (i < 0) return;
    const [l] = layers.splice(i, 1);
    try { l.onClose && l.onClose(); } catch (e) { /* keep closing */ }
    l.el.remove();
    if (!layers.length) document.body.style.overflow = "";
  };
  V.closeTop = () => {
    if (!$("#scrim").hidden) { V.closeSheet(); return true; }
    if (layers.length) { V.closeLayer(layers[layers.length - 1].el); return true; }
    return false;
  };
  V.closeAll = () => { V.closeSheet(); while (layers.length) V.closeLayer(layers[layers.length - 1].el); };
  // The Android app asks this when its back button is pressed: true if Vault handled it.
  V.back = () => {
    if (V.closeTop()) return true;
    if (V.current !== "hub") { V.go("hub"); return true; }
    return false;
  };
  addEventListener("keydown", (e) => { if (e.key === "Escape") V.closeTop(); });

  // ---------- adding files ----------
  let staged = [];
  V.addSheet = (files, prefer) => {
    staged = files || [];
    const scores = V.dests.map((d) => ({ d, s: staged.length ? d.accepts(staged) : 0 }));
    let pick = prefer && V.dests.find((d) => d.id === prefer);
    // The files decide, unless the place asked for takes them too.
    if (staged.length && (!pick || !(scores.find((x) => x.d === pick).s > 0))) pick = [...scores].sort((a, b) => b.s - a.s)[0].d;
    if (!pick) pick = V.dests.find((d) => d.section === V.current) || V.dests[0];
    V.sheet(
      "<h2>Add to Vault</h2>" +
      '<div class="dest" role="radiogroup" aria-label="Where to keep them">' +
      V.dests.map((d) => '<label class="' + d.cls + '"><input type="radio" name="dest" id="dest-' + d.id + '" value="' + d.id + '"' + (d === pick ? " checked" : "") + ">" + V.esc(d.name) + "<span>" + V.esc(d.sub) + "</span></label>").join("") +
      "</div>" +
      '<button class="pick" id="pick">' + (staged.length ? "Choose different files" : "Choose files") + "<small>" +
      (staged.length ? staged.length + (staged.length === 1 ? " file ready" : " files ready") : "Or drag them in on a computer") + "</small></button>" +
      '<div class="staged" id="staged"></div>' +
      '<div id="extra"></div>' +
      '<div class="progress" id="addProg" hidden><i></i></div>' +
      '<div class="actions"><button class="btn" id="addCancel">Cancel</button><button class="btn primary" id="addGo"' + (staged.length ? "" : " disabled") + ">Add</button></div>",
      (el) => {
        const box = $("#staged", el);
        staged.slice(0, 14).forEach((f) => {
          const s = document.createElement("span");
          if (/^image\//.test(f.type)) s.style.backgroundImage = "url(" + URL.createObjectURL(f) + ")";
          else s.textContent = V.ext(f.name) || "file";
          box.appendChild(s);
        });
        const extra = () => {
          const d = V.dests.find((x) => x.id === $('input[name="dest"]:checked', el).value);
          $("#extra", el).innerHTML = d.fields ? d.fields() : "";
        };
        extra();
        V.$$('input[name="dest"]', el).forEach((r) => r.addEventListener("change", extra));
        $("#pick", el).onclick = () => $("#files").click();
        $("#addCancel", el).onclick = V.closeSheet;
        $("#addGo", el).onclick = async () => {
          const d = V.dests.find((x) => x.id === $('input[name="dest"]:checked', el).value);
          const go = $("#addGo", el);
          go.disabled = true;
          const bar = $("#addProg", el); bar.hidden = false;
          const progress = (f) => { $("i", bar).style.width = Math.round(f * 100) + "%"; };
          let result;
          try { result = await d.import(staged, el, progress); } catch (e) { result = { added: 0, failed: staged.length, msg: e.message }; }
          V.closeSheet();
          V.toast(result.msg || ("Added " + result.added + (result.failed ? ", " + result.failed + " couldn't be read" : "")));
          if (V.current !== d.section) V.go(d.section); else V.render();
          V.render();
        };
      }
    );
  };

  $("#files").addEventListener("change", (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    const sel = $('#scrim input[name="dest"]:checked');
    V.addSheet(files, sel ? sel.value : null);
  });
  let dragDepth = 0;
  addEventListener("dragenter", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { dragDepth++; $("#drop").hidden = false; } });
  addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop").hidden = true; } });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; $("#drop").hidden = true;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) V.addSheet(files, null);
  });
  $("#fab").addEventListener("click", () => V.addSheet([], null));
  $("#scrim").addEventListener("click", (e) => { if (e.target.id === "scrim") V.closeSheet(); });

  // Files handed over by the Android app's share sheet: it serves them at vault-share/<n>.
  V.receiveShared = async (list, dest) => {
    const files = [];
    for (const f of list || []) {
      try {
        const r = await fetch(f.url);
        const b = await r.blob();
        files.push(new File([b], f.name || "shared", { type: f.type || b.type || "" }));
      } catch (e) { /* skip unreadable */ }
    }
    if (!files.length) return;
    // Saved from inside the app (OneDrive downloads): straight in, no questions
    const d = dest && V.dests.find((x) => x.id === dest);
    if (d) {
      let r;
      try { r = await d.import(files, null, () => {}); } catch (e) { r = { msg: "Couldn't save " + files[0].name }; }
      V.toast(r.msg || "Saved");
      V.render();
      return;
    }
    V.addSheet(files, null);
  };

  // ---------- readers: documents, sheets, PDFs, pictures ----------
  // Opening grows the layer out of the card that was tapped; closing shrinks it back into it.
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clipFor = (r) => "inset(" + Math.max(0, r.top) + "px " + Math.max(0, innerWidth - r.right) + "px " + Math.max(0, innerHeight - r.bottom) + "px " + Math.max(0, r.left) + "px round 22px)";
  V.zoomIn = (el, from) => {
    if (!from || calm() || !el.animate) return;
    const r = from.getBoundingClientRect();
    el._from = r;
    el.animate([{ clipPath: clipFor(r), opacity: .55 }, { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.2,.85,.2,1)" });
  };
  V.zoomOut = (el) => {
    if (!el._from || calm() || !el.animate) { V.closeLayer(el); return; }
    const a = el.animate([{ clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 }, { clipPath: clipFor(el._from), opacity: .3 }], { duration: 300, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" });
    a.onfinish = () => V.closeLayer(el);
  };
  V.reader = (title, sub, accent, opts) => {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "reader" + (opts.theme ? " reader-" + opts.theme : "");
    el.innerHTML = '<div class="rhead"><button data-x aria-label="Back">' + V.I.back + '</button><div style="min-width:0"><div class="nm">' + V.esc(title) +
      '</div><div class="sub">' + V.esc(sub || "") + '</div></div><div class="racts"></div></div><div class="rbar"><i style="background:' + (accent || "#888") + '"></i></div><div class="rbody"></div>';
    document.body.appendChild(el);
    V.layer(el);
    V.zoomIn(el, opts.from);
    $("[data-x]", el).onclick = () => V.zoomOut(el);
    const body = $(".rbody", el);
    body.addEventListener("scroll", () => {
      const max = body.scrollHeight - body.clientHeight;
      $(".rbar i", el).style.width = (max > 0 ? body.scrollTop / max * 100 : 0) + "%";
    }, { passive: true });
    return { el, body, acts: $(".racts", el) };
  };

  V.showDocx = async (blob, body) => {
    body.innerHTML = '<div class="cant">Opening…</div>';
    try {
      const mammoth = await V.lib("docx");
      const r = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
      body.innerHTML = '<article class="docpage">' + (r.value || "<p>(This document is empty.)</p>") + "</article>";
    } catch (e) {
      body.innerHTML = '<div class="cant"><b>This document can\'t be shown here</b>It may be an older .doc file or protected. It\'s kept safe in Vault.</div>';
    }
  };
  V.docxText = async (blob) => {
    try {
      const mammoth = await V.lib("docx");
      const r = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
      return (r.value || "").replace(/\n{3,}/g, "\n\n").trim();
    } catch (e) { return ""; }
  };

  V.showPdf = async (blob, body) => {
    body.innerHTML = '<div class="cant">Opening…</div>';
    try {
      const pdfjs = await V.lib("pdf");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      body.innerHTML = "";
      const width = Math.min(body.clientWidth - 24, 900);
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = width / vp0.width * (window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const c = document.createElement("canvas");
        c.className = "pdfpage"; c.width = vp.width; c.height = vp.height;
        c.style.width = width + "px";
        body.appendChild(c);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        if (!body.isConnected) break;
      }
    } catch (e) {
      body.innerHTML = '<div class="cant"><b>This PDF can\'t be shown here</b>It may be protected. It\'s kept safe in Vault.</div>';
    }
  };
  V.pdfCover = async (blob) => {
    try {
      const pdfjs = await V.lib("pdf");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      const page = await doc.getPage(1);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 480 / vp0.width });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      let text = "";
      try { text = (await page.getTextContent()).items.map((i) => i.str).join(" ").slice(0, 400); } catch (e) { /* no text layer */ }
      return await new Promise((r) => c.toBlob((b) => r({ thumb: b, pages: doc.numPages, text }), "image/jpeg", .82));
    } catch (e) { return { thumb: null, pages: 0, text: "" }; }
  };

  V.showSheet = async (blob, el, body) => {
    body.innerHTML = '<div class="cant">Opening…</div>';
    let wb;
    try {
      const XLSX = await V.lib("xlsx");
      wb = XLSX.read(await blob.arrayBuffer(), { type: "array", cellFormula: true, cellDates: true });
    } catch (e) {
      body.innerHTML = '<div class="cant"><b>This workbook can\'t be shown here</b>It may be protected or an unusual format. It\'s kept safe in Vault.</div>';
      return;
    }
    const XLSX = window.XLSX;
    body.style.padding = "0";
    body.style.display = "flex"; body.style.flexDirection = "column"; body.style.overflow = "hidden";
    body.innerHTML = '<div class="fx"><span class="ref">A1</span><i>fx</i><span class="val"></span></div><div class="sheetwrap"></div><div class="sheettabs"></div>';
    const wrap = $(".sheetwrap", body), tabsEl = $(".sheettabs", body);
    tabsEl.innerHTML = wb.SheetNames.map((n, i) => '<button data-s="' + i + '"' + (i === 0 ? ' aria-current="true"' : "") + ">" + V.esc(n) + "</button>").join("");
    const ROWS = 300, COLS = 40;
    let shown = ROWS;
    const draw = (si) => {
      const ws = wb.Sheets[wb.SheetNames[si]];
      const ref = ws["!ref"] || "A1:A1";
      const rg = XLSX.utils.decode_range(ref);
      const lastR = Math.min(rg.e.r, rg.s.r + shown - 1), lastC = Math.min(rg.e.c, rg.s.c + COLS - 1);
      let h = '<table class="xl"><thead><tr><th></th>';
      for (let c = rg.s.c; c <= lastC; c++) h += '<th data-c="' + c + '">' + XLSX.utils.encode_col(c) + "</th>";
      h += "</tr></thead><tbody>";
      for (let r = rg.s.r; r <= lastR; r++) {
        h += '<tr><th data-r="' + r + '">' + (r + 1) + "</th>";
        for (let c = rg.s.c; c <= lastC; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          const txt = cell ? (cell.w != null ? cell.w : cell.v instanceof Date ? cell.v.toLocaleDateString() : cell.v) : "";
          h += '<td data-r="' + r + '" data-c="' + c + '"' + (cell && cell.t === "n" ? ' class="num"' : "") + ">" + V.esc(txt) + "</td>";
        }
        h += "</tr>";
      }
      h += "</tbody></table>";
      if (rg.e.r > lastR) h += '<button class="morerows" data-more>Showing ' + nf.format(lastR - rg.s.r + 1) + " of " + nf.format(rg.e.r - rg.s.r + 1) + " rows. Show more</button>";
      if (rg.e.c > lastC) h += '<div class="morerows">Showing the first ' + COLS + " columns.</div>";
      wrap.innerHTML = h;
      wrap.scrollTop = 0; wrap.scrollLeft = 0;
      wrap.onclick = (e) => {
        if (e.target.closest("[data-more]")) { shown += ROWS; draw(si); return; }
        const td = e.target.closest("td");
        if (!td) return;
        V.$$(".sel, .hl", wrap).forEach((x) => x.classList.remove("sel", "hl"));
        td.classList.add("sel");
        const r = +td.dataset.r, c = +td.dataset.c;
        const th1 = $('thead th[data-c="' + c + '"]', wrap), th2 = $('tbody th[data-r="' + r + '"]', wrap);
        th1 && th1.classList.add("hl"); th2 && th2.classList.add("hl");
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        $(".fx .ref", body).textContent = addr;
        $(".fx .val", body).textContent = cell ? (cell.f ? "=" + cell.f : (cell.w != null ? cell.w : String(cell.v))) : "";
      };
    };
    tabsEl.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      V.$$("button", tabsEl).forEach((x) => x.removeAttribute("aria-current"));
      b.setAttribute("aria-current", "true");
      shown = ROWS;
      draw(+b.dataset.s);
    };
    draw(0);
  };
  V.sheetPeek = async (blob) => {
    try {
      const XLSX = await V.lib("xlsx");
      const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", sheetRows: 6 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).slice(0, 5).map((r) => r.slice(0, 4).map((v) => String(v).slice(0, 18)));
      return { sheets: wb.SheetNames, peek: rows };
    } catch (e) { return { sheets: [], peek: [] }; }
  };

  V.showPicture = (it, body) => {
    body.innerHTML = '<div class="picview">' + (/^video\//.test(it.blob && it.blob.type || "") || it.kind === "video"
      ? '<video controls playsinline src="' + V.blobURL(it) + '"></video>'
      : '<img alt="" src="' + V.blobURL(it) + '">') + "</div>";
  };
  V.showText = async (blob, body) => {
    const t = await blob.text();
    body.innerHTML = '<div class="textnote"></div>';
    $(".textnote", body).textContent = t;
  };

  // Open any stored file in the right reader.
  V.openFile = (it, accent, opts) => {
    const e = V.ext(it.name), type = (it.blob && it.blob.type) || "";
    const r = V.reader(it.title || V.base(it.name) || "File", V.size(it.blob && it.blob.size) + (it.addedAt ? ", " + V.when(it.addedAt).toLowerCase() : ""), accent, opts);
    if (e === "pdf" || type === "application/pdf") V.showPdf(it.blob, r.body);
    else if (e === "docx") V.showDocx(it.blob, r.body);
    else if (["xlsx", "xlsm", "xls", "csv", "ods"].includes(e)) V.showSheet(it.blob, r.el, r.body);
    else if (/^(image|video)\//.test(type) || ["jpg", "jpeg", "png", "webp", "gif", "heic", "mp4", "mov", "webm", "3gp"].includes(e)) V.showPicture(it, r.body);
    else if (/^text\//.test(type) || ["txt", "md", "csv", "json", "log"].includes(e)) V.showText(it.blob, r.body);
    else r.body.innerHTML = '<div class="cant"><b>No preview for this kind of file</b>' + V.esc(it.name || "") + " is kept safe in Vault." +
      (V.android ? "" : "") + "</div>";
    return r;
  };

  // Delete with a confirm, shared by every section.
  V.askDelete = async (it, where, after) => {
    const ok = await V.confirm("Delete from Vault?", "This removes it from this device. " + (where ? "The original in " + where + " isn't touched." : ""), "Delete", true);
    if (!ok) return;
    const kids = V.items.filter((x) => x.parent === it.id).map((x) => x.id);
    await V.remove([it.id, ...kids]);
    V.toast("Deleted");
    after && after();
    V.render();
  };

  // ---------- start ----------
  V.start = async () => {
    try { V.items = (await V.store.all()).filter((it) => it && V.sections[it.section]); } catch (e) { V.items = []; }
    const h = location.hash.replace("#", "");
    V.current = "";
    V.show(V.sections[h] ? h : "hub", false);
    document.addEventListener("click", (e) => {
      const d = e.target.closest("[data-door]");
      if (d) V.go(d.dataset.door);
      const home = e.target.closest("[data-home]");
      if (home) V.go("hub");
    });
  };
})();
