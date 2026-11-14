// Invoice storage on Cloudflare KV. Keys are "inv:<id>"; the merchant list
// is a KV prefix scan, newest first. No database, no extra service.

export function newInvoiceId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sq_${time}${rand}`;
}

export async function saveInvoice(kv, invoice) {
  invoice.updatedAt = new Date().toISOString();
  await kv.put(`inv:${invoice.id}`, JSON.stringify(invoice));
  return invoice;
}

export async function getInvoice(kv, id) {
  if (!id || typeof id !== "string") return null;
  return kv.get(`inv:${id}`, "json");
}

export async function listInvoices(kv, limit = 50) {
  const page = await kv.list({ prefix: "inv:", limit });
  const out = [];
  for (const key of page.keys) {
    const inv = await kv.get(key.name, "json");
    if (inv) out.push(inv);
  }
  out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return out.slice(0, limit);
}

// Public view: everything the pay page and the judges need, nothing the
// merchant's raw static QRIS string would leak beyond its own page.
export function publicInvoice(inv) {
  if (!inv) return null;
  const { qrisStatic, ...rest } = inv;
  return rest;
}
