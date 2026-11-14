// SatuQR frontend. Talks to the Cloudflare Worker backend.
// API base is public and read-only for demo data; no secrets live here.
const API = "https://satuqr-backend.qriscode.workers.dev";
const DEMO_INVOICE_ID = "sq_mwg9zhvggornfw";

const $ = (id) => document.getElementById(id);
const idr = (n) => "Rp" + Number(n).toLocaleString("id-ID");

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

// ---------- smooth scroll (Lenis) + parallax + reveal ----------
(function motion() {
  let lenis = null;
  if (typeof Lenis !== "undefined") {
    lenis = new Lenis({ lerp: 0.16 });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -70 });
      else target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Parallax: wrappers move at different speeds while scrolling the hero.
  // The inner images keep their own CSS animation, so the two never fight.
  const layers = Array.from(document.querySelectorAll(".plx[data-speed]"));
  const hero = document.querySelector(".hero");
  let heroCutoff = 1200;
  function measureHero() { heroCutoff = (hero ? hero.offsetHeight : 800) + 400; }
  measureHero();
  window.addEventListener("resize", measureHero);
  let ticking = false;
  function parallax() {
    ticking = false;
    const y = window.scrollY || 0;
    if (y > heroCutoff) return;
    layers.forEach((el) => {
      const speed = parseFloat(el.dataset.speed || "0.2");
      el.style.transform = "translate3d(0," + (y * speed).toFixed(1) + "px,0)";
    });
  }
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
  }, { passive: true });
  parallax();

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add("visible"); });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
})();

// ---------- invoice ----------
let currentInvoice = null;

function renderQr(inv) {
  const box = $("qrBox");
  box.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(box, { text: inv.qrPayload, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  } else {
    box.textContent = inv.qrPayload;
  }
  $("qrAmount").textContent = idr(inv.amountIdr) + "  ·  " + inv.usdc + " USDC";
  $("qrMeta").textContent = "Kurs " + Number(inv.rate).toLocaleString("id-ID") + " IDR/USD (" + (inv.rateDate || "?") + ")" +
    (inv.qrDemo ? "  ·  Payload DEMO" : "  ·  Payload QRIS toko");
  $("qrId").textContent = "Invoice " + inv.id + " · " + inv.merchant + ", " + inv.city + " · status " + inv.status;
  $("qrCard").hidden = false;
  $("quoteInvoiceId").value = inv.id;
}

$("invoiceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("invoiceMsg");
  msg.className = "msg"; msg.textContent = "Membuat invoice...";
  const fd = new FormData(e.target);
  const body = {
    merchant: fd.get("merchant"),
    city: fd.get("city") || "JAKARTA",
    amountIdr: Number(fd.get("amountIdr")),
    note: fd.get("note") || undefined,
    qrisStatic: fd.get("qrisStatic") || undefined,
  };
  try {
    const { invoice } = await api("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    currentInvoice = invoice;
    renderQr(invoice);
    msg.className = "msg ok"; msg.textContent = "Invoice dibuat. Scan kode di kanan, atau lanjut bayar dengan crypto.";
    loadInvoices();
  } catch (err) {
    msg.className = "msg err"; msg.textContent = "Gagal: " + err.message;
  }
});

$("loadDemo").addEventListener("click", async () => {
  const msg = $("invoiceMsg");
  msg.className = "msg"; msg.textContent = "Memuat invoice demo...";
  try {
    const { invoice } = await api("/api/invoices/" + DEMO_INVOICE_ID);
    currentInvoice = invoice;
    renderQr(invoice);
    msg.className = "msg ok"; msg.textContent = "Invoice demo dimuat: Rp50.000, Kopi Senja.";
  } catch (err) {
    msg.className = "msg err"; msg.textContent = "Gagal: " + err.message;
  }
});

$("copyPayload").addEventListener("click", async () => {
  if (!currentInvoice) return;
  try {
    await navigator.clipboard.writeText(currentInvoice.qrPayload);
    $("invoiceMsg").className = "msg ok";
    $("invoiceMsg").textContent = "Payload QRIS disalin.";
  } catch {
    $("invoiceMsg").className = "msg err";
    $("invoiceMsg").textContent = "Gagal menyalin. Salin manual dari dashboard.";
  }
});

// ---------- assets + quote ----------
async function loadAssets() {
  const sel = $("assetSelect");
  try {
    const { assets } = await api("/api/assets");
    sel.innerHTML = assets.map((a) =>
      '<option value="' + a.id + '">' + a.label + " (" + a.symbol + ")</option>").join("");
  } catch {
    sel.innerHTML = "<option value=''>Gagal memuat aset</option>";
  }
}
loadAssets();

function feeRow(label, value, good) {
  return "<dt>" + label + "</dt><dd" + (good ? ' class="good"' : "") + ">" + value + "</dd>";
}

$("quoteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("quoteMsg");
  const card = $("quoteCard");
  msg.className = "msg"; msg.textContent = "Meminta quote ke NEAR Intents...";
  card.hidden = true;
  const fd = new FormData(e.target);
  const id = fd.get("invoiceId").trim();
  try {
    const { quote } = await api("/api/invoices/" + id + "/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originAsset: fd.get("originAsset"), refundTo: fd.get("refundTo").trim() }),
    });
    const f = quote.fees;
    $("feeList").innerHTML =
      feeRow("Kamu kirim", f.amountInFormatted + " " + quote.originLabel.replace(/^.*\(|\)$/g, "")) +
      feeRow("Merchant terima", f.amountOutFormatted + " USDC di NEAR") +
      feeRow("Spread (USD)", "$" + Number(f.usdSpread).toFixed(4)) +
      feeRow("Estimasi waktu", "~" + f.timeEstimateSeconds + " detik") +
      feeRow("Penerima", quote.recipient, !quote.recipientDemo) +
      feeRow("Mode", quote.dry ? "DRY-RUN, dana tidak bergerak" : "LIVE", quote.dry);
    $("quoteNote").textContent = "Quote berlaku sampai " + new Date(quote.deadline).toLocaleTimeString("id-ID") +
      ". Dry-run tidak memberi deposit address, jadi tidak ada dana yang bisa bergerak.";
    card.hidden = false;
    currentInvoice = currentInvoice && currentInvoice.id === id ? currentInvoice : { id };
    msg.className = "msg ok"; msg.textContent = "Quote diterima.";
  } catch (err) {
    msg.className = "msg err"; msg.textContent = "Gagal: " + err.message;
  }
});

