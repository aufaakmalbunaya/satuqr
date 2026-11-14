// SatuQR backend: one QR for rupiah and crypto.
// Cloudflare Worker, zero dependencies. KV binding SATUQR_KV.
//
// Endpoints (all JSON unless noted):
//   GET  /health
//   GET  /api/assets
//   POST /api/invoices                  { merchant, city?, amountIdr, note?, qrisStatic? }
//   GET  /api/invoices/:id
//   POST /api/invoices/:id/quote        { originAsset, refundTo, live? }
//   GET  /api/invoices/:id/status
//   POST /api/invoices/:id/mark-paid    { method: "qris", reference? }
//   GET  /api/merchant/invoices
//   GET  /api/merchant/invoices.csv
//
// Money rules, enforced here and in the README:
// - Dry quotes are the default. A live quote needs live: true in the body
//   AND ALLOW_LIVE=1 on the server. Without both, no deposit address is
//   issued and no funds can move.
// - The merchant NEAR account comes from env MERCHANT_NEAR_ACCOUNT. Live
//   mode refuses to run without it. Dry mode falls back to intents.near
//   (a real account, used only so the dry quote validates) and flags it.
// - The rupiah leg has no live acquirer in this demo. The merchant marks a
//   QRIS payment paid by hand; the crypto leg is confirmed on-chain only.
// - No secrets in code or in KV. ADMIN_PASSWORD, when set, guards the
//   merchant list, the CSV export, and mark-paid (header X-Admin-Password).

import { injectAmount, buildDemoPayload, isQrisPayload } from "./qris.js";
import { requestQuote, swapStatus, feeBreakdown, findOriginAsset, validRefundAddress, ORIGIN_ASSETS, OneClickError } from "./oneclick.js";
import { getUsdIdrRate } from "./fx.js";
import { newInvoiceId, saveInvoice, getInvoice, listInvoices, publicInvoice } from "./store.js";

const VERSION = "0.1.0";
const USDC_DECIMALS = 6;
const MIN_IDR = 1000;
const MAX_IDR = 100000000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function fail(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function adminOk(env, request) {
  if (!env.ADMIN_PASSWORD) return true;
  return request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD;
}

function cleanStr(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (path === "/health" && request.method === "GET") {
        return json({
          ok: true,
          service: "satuqr-backend",
          version: VERSION,
          time: new Date().toISOString(),
          merchantConfigured: !!env.MERCHANT_NEAR_ACCOUNT,
          liveEnabled: env.ALLOW_LIVE === "1",
        });
      }

      if (path === "/api/assets" && request.method === "GET") {
        return json({ assets: ORIGIN_ASSETS, destination: { symbol: "USDC", chain: "near", decimals: USDC_DECIMALS } });
      }

      if (path === "/api/invoices" && request.method === "POST") {
        return createInvoice(request, env);
      }

      const invMatch = path.match(/^\/api\/invoices\/([A-Za-z0-9_]+)(\/(quote|status|mark-paid))?$/);
      if (invMatch) {
        const [, id, , action] = invMatch;
        if (!action && request.method === "GET") {
          const inv = await getInvoice(env.SATUQR_KV, id);
          if (!inv) return fail("Invoice tidak ditemukan.", 404);
          return json({ invoice: publicInvoice(inv) });
        }
        if (action === "quote" && request.method === "POST") {
          return createQuote(request, env, id);
        }
        if (action === "status" && request.method === "GET") {
          return invoiceStatus(request, env, id);
        }
        if (action === "mark-paid" && request.method === "POST") {
          return markPaid(request, env, id);
        }
      }

      if (path === "/api/merchant/invoices" && request.method === "GET") {
        if (!adminOk(env, request)) return fail("Password admin salah.", 401);
        const items = await listInvoices(env.SATUQR_KV, 50);
        return json({ invoices: items.map(publicInvoice) });
      }

      if (path === "/api/merchant/invoices.csv" && request.method === "GET") {
        if (!adminOk(env, request)) return fail("Password admin salah.", 401);
        const items = await listInvoices(env.SATUQR_KV, 500);
        const head = "id,created_at,merchant,amount_idr,usdc,status,method,paid_at,tx_hash";
        const rows = items.map((i) => [
          i.id, i.createdAt || "", csvCell(i.merchant), i.amountIdr, i.usdc || "",
          i.status, (i.payment && i.payment.method) || "", (i.payment && i.payment.paidAt) || "",
          (i.payment && (i.payment.txHash || "")) || "",
        ].join(","));
        return new Response([head, ...rows].join("\n") + "\n", {
          headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="satuqr-invoices.csv"', ...corsHeaders() },
        });
      }

      return fail("Tidak ditemukan.", 404);
    } catch (err) {
      if (err instanceof OneClickError) {
        return fail(`1Click: ${err.message}`, 502, { correlationId: err.correlationId || null });
      }
      return fail(err.message || "Kesalahan server.", 500);
    }
  },
};

