# Vault

Keeps TikTok reposts, Instagram reposts, WhatsApp chat backups, Word and Excel files, Samsung Notes and OneDrive files on your phone, each section dressed like its own app.

- `web/` is the app itself (the same page as the preview). `web/app.html` is made from `web/index.html` at build time.
- `app/` is the Android shell: it opens `web/` from inside the APK, takes files from the share sheet, and opens OneDrive signed in, saving downloads into Vault.
- Everything stays on the phone, in the app's own storage. Uninstalling the app deletes it.

Builds run on every push to `main` (Actions, artifact `vault-apk`). Signing uses the `KEYSTORE_BASE64` and `KEYSTORE_PASS` secrets. Put a square `icon.png` at the top of the repo to use your own launcher icon.
