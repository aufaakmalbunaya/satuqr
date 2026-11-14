# SatuQR — One QR. Every way to pay.

A merchant in Indonesia shows one QR. A local customer pays rupiah with GoPay or DANA. A crypto customer pays USDC from any chain. The merchant receives USDC on NEAR. No customer needs a NEAR account. No merchant needs NEAR for gas.

Live demo: https://satuqr.pages.dev
Backend: https://satuqr-backend.qriscode.workers.dev

Track: Real-World Money (`realworld`), second track Unstoppable DeFi (`defi`).
Hackathon: NEAR Hackathon 2026, nearhackathon.com. Deadline 14 Nov 2026 23:59 UTC (15 Nov 2026 06:59 WIB).

## Try it now (do X, see Y)

You need only a browser. No account. No wallet.

1. Open https://satuqr.pages.dev
2. Type a merchant name, for example `Kopi Senja`, and an amount, for example `50000`.
3. Click the create invoice button. See one QR, one invoice ID, and the USDC value of Rp50.000.
4. Click the crypto pay option. Pick an origin asset, for example USDC on Solana.
5. Ask for a quote. See the exact deposit amount, the fee, and the rate before you pay.
6. Check the invoice status. See `pending` until the swap settles, then `paid`.

## Try the backend (do X, see Y)

Base URL: `https://satuqr-backend.qriscode.workers.dev`

1. Check health. `curl https://satuqr-backend.qriscode.workers.dev/health`
   See `ok: true`, `merchantConfigured: true`, `liveEnabled: false`.
2. Create an invoice. `curl -X POST https://satuqr-backend.qriscode.workers.dev/api/invoices -d '{"merchant":"Kopi Senja","amountIdr":50000}'`
   See `usdc`, the live USD to IDR rate, and `qrPayload` with `qrDemo: true`.
3. Ask a dry quote. `curl -X POST https://satuqr-backend.qriscode.workers.dev/api/invoices/<id>/quote -d '{"originAsset":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near","refundTo":"<your Solana address>"}'`
   See `dry: true`, `fees.amountIn`, `fees.amountOut`, and the USD values side by side. No deposit address appears. No funds move.
4. Check status. `curl https://satuqr-backend.qriscode.workers.dev/api/invoices/<id>/status`
   See `live: false` and `status: pending`, with the note that this is a dry quote only.

## How it works

- One invoice, two rails. The backend turns a rupiah amount into USDC with the Frankfurter rate (ECB reference rates, free, no key, cached one hour). It builds a dynamic QRIS payload from the merchant static QRIS string, or a DEMO payload when no static string is given.
- Crypto rail: NEAR Intents through the 1Click API. The quote is `EXACT_OUTPUT`. The merchant receives exactly the invoice amount in USDC on NEAR, at `satuqr.near`. The customer pays from any supported chain and token. The customer never holds NEAR. The merchant never holds NEAR for gas.
- Rupiah rail: the customer scans the same QR with GoPay, DANA, or a bank app. The merchant marks the invoice paid by hand in the dashboard. There is no live acquirer in this demo. See "Honest limits" below.
- Money math, shown before payment: 1Click fee is 20 bps with an API key, 1 bp for stablecoin pairs, 25 bps without a key. The gap between `amountInUsd` and `amountOutUsd` in the quote is the solver spread plus the platform fee. Nothing hides in the rate.
- Live example, verified 14 Nov 2026: Rp50.000 at rate 18245 became 2.740477 USDC. The dry quote returned amountIn 2768461 for amountOut 2740477.

## Repo layout

- `backend/` — Cloudflare Worker, zero dependencies. Invoices in KV. QRIS payload builder. 1Click quote and status. Merchant dashboard and CSV export. Its own README has the endpoint list and deploy steps.
- `frontend/` — Static page on Cloudflare Pages. Create invoice, QR, crypto pay, quote and fee detail, status check, mark paid, dashboard and CSV.

## Run it yourself

Backend:

```sh
cd backend
npm test
python3 scripts/create-kv.py
SATUQR_KV_ID=<id> MERCHANT_NEAR_ACCOUNT=<akun.near> python3 scripts/deploy-worker.py
```

Frontend: deploy `frontend/` to any static host. Set the API base URL in `frontend/app.js` if you use your own backend.

## Honest limits

- The rupiah rail uses the merchant static QRIS string that already exists. There is no live acquirer or bank integration. Settlement from crypto to rupiah is marked `simulated off-ramp` in the demo.
- Dry quote is the default. A live quote needs `live: true` in the request body AND `ALLOW_LIVE=1` on the server. Without both, no deposit address is issued and no funds can move. There is no Intents testnet, so live quotes run on mainnet with real funds. Use tiny amounts.
- QRIS MDR since 1 Oct 2026: micro merchants pay 0% up to Rp500.000, then 0.3% above that. Small, medium, and large merchants pay 0% up to Rp100.000, then 0.7% above that.
- `ADMIN_PASSWORD` is not set on the live demo, so the merchant list, CSV export, and mark-paid are open. Set it before real use.

## What is new in the hackathon window, and what is reused

Reused baseline, from the author's own earlier code:

- The Cloudflare Worker shape, the KV pattern, and the API deploy script come from the aufa-qris worker (2 Nov 2026).
- The invoice ledger shape comes from the author's Jefri deposit flow.

Built in the hackathon window:

- Invoice math (rupiah to USDC), QRIS dynamic inject and CRC16, 1Click quote and status, merchant list and CSV, and the whole frontend.

## Tests

```sh
cd backend && npm test
```

14 unit tests, no network: CRC16 vectors, QRIS inject and demo payloads, 1Click quote and error paths, and the full handler flow with mocked KV and fetch.

## Demo video script (60 to 90 seconds)

Record the phone screen on https://satuqr.pages.dev. No face needed. One take per scene.

1. (0-10s) Type `Kopi Senja`, Rp50.000. Tap create. Show the QR and the USDC value.
2. (10-30s) Tap pay with crypto. Pick USDC on Solana. Show the quote: deposit amount, fee, rate.
3. (30-55s) Show the status page. Explain in one line: the customer pays from any chain, the merchant receives USDC on NEAR, no NEAR account needed.
4. (55-75s) Show the dashboard and CSV export. End on the live URL.

Keep the demo online until 25 Nov 2026. Judges check it after the deadline.

## Post on X (draft)

Satu QR for 42 million Indonesian merchants. Local customers pay rupiah with QRIS. Crypto customers pay USDC from any chain. The merchant receives USDC on NEAR, no NEAR account needed.

Live demo: https://satuqr.pages.dev
NEAR Hackathon 2026, Real-World Money track.

## Submit checklist

- [x] Backend live at https://satuqr-backend.qriscode.workers.dev
- [x] Frontend live at https://satuqr.pages.dev
- [x] Merchant NEAR account set: `satuqr.near`, verified on mainnet
- [x] README with do X, see Y steps
- [x] LICENSE (MIT)
- [ ] Public repo on GitHub (this folder is not a git repo yet: `git init`, push to github.com/aufaakmalbunaya/satuqr)
- [ ] Demo video 60-90 seconds, link in README and in the form
- [ ] Post the demo on X
- [ ] Submit at nearhackathon.com, tracks `realworld` + `defi`, before 15 Nov 2026 06:59 WIB
- [ ] Keep the demo online until 25 Nov 2026
