# Panduan Gaya Reel: Keuangan Pribadi

Gaya: **edukator premium**. Bicara langsung ke kamera, bersih, sinematik, padat.
Bahasa: Indonesia. Format: 1080x1920, 30fps, durasi 30–60 detik, satu ide per video.

Token warna dan font ada di `src/brand.ts`. Contoh tampilan: render `BrandPreview`
(`npx remotion still BrandPreview out/brand-preview.png`).

## Fokus konten

**Keuangan pribadi** untuk penonton Indonesia, terutama pekerja muda dan keluarga muda.

Topik utama:
- Mengatur gaji: budgeting, pos-pos pengeluaran, "gaji habis sebelum akhir bulan"
- Dana darurat dan menabung
- Utang: cicilan, kartu kredit, paylater, pinjol
- Investasi pemula: reksa dana, emas, saham, deposito
- Kebiasaan dan mindset uang, gaya hidup vs kemampuan
- Persiapan tujuan: menikah, rumah, pendidikan anak, pensiun

Nada bicara: seperti teman yang paham uang. Santai, jelas, tidak menggurui,
tanpa istilah rumit kecuali langsung dijelaskan. Pakai angka nyata dalam
Rupiah (misalnya "gaji Rp5 juta") supaya penonton bisa membayangkan.

Contoh hook:
- "Gaji naik 20%, tapi tabungan tetap nol. Ini sebabnya."
- "3 kebiasaan yang bikin gajimu habis sebelum tanggal 25."
- "Kalau gajimu Rp5 juta, begini cara bagi-baginya."
- "Paylater itu bukan utang? Coba hitung ini dulu."

Catatan: konten bersifat edukasi umum, bukan saran investasi personal.
Untuk produk investasi, sebut risikonya dan hindari janji imbal hasil pasti.

## Warna

| Nama | Hex | Dipakai untuk |
|---|---|---|
| Maroon | `#7B1E2B` | Warna utama: kotak sorotan kata kunci, label, bar, CTA |
| Maroon Deep | `#4A0E17` | Latar kartu judul layar penuh, gradasi, bayangan |
| Maroon Light | `#A8344A` | Garis tipis dan aksen kecil |
| Gold | `#D4A857` | Angka uang dan persentase, kata hasil ("hemat", "naik", "lunas") |
| Cream | `#F7F0E6` | Teks subtitle, latar kartu terang |
| Ink | `#141012` | Teks di atas cream, bayangan subtitle |

Aturan: maroon untuk **kata kunci**, gold khusus untuk **angka dan hasil**.
Jangan pakai keduanya di kata yang sama.

## Font

- **Montserrat 900 (Black)**: subtitle dan hook.
- **Montserrat 600–800**: label, daftar poin, teks kecil.
- **Playfair Display Italic 700**: aksen elegan, maksimal **satu kata** per hook.

File font disimpan di `public/fonts` (lisensi SIL OFL), jadi render tidak butuh internet.

## Struktur video

1. **Hook (0–2 dtk)**: kalimat pembuka sebagai judul besar di atas, plus label
   kategori maroon ("KEUANGAN PRIBADI").
2. **Isi**: poin-poin, tiap poin ditandai teks atau grafis saat disebut.
3. **Penutup (2–3 dtk terakhir)**: satu CTA jelas ("Follow untuk tips
   keuangan tiap hari" atau "Komen 'MAU'").

## Edit

- **Potong rapat**: buang jeda lebih dari ~0,3 dtk, "eee", "hmm", dan
  salah ucap.
- **Subtitle kata per kata**: maksimal 3 kata tampil sekaligus, di sepertiga
  bawah (sekitar y=1240), di luar area tombol Instagram.
- **Punch-in zoom**: 100% ke 110–115% di kalimat penting. Ganti framing
  tiap 2–3 kalimat.
- **Grafis**: angka, daftar, atau screenshot muncul tepat saat disebut.
- **Warna footage**: hangat, kontras sedikit dinaikkan.
- **Audio**: suara utama sekitar -14 LUFS. Musik latar 18–22 dB di bawah
  suara. Efek "whoosh" atau "pop" pelan di transisi dan saat teks muncul.

## Area aman (1080x1920)

Atas 220px, bawah 420px, kanan 140px tertutup UI Instagram. Teks penting
tidak boleh masuk area itu.
