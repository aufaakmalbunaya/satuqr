#!/usr/bin/env python3
"""Deploy Worker satuqr-backend via Cloudflare API (akun Lutfiharis).
Pola sama dengan deploy-worker.py aufa-qris: multipart PUT + surrogate
exchange, token asli tidak pernah dicetak atau disimpan.

Pemakaian:
  SATUQR_KV_ID=<id dari create-kv.py> \
  MERCHANT_NEAR_ACCOUNT=<akun.near merchant, opsional> \
  python3 scripts/deploy-worker.py

Tanpa MERCHANT_NEAR_ACCOUNT, Worker tetap deploy: dry quote jalan dengan
fallback intents.near, live quote menolak dengan pesan yang jelas.
ALLOW_LIVE selalu "0" di deploy ini (dry-run saja).
Setelah deploy, script mengaktifkan route workers.dev.
"""
import os, sys, json, uuid, urllib.request, urllib.error
sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
from dynamic_credentials import add_surrogate_to_request

ACCOUNT_ID = "573c79d4a2fcdb56f167c6eba8537ce5"
SCRIPT_NAME = "satuqr-backend"
KV_ID = os.environ.get("SATUQR_KV_ID", "")
MERCHANT = os.environ.get("MERCHANT_NEAR_ACCOUNT", "")

if not KV_ID:
    print("SATUQR_KV_ID belum diset. Jalankan scripts/create-kv.py dulu.", file=sys.stderr)
    sys.exit(1)

SRC_DIR = '/home/hatch/workspace/satuqr/backend/src'
MODULES = ["index.js", "qris.js", "oneclick.js", "fx.js", "store.js"]

bindings = [{"type": "kv_namespace", "name": "SATUQR_KV", "namespace_id": KV_ID}]
bindings.append({"type": "plain_text", "name": "ALLOW_LIVE", "text": "0"})
if MERCHANT:
    bindings.append({"type": "plain_text", "name": "MERCHANT_NEAR_ACCOUNT", "text": MERCHANT})

metadata = {
    "main_module": "index.js",
    "compatibility_date": "2026-11-14",
    "bindings": bindings,
}

boundary = "----" + uuid.uuid4().hex
parts = []
parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n".encode() + json.dumps(metadata).encode() + b"\r\n")
for mod in MODULES:
    with open(f"{SRC_DIR}/{mod}", 'rb') as f:
        code = f.read()
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{mod}\"; filename=\"{mod}\"\r\nContent-Type: application/javascript+module\r\n\r\n".encode()
        + code + b"\r\n"
    )
parts.append(f"--{boundary}--\r\n".encode())
body = b"".join(parts)

url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT_NAME}"
req = urllib.request.Request(url, data=body, method="PUT")
req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
add_surrogate_to_request(req, 'custom.cloudflare', allowed_hosts=['api.cloudflare.com'])
try:
    resp = urllib.request.urlopen(req, timeout=60)
    print(resp.read().decode()[:2000])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:2000]}", file=sys.stderr)
    sys.exit(1)

# Aktifkan route workers.dev (seperti perbaikan aufa-qris dulu).
sub_url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT_NAME}/subdomain"
sub_req = urllib.request.Request(sub_url, data=json.dumps({"enabled": True}).encode(), method="POST")
sub_req.add_header("Content-Type", "application/json")
add_surrogate_to_request(sub_req, 'custom.cloudflare', allowed_hosts=['api.cloudflare.com'])
try:
    sub_resp = urllib.request.urlopen(sub_req, timeout=60)
    print(sub_resp.read().decode()[:500])
except urllib.error.HTTPError as e:
    print(f"Subdomain HTTP {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
    print("Deploy script berhasil, tapi route workers.dev belum aktif. Aktifkan manual di dashboard.", file=sys.stderr)

print(f"\nLive di: https://{SCRIPT_NAME}.qriscode.workers.dev/health (cek subdomain di dashboard bila URL berbeda)")
