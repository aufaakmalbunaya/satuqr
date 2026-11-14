#!/usr/bin/env python3
"""Deploy Worker satuqr-site (reverse proxy Pages -> satuqr.aufa.eu.cc).
Pola multipart PUT + surrogate, sama seperti backend/scripts/deploy-worker.py.
Tanpa binding, tanpa route workers.dev (custom domain yang dipakai).
"""
import json, uuid, urllib.request, urllib.error, sys
sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
from dynamic_credentials import add_surrogate_to_request

ACCOUNT_ID = "573c79d4a2fcdb56f167c6eba8537ce5"
SCRIPT_NAME = "satuqr-site"
SRC = '/home/hatch/workspace/satuqr/site-proxy/src/index.js'

with open(SRC, 'rb') as f:
    code = f.read()

metadata = {"main_module": "index.js", "compatibility_date": "2026-11-14", "bindings": []}
boundary = "----" + uuid.uuid4().hex
parts = []
parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n".encode() + json.dumps(metadata).encode() + b"\r\n")
parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"index.js\"; filename=\"index.js\"\r\nContent-Type: application/javascript+module\r\n\r\n".encode() + code + b"\r\n")
parts.append(f"--{boundary}--\r\n".encode())
body = b"".join(parts)

url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{SCRIPT_NAME}"
req = urllib.request.Request(url, data=body, method="PUT")
req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
add_surrogate_to_request(req, 'custom.cloudflare', allowed_hosts=['api.cloudflare.com'])
try:
    resp = urllib.request.urlopen(req, timeout=60)
    print(resp.read().decode()[:1500])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:1500]}", file=sys.stderr)
    sys.exit(1)
print(f"\nDeployed: {SCRIPT_NAME}")
