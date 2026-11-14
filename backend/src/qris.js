// QRIS payload tools (EMVCo Merchant-Presented Mode).
// Pure functions, no network, no secrets. Tested in test/qris.test.js.
//
// A QRIS payload is a chain of TLV fields: ID (2 digits) + length (2 digits)
// + value. Field 63 holds a CRC16-CCITT (poly 0x1021, init 0xFFFF) over the
// whole payload plus "6304".
//
// Honest design: this module never invents a merchant account. It takes the
// merchant's own static QRIS string, injects the amount, and recomputes the
// CRC. Without a static string it builds a DEMO payload that is clearly
// marked demo-only by the caller.

export function crc16ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function crcHex(str) {
  return crc16ccitt(str).toString(16).toUpperCase().padStart(4, "0");
}

export function tlv(id, value) {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

// Parse a TLV chain into [{ id, value }]. Throws on malformed input.
export function parseTLV(payload) {
  if (typeof payload !== "string" || payload.length < 4) {
    throw new Error("Payload QRIS kosong atau terlalu pendek.");
  }
  const fields = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(id) || Number.isNaN(len) || i + 4 + len > payload.length) {
      throw new Error(`Payload QRIS rusak di posisi ${i}.`);
    }
    fields.push({ id, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  if (i !== payload.length) {
    throw new Error("Payload QRIS punya sisa karakter yang tidak terurai.");
  }
  return fields;
}

export function buildPayload(fields) {
  const body = fields.map((f) => tlv(f.id, f.value)).join("");
  return body + "6304" + crcHex(body + "6304");
}

export function checkCrc(payload) {
  if (!payload.endsWith("6304") && payload.length < 8) return false;
  const body = payload.slice(0, -4);
  const given = payload.slice(-4);
  return body.endsWith("6304") && crcHex(body) === given.toUpperCase();
}

// True when the payload carries a QRIS merchant account (field 26,
// sub-field 00 contains "QRIS", e.g. "ID.QRIS.WWW").
export function isQrisPayload(payload) {
  try {
    const fields = parseTLV(payload);
    const f26 = fields.find((f) => f.id === "26");
    if (!f26) return false;
    const sub = parseTLV(f26.value);
    const gui = sub.find((s) => s.id === "00");
    return !!gui && gui.value.includes("QRIS");
  } catch {
    return false;
  }
}

function upsert(fields, id, value) {
  const hit = fields.find((f) => f.id === id);
  if (hit) hit.value = value;
  else fields.push({ id, value });
  return fields;
}

// Turn a merchant's static QRIS string into a dynamic one for one amount.
// - Sets initiation method (01) to "12" (dynamic).
// - Sets amount (54) to the rupiah amount, integer, no decimals.
// - Sets merchant name (59, max 25 chars) and city (60, max 15 chars).
// - Drops the old CRC (63) and recomputes it.
// Throws when the input is not a QRIS payload.
export function injectAmount(staticPayload, { amountIdr, merchantName, city }) {
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
    throw new Error("amountIdr harus bilangan bulat di atas 0.");
  }
  if (!isQrisPayload(staticPayload)) {
    throw new Error("String yang diberikan bukan payload QRIS (field 26 tanpa GUI QRIS).");
  }
  const fields = parseTLV(staticPayload).filter((f) => f.id !== "63");
  upsert(fields, "01", "12");
  upsert(fields, "54", String(amountIdr));
  if (merchantName) upsert(fields, "59", merchantName.slice(0, 25));
  if (city) upsert(fields, "60", city.slice(0, 15));
  // Emit in numeric field order, as EMVCo readers expect.
  fields.sort((a, b) => Number(a.id) - Number(b.id));
  return buildPayload(fields);
}

// Demo-only payload. The merchant account is literally "DEMO", so no one
// can mistake it for a real merchant QRIS. Callers must set qrDemo: true.
export function buildDemoPayload({ amountIdr, merchantName, city }) {
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
    throw new Error("amountIdr harus bilangan bulat di atas 0.");
  }
  const acct = tlv("00", "ID.QRIS.WWW") + tlv("01", "DEMO");
  const fields = [
    { id: "00", value: "01" },
    { id: "01", value: "12" },
    { id: "26", value: acct },
    { id: "52", value: "0000" },
    { id: "53", value: "360" },
    { id: "54", value: String(amountIdr) },
    { id: "58", value: "ID" },
    { id: "59", value: (merchantName || "SATUQR DEMO").slice(0, 25) },
    { id: "60", value: (city || "JAKARTA").slice(0, 15) },
  ];
  return buildPayload(fields);
}