function csvCell(value) {
  const s = String(value || "").replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

async function createInvoice(request, env) {
  const body = await readBody(request);
  const merchant = cleanStr(body.merchant, 25);
  const city = cleanStr(body.city, 15) || "JAKARTA";
  const note = cleanStr(body.note, 140);
  const amountIdr = Number(body.amountIdr);
  if (!merchant || merchant.length < 2) {
    return fail("merchant wajib diisi, minimal 2 karakter.");
  }
  if (!Number.isInteger(amountIdr) || amountIdr < MIN_IDR || amountIdr > MAX_IDR) {
    return fail(`amountIdr harus bilangan bulat antara ${MIN_IDR} dan ${MAX_IDR}.`);
  }
  const qrisStatic = typeof body.qrisStatic === "string" ? body.qrisStatic.trim() : "";
  if (qrisStatic && !isQrisPayload(qrisStatic)) {
    return fail("qrisStatic bukan payload QRIS (field 26 tanpa GUI QRIS).");
  }

  const fx = await getUsdIdrRate(fetch, env.SATUQR_KV);
  const usd = amountIdr / fx.rate;
  const usdcBase = Math.round(usd * 10 ** USDC_DECIMALS);
  if (usdcBase < 1) {
    return fail("Nominal terlalu kecil untuk 1 unit terkecil USDC.");
  }

  let qrPayload;
  let qrDemo = false;
  if (qrisStatic) {
    qrPayload = injectAmount(qrisStatic, { amountIdr, merchantName: merchant, city });
  } else {
    qrPayload = buildDemoPayload({ amountIdr, merchantName: merchant, city });
    qrDemo = true;
  }

  const now = new Date().toISOString();
  const invoice = {
    id: newInvoiceId(),
    merchant,
    city,
    note: note || null,
    amountIdr,
    rate: fx.rate,
    rateDate: fx.date,
    rateCached: !!fx.cached,
    rateStale: !!fx.stale,
    usd: +usd.toFixed(6),
    usdc: +(usdcBase / 10 ** USDC_DECIMALS).toFixed(6),
    usdcBase,
    qrPayload,
    qrDemo,
    qrisStatic: qrisStatic || null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    lastQuote: null,
    liveDeposit: null,
    payment: null,
  };
  await saveInvoice(env.SATUQR_KV, invoice);
  return json({ invoice: publicInvoice(invoice) }, 201);
}

async function createQuote(request, env, id) {
  const inv = await getInvoice(env.SATUQR_KV, id);
  if (!inv) return fail("Invoice tidak ditemukan.", 404);
  if (inv.status === "paid") return fail("Invoice sudah lunas.", 409);

  const body = await readBody(request);
  const asset = findOriginAsset(body.originAsset);
  if (!asset) {
    return fail("originAsset tidak dikenal. Ambil daftar dari GET /api/assets.");
  }
  const refundTo = typeof body.refundTo === "string" ? body.refundTo.trim() : "";
  if (!validRefundAddress(asset.chain, refundTo)) {
    return fail(`refundTo bukan alamat ${asset.chain} yang valid.`);
  }

  const wantLive = body.live === true;
  if (wantLive && env.ALLOW_LIVE !== "1") {
    return fail("Live mode dimatikan di server demo. Quote ini hanya dry-run.");
  }
  let recipient = env.MERCHANT_NEAR_ACCOUNT || "";
  let recipientDemo = false;
  if (!recipient) {
    if (wantLive) {
      return fail("MERCHANT_NEAR_ACCOUNT belum diset di server. Live quote tidak bisa jalan.");
    }
    recipient = "intents.near";
    recipientDemo = true;
  }

  const quote = await requestQuote(fetch, {
    originAsset: asset.id,
    amountBase: inv.usdcBase,
    refundTo,
    recipient,
    dry: !wantLive,
    apiKey: env.ONECLICK_API_KEY || null,
  });

  inv.lastQuote = {
    originAsset: asset.id,
    originLabel: asset.label,
    refundTo,
    dry: !wantLive,
    recipient,
    recipientDemo,
    deadline: quote.deadline,
    correlationId: quote.correlationId || null,
    fees: feeBreakdown(quote),
    requestedAt: new Date().toISOString(),
  };
  if (wantLive && quote.depositAddress) {
    inv.liveDeposit = {
      address: quote.depositAddress,
      amountIn: quote.amountIn,
      deadline: quote.deadline,
      correlationId: quote.correlationId || null,
      createdAt: new Date().toISOString(),
    };
  }
  await saveInvoice(env.SATUQR_KV, inv);
  return json({ invoice: publicInvoice(inv), quote: inv.lastQuote });
}

async function invoiceStatus(request, env, id) {
  const inv = await getInvoice(env.SATUQR_KV, id);
  if (!inv) return fail("Invoice tidak ditemukan.", 404);

  if (inv.liveDeposit && inv.liveDeposit.address && inv.status !== "paid") {
    const raw = await swapStatus(fetch, inv.liveDeposit.address, env.ONECLICK_API_KEY || null);
    const status = String(raw.status || raw.swapStatus || raw.state || "").toUpperCase();
    if (status === "SUCCESS" || status === "COMPLETED") {
      inv.status = "paid";
      inv.payment = {
        method: "crypto",
        txHash: raw.txHash || raw.txHashes || null,
        paidAt: new Date().toISOString(),
        rawStatus: raw,
      };
      await saveInvoice(env.SATUQR_KV, inv);
    } else if (status === "FAILED") {
      inv.status = "failed";
      inv.payment = { method: "crypto", paidAt: null, rawStatus: raw };
      await saveInvoice(env.SATUQR_KV, inv);
    } else if (status === "REFUNDED") {
      inv.status = "refunded";
      inv.payment = { method: "crypto", paidAt: null, rawStatus: raw };
      await saveInvoice(env.SATUQR_KV, inv);
    }
    return json({ invoice: publicInvoice(inv), live: true, swap: raw });
  }
  return json({
    invoice: publicInvoice(inv),
    live: false,
    note: "Belum ada live quote. Ini dry quote saja, dana tidak bergerak.",
  });
}

async function markPaid(request, env, id) {
  if (!adminOk(env, request)) return fail("Password admin salah.", 401);
  const inv = await getInvoice(env.SATUQR_KV, id);
  if (!inv) return fail("Invoice tidak ditemukan.", 404);
  if (inv.status === "paid") return fail("Invoice sudah lunas.", 409);
  const body = await readBody(request);
  const reference = cleanStr(body.reference, 80);
  inv.status = "paid";
  inv.payment = {
    method: "qris",
    reference: reference || null,
    paidAt: new Date().toISOString(),
    note: "Dikonfirmasi manual oleh merchant. Jalur rupiah tidak punya webhook acquirer di demo ini.",
  };
  await saveInvoice(env.SATUQR_KV, inv);
  return json({ invoice: publicInvoice(inv) });
}
