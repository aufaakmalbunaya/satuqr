# Video demo SatuQR — Brief untuk Claude (perakit video)

## Format

- Vertikal 1080x1920 (rekaman layar HP). Durasi 60-90 detik. Tanpa wajah.
- Semua screenshot di folder ini: 780x1688 PNG (viewport HP 390x844 @2x).
- Demo live: https://satuqr.pages.dev — Repo: https://github.com/aufaakmalbunaya/satuqr
- Invoice yang dipakai di semua shot: `sq_mwh0wheimm7zvu` (Kopi Senja, Rp50.000, status pending, masih ada di KV).

## Adegan

| Waktu | File | Tampilan | Narasi (Inggris) |
|---|---|---|---|
| 0-8 dtk | 01-hero.png | Hero: panorama Indonesia, judul "Satu QR. Semua cara bayar." | "Forty-two million merchants in Indonesia take QRIS. But a crypto customer cannot pay them. SatuQR fixes that with one QR." |
| 8-20 dtk | 02-form-filled.png lalu 03-qr-result.png | Form terisi Kopi Senja Rp50.000, lalu kartu QR muncul | "The merchant types a name and a rupiah amount. One QR appears, worth 2.74 USDC." |
| 20-38 dtk | 04-pay-form.png lalu 05-quote-result.png | Form bayar crypto (USDC Solana), lalu rincian quote | "A crypto customer picks any asset, here USDC on Solana, and sees the exact quote before paying. The merchant receives exactly 2.74 USDC on NEAR. This is a dry run, so no funds move." |
| 38-50 dtk | 06-status.png | Hasil cek status invoice | "The invoice status updates when the swap settles. No NEAR account needed, for the customer or the merchant." |
| 50-65 dtk | 07-dashboard.png lalu 08-cara-kerja.png | Dashboard invoice, lalu 3 langkah berilustrasi | "The merchant tracks every invoice in the dashboard and exports a CSV. Three steps, two worlds." |
| 65-75 dtk | 09-closing.png + end card | Footer, lalu kartu penutup | "One QR. Every way to pay. Try the live demo at satuqr.pages.dev." |

## Angka yang harus terbaca jelas di video

- Rp50.000 = 2.740477 USDC (kurs 18.245 IDR/USD).
- Quote: pembeli kirim 2.772214 USDC on Solana, merchant terima 2.740477 USDC di NEAR.
- Spread $0.0317, estimasi ~20 detik, penerima satuqr.near, mode DRY-RUN.

## Catatan untuk perakit

- Pakai slow zoom (Ken Burns) di tiap screenshot supaya terasa seperti rekaman layar, bukan slideshow diam. Transisi fade atau slide singkat antar adegan.
- Tambahkan caption singkat di bawah tiap adegan (teks dari kolom Tampilan).
- Alamat refund di 04-pay-form.png adalah alamat throwaway untuk dry quote. Jangan di-zoom sampai terbaca penuh. Tidak ada dana di alamat itu.
- Tabel dashboard di 07-dashboard.png terpotong di tepi kanan pada layar HP. Potong (crop) ke bagian kiri tabel, atau zoom ke baris invoice pertama saja.
- End card wajib menampilkan: https://satuqr.pages.dev dan https://github.com/aufaakmalbunaya/satuqr
- Musik latar opsional, ringan. Narasi boleh diganti suara AI atau teks saja.
- Hasil akhir: file video 60-90 detik (MP4). Tautan video dimasukkan ke README dan ke form submit hackathon sebelum 15 Nov 2026 06:59 WIB.

## File di folder ini

- 01-hero.png — hero situs
- 02-form-filled.png — form invoice terisi
- 03-qr-result.png — kartu QR hasil buat invoice
- 04-pay-form.png — form bayar crypto terisi
- 05-quote-result.png — rincian quote (fee, spread, penerima)
- 06-status.png — hasil cek status invoice
- 07-dashboard.png — dashboard invoice
- 08-cara-kerja.png — bagian Cara kerja (ilustrasi 3 langkah)
- 09-closing.png — footer situs
- VIDEO_BRIEF.md — file ini