$("checkStatus").addEventListener("click", async () => {
  const msg = $("statusMsg");
  const id = ($("quoteInvoiceId").value || "").trim();
  if (!id) { msg.className = "msg err"; msg.textContent = "Isi ID invoice dulu."; return; }
  msg.className = "msg"; msg.textContent = "Mengecek status...";
  try {
    const data = await api("/api/invoices/" + id + "/status");
    msg.className = "msg ok";
    msg.textContent = "Status: " + data.invoice.status + ". " + (data.note || "");
    loadInvoices();
  } catch (err) {
    msg.className = "msg err"; msg.textContent = "Gagal: " + err.message;
  }
});

// ---------- dashboard ----------
async function loadInvoices() {
  const rows = $("invoiceRows");
  const msg = $("dashMsg");
  try {
    const { invoices } = await api("/api/merchant/invoices");
    if (!invoices.length) {
      rows.innerHTML = '<tr><td colspan="6">Belum ada invoice.</td></tr>';
      return;
    }
    rows.innerHTML = invoices.map((inv) =>
      "<tr><td>" + inv.id + "</td><td>" + inv.merchant + "</td><td>" + idr(inv.amountIdr) +
      "</td><td>" + inv.usdc + "</td><td><span class='pill " + inv.status + "'>" + inv.status +
      "</span></td><td>" + (inv.status === "pending"
        ? "<button class='btn btn-ghost mini' data-mark='" + inv.id + "'>Tandai lunas</button>" : "") +
      "</td></tr>").join("");
    msg.className = "msg ok"; msg.textContent = invoices.length + " invoice dimuat.";
  } catch (err) {
    rows.innerHTML = '<tr><td colspan="6">Gagal memuat.</td></tr>';
    msg.className = "msg err"; msg.textContent = "Gagal: " + err.message;
  }
}
$("refreshInvoices").addEventListener("click", loadInvoices);

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-mark]");
  if (btn) { await markPaid(btn.dataset.mark, btn); return; }
  if (e.target.id === "markPaidBtn") {
    const id = ($("quoteInvoiceId").value || "").trim();
    if (!id) { $("statusMsg").className = "msg err"; $("statusMsg").textContent = "Isi ID invoice dulu."; return; }
    await markPaid(id, e.target);
  }
});

async function markPaid(id, btn) {
  const msg = $("dashMsg");
  const ref = window.prompt("Referensi pembayaran QRIS (opsional):", "") || undefined;
  if (btn) btn.disabled = true;
  try {
    await api("/api/invoices/" + id + "/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "qris", reference: ref }),
    });
    msg.className = "msg ok"; msg.textContent = "Invoice " + id + " ditandai lunas.";
    loadInvoices();
  } catch (err) {
    msg.className = "msg err"; msg.textContent = "Gagal: " + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}
