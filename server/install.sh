#!/usr/bin/env bash
# Installs the Vault server on an Ubuntu/Debian machine (an Oracle Cloud free server, a VPS...) with HTTPS.
#   curl -fsSL https://raw.githubusercontent.com/AS44git/Vault/main/server/install.sh | sudo bash -s -- vault.example.com 'your password'
# Before running: the domain must already point at this machine (a free one from duckdns.org works),
# and ports 80 and 443 must be open in the cloud firewall.
set -euo pipefail

DOMAIN="${1:-}"
PASSWORD="${2:-}"
if [ -z "$DOMAIN" ] || [ "${#PASSWORD}" -lt 8 ]; then
  echo "Usage: install.sh <domain> '<password of at least 8 characters>'" >&2
  exit 1
fi
case "$PASSWORD" in *\"*|*\\*|*\$*|*\'*) echo "Please use a password without quotes, backslashes or \$ signs." >&2; exit 1;; esac

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=amd64 ;;
  *) echo "Unsupported machine type $(uname -m)" >&2; exit 1 ;;
esac

echo "==> Downloading the Vault server ($ARCH)"
mkdir -p /opt/vault /var/lib/vault
curl -fL --retry 3 -o /opt/vault/vault-server.new "https://github.com/AS44git/Vault/releases/download/server/vault-server-linux-$ARCH"
chmod +x /opt/vault/vault-server.new
mv /opt/vault/vault-server.new /opt/vault/vault-server
id vault >/dev/null 2>&1 || useradd --system --home /var/lib/vault --shell /usr/sbin/nologin vault
chown -R vault:vault /var/lib/vault

umask 077
printf 'VAULT_PASSWORD="%s"\n' "$PASSWORD" > /etc/vault.env
chmod 600 /etc/vault.env

cat > /etc/systemd/system/vault.service <<'UNIT'
[Unit]
Description=Vault server
After=network-online.target

[Service]
User=vault
EnvironmentFile=/etc/vault.env
ExecStart=/opt/vault/vault-server -addr 127.0.0.1:8080 -data /var/lib/vault
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now vault
systemctl restart vault

echo "==> Installing Caddy (HTTPS)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
printf '%s {\n    reverse_proxy 127.0.0.1:8080\n}\n' "$DOMAIN" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

echo "==> Opening ports 80 and 443 on this machine"
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save || true
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then ufw allow 80/tcp; ufw allow 443/tcp; fi

echo
echo "Done. Open https://$DOMAIN in a browser and sign in with your password."
echo "(The first time, HTTPS can take a minute to be ready.)"
