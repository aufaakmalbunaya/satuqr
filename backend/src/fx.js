// USD to IDR rate from Frankfurter (ECB reference rates, free, no key).
// Verified live on 2026-11-14: USD to IDR 18245, date 2026-11-13.
// The rate is cached in KV for one hour so one invoice does not cost one
// upstream call per request. When both Frankfurter hosts fail, the last
// cached rate is used and flagged; when no rate exists at all, the caller
// gets a clear error instead of a made-up number.

const FX_KEY = "fx:USDIDR";
const FX_TTL_SECONDS = 3600;
const HOSTS = [
  "https://api.frankfurter.app/latest?from=USD&to=IDR",
  "https://api.frankfurter.dev/v1/latest?from=USD&to=IDR",
];

export async function getUsdIdrRate(fetchImpl, kv) {
  let cached = null;
  if (kv) {
    try {
      cached = await kv.get(FX_KEY, "json");
    } catch {
      cached = null;
    }
  }
  const fresh = cached && Date.now() - cached.fetchedAt < FX_TTL_SECONDS * 1000;
  if (fresh) return { ...cached, cached: true };

  for (const host of HOSTS) {
    try {
      const res = await fetchImpl(host);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data && data.rates && Number(data.rates.IDR);
      if (!rate || rate <= 0) continue;
      const value = { rate, date: data.date || null, source: host, fetchedAt: Date.now() };
      if (kv) {
        try {
          await kv.put(FX_KEY, JSON.stringify(value));
        } catch {
          // Cache failure must not fail the invoice.
        }
      }
      return { ...value, cached: false };
    } catch {
      continue;
    }
  }
  if (cached) return { ...cached, cached: true, stale: true };
  throw new Error("Kurs USD ke IDR tidak bisa diambil dari Frankfurter. Coba lagi nanti.");
}
