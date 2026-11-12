# Vault server

Keeps your Vault on a machine of yours, serves the web app from it, and syncs the phone app and
any browser. One program; set a password and start it:

    VAULT_PASSWORD='a long password' ./vault-server -addr :8080 -data /var/lib/vault

Windows (PowerShell):

    $env:VAULT_PASSWORD='a long password'; .\vault-server-windows.exe -addr :8080 -data C:\VaultData

Everything is stored under `-data` (items as JSON, their files as plain files, so it's easy to back up).

Use HTTPS when it's reachable from the internet. Caddy does it in one line, with a domain pointed at the machine:

    caddy reverse-proxy --from vault.example.com --to localhost:8080

Then in Vault (phone app or browser) tap **Sync**, enter the address and the password.
