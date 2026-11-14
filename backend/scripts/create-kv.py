#!/usr/bin/env python3
"""Buat KV namespace SatuQR via Cloudflare API (akun Lutfiharis).
Pakai surrogate exchange dari connector custom.cloudflare; token asli
tidak pernah dicetak atau disimpan. Cetak namespace id untuk dipakai
scripts/deploy-worker.py dan wrangler.toml.
"""
import sys, json, urllib.request, urllib.error
sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
from dynamic_credentials import add_surrogate_to_request

ACCOUNT_ID = "573c79d4a2fcdb56f167c6eba8537ce5"

url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/storage/kv/namespaces"
req = urllib.request.Request(url, data=json.dumps({"title": "satuqr"}).encode(), method="POST")
req.add_header("Content-Type", "application/json")
add_surrogate_to_request(req, 'custom.cloudflare', allowed_hosts=['api.cloudflare.com'])
try:
    resp = urllib.request.urlopen(req, timeout=60)
    data = json.loads(resp.read().decode())
    print("KV namespace id:", data["result"]["id"])
    print("Judul:", data["result"]["title"])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:2000]}", file=sys.stderr)
    sys.exit(1)
