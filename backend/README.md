# SatuQR backend

One QR for rupiah and crypto. A merchant shows one QR. A local customer pays rupiah with GoPay or DANA. A crypto customer pays USDC from any chain. The merchant receives USDC on NEAR.

This backend is a Cloudflare Worker with zero dependencies. It stores invoices in KV. It asks NEAR Intents 1Click for swap quotes. It builds dynamic QRIS payloads.

## Live demo (do X, see Y)

Base URL after deploy: `https://satuqr-backend.qriscode.workers.dev`

1. Check health. `curl https://satuqr-backend.qriscode.workers.dev/health`
   See `ok: true` and `liveEnabled: false`.
2. Create an invoice. `curl -X POST .../api/invoices -d '{"merchant":"Kopi Senja","amountIdr":50000}'`
   See `usdc`, the live USD to IDR rate, and `qrPayload` with `qrDemo: true`.
3. Ask a dry quote. `curl -X POST .../api/invoices/<id>/quote -d '{"originAsset":"nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near","refundTo":"<your Solana address>"}'`
   See `dry: true`, `fees.amountIn`, `fees.amountOut`, and `fees.amountInUsd` next to `fees.amountOutUsd`. No deposit address appears. No funds move.
4. Check status. `curl .../api/invoices/<id>/status`
   See `live: false` and `status: pending`, with the note that this is a dry quote only.

## Endpoints

- `GET /health`
- `GET /api/assets` (origin assets the customer can pay with, plus USDC on NEAR)
- `POST /api/invoices` (`merchant`, `city?`, `amountIdr`, `note?`, `qrisStatic?`)
- `GET /api/invoices/:id`
- `POST /api/invoices/:id/quote` (`originAsset`, `refundTo`, `live?`)
- `GET /api/invoices/:id/status`
- `POST /api/invoices/:id/mark-paid` (`method: "qris"`, `reference?`)
- `GET /api/merchant/invoices`
- `GET /api/merchant/invoices.csv`

## How the money works

- Invoice math: the backend reads the USD to IDR rate from Frankfurter (ECB reference rates, free, no key) and caches it for one hour. It converts the rupiah amount to USDC base units (6 decimals).
- Quote: the backend asks 1Click for an `EXACT_OUTPUT` quote. The merchant receives exactly the invoice amount in USDC on NEAR. The quote answers what the customer must deposit (`amountIn`, with the slippage buffer) and the floor (`minAmountIn`). The gap between `amountInUsd` and `amountOutUsd` is the solver spread plus the platform fee. Nothing is hidden.
- 1Click fee: 20 bps with an API key, 1 bp for stablecoin pairs. Without a key, 25 bps. These numbers come from the 1Click fee docs.
- Dry is the default. A live quote needs `live: true` in the body AND `ALLOW_LIVE=1` on the server. Without both, no deposit address is issued and no funds can move.
- There is no testnet for Intents. Live quotes run on mainnet with real funds. Use tiny amounts.

## QRIS, honestly

- With `qrisStatic` (the merchant's own printed QRIS string), the backend parses the EMVCo payload, sets the initiation method to dynamic (`12`), injects the amount, updates the merchant name and city, and recomputes the CRC16. It rejects strings that are not QRIS payloads.
- Without `qrisStatic`, the backend builds a demo payload whose merchant account is literally `DEMO`. The response sets `qrDemo: true`. No one can mistake it for a real merchant QRIS.
- The rupiah leg has no live acquirer in this demo. The merchant marks a QRIS payment paid by hand (`mark-paid`). The crypto leg is confirmed on-chain only, through the 1Click status endpoint.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `MERCHANT_NEAR_ACCOUNT` | For live quotes | The NEAR account that receives USDC. It must exist: 1Click rejects unknown recipients. Dry quotes fall back to `intents.near` and flag `recipientDemo: true`. |
| `ALLOW_LIVE` | No, default `0` | Set `1` only for a live demo with tiny amounts. |
| `ONECLICK_API_KEY` | No | `X-API-Key` for 1Click. Without it the fee is 25 bps. |
| `ADMIN_PASSWORD` | No | When set, the merchant list, the CSV export, and `mark-paid` need header `X-Admin-Password`. |

## Deploy

```sh
python3 scripts/create-kv.py
# Copy the printed id, then:
SATUQR_KV_ID=<id> MERCHANT_NEAR_ACCOUNT=<akun.near> python3 scripts/deploy-worker.py
```

The deploy script uses the same Cloudflare API pattern as the aufa-qris worker. It also enables the `workers.dev` route. Put the printed KV id into `wrangler.toml` for local `wrangler dev` use.

## Tests

```sh
npm test
```

14 tests, no network in the unit tests: CRC16 vectors, QRIS inject and demo payloads, 1Click quote and error paths, and the full handler flow with mocked KV and fetch. A live end-to-end dry quote was verified against the real 1Click API and Frankfurter on 2026-11-14: Rp50.000 at rate 18245 became 2.740477 USDC, and the dry quote returned amountIn 2768461 for amountOut 2740477.

## What this backend reuses (baseline, per HACKATHON.md Q-003/Q-005)

- The Cloudflare Worker shape, the KV pattern, and the API deploy script come from the aufa-qris worker (2 Nov 2026), which is the author's own earlier code.
- The invoice ledger shape comes from the author's Jefri deposit flow.
- Everything SatuQR-specific (invoice math, QRIS inject, 1Click quote and status, merchant list and CSV) was built in the hackathon window.
