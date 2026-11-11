"""Builds web/app.html, the page the Android app opens, from web/index.html (the page the preview publishes)."""
from pathlib import Path

web = Path(__file__).resolve().parent.parent / "web"
body = (web / "index.html").read_text(encoding="utf-8")
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
body = body.replace("<script>Vault.start();</script>",
                    '<script src="android.js"></script>\n<script>Vault.ready = Vault.start();</script>')
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n')
# index.html starts with the head's contents and runs straight on into the body
cut = body.index('<main id="hub"')
page = head + body[:cut] + "</head>\n<body>\n" + body[cut:] + "</body>\n</html>\n"
(web / "app.html").write_text(page, encoding="utf-8")
print("web/app.html written")
