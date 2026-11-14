import test from "node:test";
import assert from "node:assert/strict";
import {
  crc16ccitt, crcHex, parseTLV, buildPayload, checkCrc,
  isQrisPayload, injectAmount, buildDemoPayload,
} from "../src/qris.js";

// Known CRC16-CCITT-FALSE vector: "123456789" -> 0x29B1.
test("crc16 of 123456789 is 0x29B1", () => {
  assert.equal(crc16ccitt("123456789"), 0x29b1);
  assert.equal(crcHex("123456789"), "29B1");
});

const STATIC_QRIS = (() => {
  // A merchant static QRIS string, built with the same builder the backend
  // uses. Field 26 carries the QRIS GUI, as a real printed QRIS does.
  const acct = "0011ID.QRIS.WWW" + "0110NMID123456" + "0203UMI";
  const fields = [
    { id: "00", value: "01" },
    { id: "01", value: "11" },
    { id: "26", value: acct },
    { id: "52", value: "5812" },
    { id: "53", value: "360" },
    { id: "58", value: "ID" },
    { id: "59", value: "WARUNG KOPI SENJA" },
    { id: "60", value: "YOGYAKARTA" },
  ];
  return buildPayload(fields);
})();

test("static sample parses and its CRC checks out", () => {
  assert.equal(checkCrc(STATIC_QRIS), true);
  assert.equal(isQrisPayload(STATIC_QRIS), true);
});

test("injectAmount turns static into dynamic with amount and fresh CRC", () => {
  const out = injectAmount(STATIC_QRIS, {
    amountIdr: 50000,
    merchantName: "Kopi Senja",
    city: "YOGYAKARTA",
  });
  const fields = parseTLV(out);
  const get = (id) => fields.find((f) => f.id === id)?.value;
  assert.equal(get("01"), "12");
  assert.equal(get("54"), "50000");
  assert.equal(get("59"), "Kopi Senja");
  assert.equal(checkCrc(out), true);
  assert.equal(isQrisPayload(out), true);
});

test("injectAmount rejects a non-QRIS payload", () => {
  const notQris = buildPayload([
    { id: "00", value: "01" },
    { id: "01", value: "11" },
    { id: "26", value: "0009ID.PAY.XX" },
  ]);
  assert.throws(() => injectAmount(notQris, { amountIdr: 1000 }), /bukan payload QRIS/);
});

test("demo payload is valid EMVCo, dynamic, and marked by its DEMO account", () => {
  const out = buildDemoPayload({ amountIdr: 25000, merchantName: "Toko Demo", city: "JAKARTA" });
  const fields = parseTLV(out);
  const get = (id) => fields.find((f) => f.id === id)?.value;
  assert.equal(get("01"), "12");
  assert.equal(get("54"), "25000");
  assert.equal(get("53"), "360");
  assert.equal(get("58"), "ID");
  const sub = parseTLV(get("26"));
  assert.equal(sub.find((s) => s.id === "01")?.value, "DEMO");
  assert.equal(checkCrc(out), true);
});
