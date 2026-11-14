// NEAR Intents 1Click API client.
// Base URL and asset IDs were verified against the live API on 2026-11-14
// (GET /v0/tokens, 231 tokens). There is no testnet for Intents: every call
// below runs against mainnet. A dry quote (dry: true) moves no funds and
// returns no deposit address.
//
// Fees (docs.near-intents.org/resources/fees): with an API key and no app
// fee, 20 bps normally and 1 bp for stablecoin pairs and same-asset routes.
// Without a key, 25 bps is added. The solver spread is NOT a separate fee:
// it is inside the quote, visible as amountIn vs amountOutUsd.

export const ONECLICK_BASE = "https://1click.chaindefuser.com/v0";

// USDC on NEAR, the asset the merchant receives.
export const USDC_NEAR =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

// Origin assets the customer can pay with. Verified in /v0/tokens.
export const ORIGIN_ASSETS = [
  { id: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", symbol: "USDC", chain: "sol", decimals: 6, label: "USDC on Solana" },
  { id: "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near", symbol: "USDT", chain: "sol", decimals: 6, label: "USDT on Solana" },
  { id: "nep141:sol.omft.near", symbol: "SOL", chain: "sol", decimals: 9, label: "SOL" },
  { id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", symbol: "USDC", chain: "base", decimals: 6, label: "USDC on Base" },
  { id: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", symbol: "USDC", chain: "eth", decimals: 6, label: "USDC on Ethereum" },
  { id: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", symbol: "USDT", chain: "eth", decimals: 6, label: "USDT on Ethereum" },
  { id: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", symbol: "USDC", chain: "arb", decimals: 6, label: "USDC on Arbitrum" },
];

export function findOriginAsset(id) {
  return ORIGIN_ASSETS.find((a) => a.id === id) || null;
}

// Light refund-address check per chain. 1Click does the real validation and
// answers with a clear error ("refundTo is not valid"); this only catches
// obvious mistakes before the call.
export function validRefundAddress(chain, address) {
  if (typeof address !== "string" || address.length < 26) return false;
  if (chain === "sol") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (chain === "eth" || chain === "base" || chain === "arb") {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }
  return true;
}

export class OneClickError extends Error {
  constructor(message, correlationId, status) {
    super(message);
    this.name = "OneClickError";
    this.correlationId = correlationId;
    this.status = status;
  }
}

async function callJson(fetchImpl, url, options) {
  const res = await fetchImpl(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new OneClickError(
      (data && (data.message || data.error)) || `1Click menjawab HTTP ${res.status}.`,
      data && data.correlationId,
      res.status,
    );
  }
  return data;
}

// EXACT_OUTPUT quote: the merchant receives exactly amountBase USDC on NEAR.
// The quote answers how much of the origin asset the customer must deposit
// (amountIn, with the slippage buffer baked in) and the floor (minAmountIn).
export async function requestQuote(fetchImpl, {
  originAsset,
  amountBase,
  refundTo,
  recipient,
  dry = true,
  slippageTolerance = 100,
  apiKey = null,
  deadlineMinutes = 30,
}) {
  const deadline = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();
  const body = {
    dry,
    swapType: "EXACT_OUTPUT",
    slippageTolerance,
    originAsset,
    destinationAsset: USDC_NEAR,
    amount: String(amountBase),
    refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    depositType: "ORIGIN_CHAIN",
    deadline,
    quoteWaitingTimeMs: 5000,
  };
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  const data = await callJson(fetchImpl, `${ONECLICK_BASE}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!data.quote) {
    throw new OneClickError("1Click menjawab tanpa quote.", data.correlationId, 200);
  }
  return { ...data.quote, deadline, correlationId: data.correlationId };
}

// Poll a live swap by its deposit address. Returns the raw 1Click status
// object; callers map its status field (PENDING_DEPOSIT, SUCCESS, FAILED,
// REFUNDED) and keep the raw object for transparency.
export async function swapStatus(fetchImpl, depositAddress, apiKey = null) {
  const headers = {};
  if (apiKey) headers["X-API-Key"] = apiKey;
  return callJson(
    fetchImpl,
    `${ONECLICK_BASE}/status?depositAddress=${encodeURIComponent(depositAddress)}`,
    { headers },
  );
}

// Fee transparency for the pay page: everything the customer pays, in one
// place. amountIn carries the slippage buffer; minAmountIn is the floor the
// solver must beat. The gap between amountInUsd and amountOutUsd is the
// solver spread plus the platform fee.
export function feeBreakdown(quote) {
  const inUsd = Number(quote.amountInUsd || 0);
  const outUsd = Number(quote.amountOutUsd || 0);
  return {
    amountIn: quote.amountIn,
    amountInFormatted: quote.amountInFormatted,
    minAmountIn: quote.minAmountIn,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    amountInUsd: quote.amountInUsd,
    amountOutUsd: quote.amountOutUsd,
    usdSpread: inUsd && outUsd ? +(inUsd - outUsd).toFixed(6) : null,
    timeEstimateSeconds: quote.timeEstimate ?? null,
    depositAddress: quote.depositAddress || null,
    refundFee: quote.refundFee || null,
  };
}
