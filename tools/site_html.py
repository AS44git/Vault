"""Builds _site/, the Vault web app for hosting (GitHub Pages): web/index.html made into a full page,
plus the app's files, a web manifest (so it can be added to a home screen) and icons."""
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent.parent
web = root / "web"
out = root / "_site"
if out.exists():
    shutil.rmtree(out)
out.mkdir()

body = (web / "index.html").read_text(encoding="utf-8")
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<link rel="manifest" href="manifest.webmanifest">\n'
        '<link rel="icon" href="icon-192.png">\n'
        '<link rel="apple-touch-icon" href="icon-192.png">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n')
cut = body.index('<main id="hub"')
page = head + body[:cut] + "</head>\n<body>\n" + body[cut:] + "</body>\n</html>\n"
(out / "index.html").write_text(page, encoding="utf-8")

for name in ("vault.css", "core.js", "whatsapp.js", "social.js", "office.js"):
    shutil.copy(web / name, out / name)
shutil.copytree(web / "lib", out / "lib")

from PIL import Image
mark = Image.open(root / "app/src/main/res/drawable-nodpi/ic_vault_mark.png").convert("RGBA")
flat = Image.new("RGBA", mark.size, (255, 255, 255, 255))
flat.alpha_composite(mark)
for size in (192, 512):
    flat.convert("RGB").resize((size, size), Image.LANCZOS).save(out / f"icon-{size}.png")

(out / "manifest.webmanifest").write_text(json.dumps({
    "name": "Vault", "short_name": "Vault", "start_url": "./", "scope": "./",
    "display": "standalone", "background_color": "#ffffff", "theme_color": "#000000",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}],
}, indent=2), encoding="utf-8")
(out / ".nojekyll").write_text("", encoding="utf-8")
print("_site written:", ", ".join(sorted(p.name for p in out.iterdir())))
