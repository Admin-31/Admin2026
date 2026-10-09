# EVENT CHECK-IN — GitHub Pages Edition

Aplikasi web statis berbahasa Indonesia untuk registrasi dan check-in acara. Proyek ini sengaja **tidak memakai backend server atau database bersama**. File ini dirancang untuk GitHub Pages.

## Fitur yang berfungsi

- Scanner kamera menggunakan `getUserMedia` + `BarcodeDetector` bawaan browser, jika didukung browser/perangkat.
- Input ID manual dan scanner USB/Bluetooth yang bertindak seperti keyboard.
- Verifikasi peserta berdasarkan daftar lokal.
- Check-in unik per ID peserta dan nama kegiatan; pemindaian ulang tidak menambah kehadiran kedua.
- Catatan log pemindaian.
- Penyimpanan peserta, kehadiran, log, dan antrean lokal di IndexedDB.
- Impor CSV peserta; tambah/edit/hapus peserta; pencarian; ekspor CSV.
- 50 data demonstrasi fiktif dalam `sample-participants.csv`.
- Dashboard ringkas dan ekspor laporan CSV.
- Ekspor/pemulihan cadangan JSON yang menggabungkan data tanpa menambah check-in dengan kunci sama.
- Pengaturan nama kegiatan, tanggal, lokasi, judul, warna utama, prefix ID dan parameter ID URL.
- PWA dasar: manifest dan service worker untuk cache shell aplikasi.
- Layout responsif untuk ponsel dan desktop.
- Workflow GitHub Actions untuk deployment otomatis ke GitHub Pages.

## Batasan penting

1. Tidak ada backend, PostgreSQL, autentikasi server, atau database bersama. Data hanya ada di browser/perangkat yang digunakan.
2. “Antrean sinkronisasi” adalah antrean lokal untuk transaksi check-in yang belum diekspor. Tidak ada pengiriman otomatis ke server. Gunakan **Ekspor antrean JSON** atau **Ekspor cadangan lengkap**, lalu pindahkan file secara manual.
3. Mengimpor cadangan pada perangkat lain membantu menggabungkan data, tetapi konflik antarperangkat (misalnya dua perangkat mencatat peserta yang sama saat offline) tidak dapat diputuskan secara otoritatif. Tinjau laporan gabungan sebelum menjadikannya laporan resmi.
4. Tidak ada login petugas yang aman. JavaScript statis tidak dapat melindungi data atau mengunci fungsi administrasi dari pengguna yang memiliki akses ke situs.
5. Foto menggunakan URL eksternal; foto tidak diunggah ke penyimpanan privat dan mungkin tidak tersedia saat offline.
6. Pemindaian kamera bergantung pada dukungan `BarcodeDetector`. Dukungan QR/barcode berbeda menurut browser. Uji perangkat yang akan digunakan; input manual/scanner USB menjadi alternatif.
7. Browser dapat menghapus IndexedDB jika data situs dibersihkan. Ekspor cadangan secara berkala dan simpan di lokasi yang aman.
8. PWA perlu dibuka online terlebih dahulu agar service worker meng-cache aset. Untuk penggunaan offline, siapkan juga data peserta lebih dahulu.
9. CSV berisi 50 peserta demonstrasi fiktif. Hapus data demonstrasi sebelum memasukkan daftar peserta asli.

## Deploy ke GitHub Pages

### 1. Buat repository

Buat repository baru bernama `event-check-in` di GitHub. Unggah seluruh isi folder ini, termasuk folder `.github/workflows/`. Branch utama yang diasumsikan workflow ini adalah `main`.

### 2. Aktifkan GitHub Actions sebagai sumber Pages

Pada repository, buka **Settings → Pages → Build and deployment → Source**, lalu pilih **GitHub Actions**.

### 3. Tunggu deployment

Buka tab **Actions**, pilih workflow “Deploy EVENT CHECK-IN ke GitHub Pages”, lalu tunggu status selesai. URL akan berbentuk:

`https://NAMA-USER.github.io/event-check-in/`

Jika nama repository berbeda, URL mengikuti nama repository.

### 4. Pengujian awal

- Buka URL HTTPS dari ponsel/laptop.
- Impor `sample-participants.csv` melalui menu Peserta, atau tekan **Muat 50 peserta contoh** untuk membuat data demo langsung di IndexedDB.
- Aktifkan kamera dan izinkan akses kamera. Uji QR yang berisi kode seperti `EVT2026-0001`.
- Lakukan check-in, pindai ID sama sekali lagi, dan pastikan status berubah menjadi “Anda sudah terabsen”.
- Ekspor cadangan JSON. Uji pemulihan cadangan sebelum acara.

### 5. Memperbarui aplikasi

Setiap perubahan yang di-push ke branch `main` akan memicu GitHub Actions. Jika browser tetap menampilkan aset lama setelah deploy, tutup dan buka kembali tab atau bersihkan cache situs. Service worker memakai nama cache versi yang dapat dinaikkan pada `sw.js` saat melakukan perubahan besar.

## Menjalankan lokal

Karena aplikasi ini statis, cukup layani folder dengan server HTTP lokal. Contoh jika Python tersedia:

```bash
python -m http.server 8000
```

Buka `http://localhost:8000`. Jangan membuka `index.html` langsung lewat `file://` jika ingin menguji service worker. Kamera biasanya diizinkan pada `localhost` atau HTTPS.

## Format CSV

Header yang diperlukan:

```csv
participant_code,full_name,institution,photo_url,registration_status
EVT2026-0001,Andi Contoh,Organisasi Contoh,,terdaftar
```

Gunakan ID unik. Karakter yang diizinkan untuk ID adalah huruf, angka, tanda hubung, dan garis bawah.

## Keamanan dan privasi

Jangan masukkan data pribadi yang tidak diperlukan. Batasi akses repository jika file atau dokumentasi memuat informasi internal. Jangan menganggap URL GitHub Pages privat: website yang diterbitkan dapat diakses publik sesuai pengaturan repository. Simpan cadangan dengan aman.
