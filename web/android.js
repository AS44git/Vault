/* Vault in the Android app: the bits only the phone can do. Loaded by app.html, never by the web page. */
(function () {
  const A = window.VaultAndroid;
  const V = window.Vault;
  if (!A || !V) return;
  const toBase64 = (blob) => new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = fail;
    r.readAsDataURL(blob);
  });
  V.android = {
    openOneDrive: () => A.openOneDrive(),
    // hand a kept file to another app on the phone (Samsung Notes, for its own files)
    openWith: async (it) => {
      if (!it || !it.blob) return;
      try { A.openWith(it.name || "file", it.blob.type || "", await toBase64(it.blob)); } catch (e) { V.toast("Couldn't open it"); }
    },
  };
  // tint the phone's status and navigation bars to whatever the screen shows at its edges
  const solid = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return getComputedStyle(document.body).backgroundColor || "rgb(0,0,0)";
  };
  let last = "";
  const tint = () => {
    const w = innerWidth / 2;
    const top = solid(document.elementFromPoint(w, 2) || document.body);
    const bottom = solid(document.elementFromPoint(w, innerHeight - 2) || document.body);
    const k = top + "|" + bottom;
    if (k !== last) { last = k; try { A.bars(top, bottom); } catch (e) { /* older app */ } }
  };
  V.android.retint = () => { last = ""; tint(); };
  setInterval(tint, 400);
  addEventListener("hashchange", () => setTimeout(tint, 60));
})();
