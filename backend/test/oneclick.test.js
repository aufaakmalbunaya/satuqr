import test from "node:test";
import assert from "node:assert/strict";
import {
  requestQuote, feeBreakdown, findOriginAsset, validRefundAddress,
  ORIGIN_ASSETS, OneClickError, USDC_NEAR,
} from "../src/oneclick.js";

const DRY_QUOTE = {
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
  correlationId: "test-correlation-id",
};

function mockFetch(handler) {
  return async (url, options) => {
    const out = handler(url, options);
    return {
      ok: out.status < 400,
      status: out.status,
      text: async () => JSON.stringify(out.body),
    };
  };
}

test("requestQuote sends EXACT_OUTPUT and returns the quote with deadline", async () => {
  let seen = null;
  const fetchImpl = mockFetch((url, options) => {
    seen = JSON.parse(options.body);
    return { status: 200, body: DRY_QUOTE };
  });
  const quote = await requestQuote(fetchImpl, {
    originAsset: ORIGIN_ASSETS[0].id,
    amountBase: 10000000,
    refundTo: "3AnkmjhykTTCo2qd82mrPcG7KYmLcz9mTsdg5oJ1xeif",
    recipient: "intents.near",
    dry: true,
  });
  assert.equal(seen.swapType, "EXACT_OUTPUT");
  assert.equal(seen.dry, true);
  assert.equal(seen.destinationAsset, USDC_NEAR);
  assert.equal(seen.amount, "10000000");
  assert.equal(quote.amountOut, "10000000");
  assert.equal(quote.correlationId, "test-correlation-id");
  assert.ok(quote.deadline);
});

test("requestQuote surfaces the 1Click error message and correlation id", async () => {
  const fetchImpl = mockFetch(() => ({
    status: 400,
    body: { message: "refundTo is not valid", correlationId: "corr-1" },
  }));
  await assert.rejects(
    () => requestQuote(fetchImpl, {
      originAsset: ORIGIN_ASSETS[0].id,
      amountBase: 1000000,
      refundTo: "bad",
      recipient: "intents.near",
      dry: true,
    }),
    (err) => {
      assert.ok(err instanceof OneClickError);
      assert.match(err.message, /refundTo is not valid/);
      assert.equal(err.correlationId, "corr-1");
      return true;
    },
  );
});

test("feeBreakdown shows the usd spread between in and out", () => {
  const fees = feeBreakdown(DRY_QUOTE.quote);
  assert.equal(fees.amountIn, "10101632");
  assert.equal(fees.minAmountIn, "10000615");
  assert.equal(fees.amountOutUsd, "9.996100000000");
  assert.ok(fees.usdSpread > 0);
  assert.equal(fees.depositAddress, null);
});

test("origin asset list has the verified USDC Solana id", () => {
  const asset = findOriginAsset("nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near");
  assert.equal(asset.symbol, "USDC");
  assert.equal(asset.chain, "sol");
});

test("refund address check accepts a solana address and rejects eth-shaped junk", () => {
  assert.equal(validRefundAddress("sol", "3AnkmjhykTTCo2qd82mrPcG7KYmLcz9mTsdg5oJ1xeif"), true);
  assert.equal(validRefundAddress("sol", "11111111111111111111111111111111"), true);
  assert.equal(validRefundAddress("sol", "short"), false);
  assert.equal(validRefundAddress("eth", "0x0000000000000000000000000000000000000000"), true);
  assert.equal(validRefundAddress("eth", "not-an-address"), false);
});
