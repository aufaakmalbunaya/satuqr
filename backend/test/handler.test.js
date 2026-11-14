import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { ORIGIN_ASSETS } from "../src/oneclick.js";

// In-memory KV stand-in with the same get/put/list shape the Worker uses.
function mockKv() {
  const store = new Map();
  return {
    async get(key, type) {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix, limit }) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit || 100)
        .map((name) => ({ name }));
      return { keys };
    },
  };
}

const CANNED_QUOTE = {
  quote: {
    amountIn: "10101632",
    amountInFormatted: "10.101632",
    minAmountIn: "10000615",
    amountOut: "10000000",
    amountOutFormatted: "10.0",
    amountInUsd: "10.097692363520",
    amountOutUsd: "9.996100000000",
    timeEstimate: 20,
    refundFee: "202194",
    withdrawFee: "0",
  },
  correlationId: "test-corr",
};

function mockFetch() {
  return async (url, options) => {
    const text = async () => {
      if (String(url).includes("frankfurter")) {
        return JSON.stringify({ rates: { IDR: 18245 }, date: "2026-11-13" });
      }
      if (String(url).includes("/v0/quote")) {
        return JSON.stringify(CANNED_QUOTE);
      }
      if (String(url).includes("/v0/status")) {
        return JSON.stringify({ status: "PENDING_DEPOSIT" });
      }
      return JSON.stringify({ error: "unexpected url" });
    };
    return { ok: true, status: 200, text, json: async () => JSON.parse(await text()) };
  };
}

function setup() {
  const kv = mockKv();
  const env = {
    SATUQR_KV: kv,
    MERCHANT_NEAR_ACCOUNT: "intents.near",
    ALLOW_LIVE: "0",
    ADMIN_PASSWORD: "test123",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockFetch();
  return { kv, env, restore: () => { globalThis.fetch = realFetch; } };
}

async function call(env, path, method = "GET", body = null, headers = {}) {
  const init = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body !== null) init.body = JSON.stringify(body);
  const res = await worker.fetch(new Request(`https://satuqr.test${path}`, init), env);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text };
}

test("full invoice flow: create, quote dry, status, mark paid, list, csv", async () => {
  const { env, restore } = setup();
  try {
    const created = await call(env, "/api/invoices", "POST", {
      merchant: "Kopi Senja",
      amountIdr: 182450,
    });
    assert.equal(created.status, 201);
    const inv = created.data.invoice;
    assert.equal(inv.usdcBase, 10000000);
    assert.equal(inv.usdc, 10);
    assert.equal(inv.qrDemo, true);
    assert.equal(inv.status, "pending");

    const got = await call(env, `/api/invoices/${inv.id}`);
    assert.equal(got.status, 200);
    assert.equal(got.data.invoice.id, inv.id);

    const quoted = await call(env, `/api/invoices/${inv.id}/quote`, "POST", {
      originAsset: ORIGIN_ASSETS[0].id,
      refundTo: "3AnkmjhykTTCo2qd82mrPcG7KYmLcz9mTsdg5oJ1xeif",
    });
    assert.equal(quoted.status, 200);
    assert.equal(quoted.data.quote.dry, true);
    assert.equal(quoted.data.quote.fees.amountOut, "10000000");
    assert.equal(quoted.data.quote.fees.depositAddress, null);

    const status = await call(env, `/api/invoices/${inv.id}/status`);
    assert.equal(status.status, 200);
    assert.equal(status.data.live, false);
    assert.equal(status.data.invoice.status, "pending");

    const noAuth = await call(env, `/api/invoices/${inv.id}/mark-paid`, "POST", { method: "qris" });
    assert.equal(noAuth.status, 401);

    const paid = await call(env, `/api/invoices/${inv.id}/mark-paid`, "POST",
      { method: "qris", reference: "QRIS-REF-1" },
      { "X-Admin-Password": "test123" });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.invoice.status, "paid");
    assert.equal(paid.data.invoice.payment.method, "qris");

    const list = await call(env, "/api/merchant/invoices", "GET", null,
      { "X-Admin-Password": "test123" });
    assert.equal(list.status, 200);
    assert.equal(list.data.invoices.length, 1);

    const csv = await call(env, "/api/merchant/invoices.csv", "GET", null,
      { "X-Admin-Password": "test123" });
    assert.equal(csv.status, 200);
    assert.match(csv.text, /^id,created_at,merchant,amount_idr,usdc,status,method,paid_at,tx_hash/);
    assert.match(csv.text, new RegExp(inv.id));
  } finally {
    restore();
  }
});

test("create invoice rejects bad amount and non-QRIS static string", async () => {
  const { env, restore } = setup();
  try {
    const badAmount = await call(env, "/api/invoices", "POST", { merchant: "Toko", amountIdr: 500 });
    assert.equal(badAmount.status, 400);
    const badQris = await call(env, "/api/invoices", "POST", {
      merchant: "Toko",
      amountIdr: 50000,
      qrisStatic: "00020101021126580011ID.DANA.QRIS.WWW01189360091400000000020208000000000303UMI5204481453033605802ID5914TOKO CONTOH6007JAKARTA6304ABCD",
    });
    // The DANA string above is not a real static payload shape, so it must
    // fail validation instead of producing a broken dynamic QR.
    assert.equal(badQris.status, 400);
  } finally {
    restore();
  }
});

test("live quote is refused when ALLOW_LIVE is off", async () => {
  const { env, restore } = setup();
  try {
    const created = await call(env, "/api/invoices", "POST", { merchant: "Toko", amountIdr: 50000 });
    const id = created.data.invoice.id;
    const live = await call(env, `/api/invoices/${id}/quote`, "POST", {
      originAsset: ORIGIN_ASSETS[0].id,
      refundTo: "3AnkmjhykTTCo2qd82mrPcG7KYmLcz9mTsdg5oJ1xeif",
      live: true,
    });
    assert.equal(live.status, 400);
    assert.match(live.data.error, /Live mode dimatikan/);
  } finally {
    restore();
  }
});

test("health reports merchant config and live flag", async () => {
  const { env, restore } = setup();
  try {
    const res = await call(env, "/health");
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.equal(res.data.merchantConfigured, true);
    assert.equal(res.data.liveEnabled, false);
  } finally {
    restore();
  }
});
