# Panduan langkah demi langkah: EVENT CHECK-IN di GitHub Pages

## A. Upload source code

### Opsi 1 — Upload melalui browser
1. Buka GitHub dan buat repository baru bernama `event-check-in`.
2. Pilih `Add file` → `Upload files`.
3. Ekstrak ZIP di komputer Anda terlebih dahulu.
4. Pilih seluruh file dan folder dari hasil ekstrak. Pastikan folder `.github/workflows/deploy.yml` ikut terunggah.
5. Commit perubahan ke branch `main`.

> Jika antarmuka web GitHub tidak memudahkan upload folder tersembunyi `.github`, gunakan Git melalui terminal seperti langkah berikut.

### Opsi 2 — Git melalui terminal
Buka terminal di folder proyek, lalu jalankan:

```bash
git init
git add .
git commit -m "Tambahkan EVENT CHECK-IN GitHub Pages"
git branch -M main
git remote add origin https://github.com/USERNAME/event-check-in.git
git push -u origin main
```

Ganti `USERNAME` dengan username GitHub Anda. Jika repository sudah berisi file awal, sinkronkan dulu atau buat repository kosong agar tidak terjadi konflik riwayat.

## B. Aktifkan GitHub Pages
1. Buka repository → `Settings`.
2. Pilih `Pages`.
3. Pada `Build and deployment`, set `Source` ke `GitHub Actions`.
4. Buka tab `Actions`, pilih workflow deployment dan pantau sampai hijau/berhasil.
5. Buka URL yang ditampilkan workflow, biasanya `https://USERNAME.github.io/event-check-in/`.

## C. Persiapan sebelum acara
1. Buka website saat online pada setiap perangkat yang akan dipakai.
2. Biarkan service worker terpasang/cache shell.
3. Muat atau impor daftar peserta di setiap perangkat yang akan bekerja offline.
4. Uji kamera dan format kode ID di browser/perangkat yang sesungguhnya.
5. Lakukan beberapa check-in uji, termasuk memindai ID yang sama dua kali.
6. Ekspor cadangan JSON sebelum loket dibuka.
7. Tentukan satu orang yang bertanggung jawab menggabungkan cadangan dari setiap perangkat sesudah acara.

## D. Menggunakan antrean lokal
1. Setiap check-in baru tersimpan pada IndexedDB perangkat itu.
2. Catatan baru masuk antrean berstatus `menunggu`.
3. Pada menu Laporan, klik `Ekspor antrean JSON` atau `Ekspor cadangan lengkap`.
4. Pindahkan file dengan cara yang aman ke komputer pengelola.
5. Pulihkan cadangan pada browser/perangkat pengelola menggunakan `Pulihkan cadangan`.
6. Ekspor CSV laporan gabungan untuk pemeriksaan.

**Tidak ada sinkronisasi otomatis.** Tombol ekspor tidak mengirim data ke internet atau server.

## E. Batasan dan saran
- GitHub Pages adalah hosting statis. Tidak ada backend Express/PostgreSQL dalam versi ini.
- Login yang aman, hak akses admin/petugas, dan sinkronisasi multi-perangkat real-time tidak mungkin ditegakkan hanya oleh file frontend.
- Jika beberapa perangkat digunakan, catat perangkat/loket mana yang mengelola daftar peserta dan lakukan penggabungan cadangan dengan teliti.
- IndexedDB dapat terhapus saat data browser dibersihkan. Ekspor cadangan berkala.
- Kamera memerlukan HTTPS atau localhost dan dukungan BarcodeDetector browser.
- Foto eksternal tidak dijamin tersedia saat offline.
- Data demo wajib dibuang sebelum digunakan dengan daftar peserta nyata.
