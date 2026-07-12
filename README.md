# Radar UMKM Campurejo — Panduan Admin & Penyebaran (Deployment)

Aplikasi peta interaktif modern dan responsive untuk menampilkan data UMKM terdaftar di Desa Campurejo, Bojonegoro. Proyek ini bersifat 100% static site (client-side), gratis, dan tanpa memerlukan server backend/database.

---

## 📋 Fitur Utama
1. **Peta Interaktif:** Menampilkan titik lokasi UMKM menggunakan Leaflet.js & OpenStreetMap.
2. **Batas Desa Resmi:** Visualisasi garis batas administrasi Desa Campurejo (GeoJSON).
3. **Pencarian & Filter:** Cari UMKM berdasarkan nama atau deskripsi, serta filter cepat berdasarkan kategori (Kuliner, Jasa, Kerajinan, Pertanian, Belanja).
4. **Status Operasional Real-time:** Menampilkan jam operasional dan status buka/tutup dinamis pada kartu utama dan popup peta.
5. **Kisah Inspiratif UMKM:** Modal pop-up khusus yang menampilkan narasi kisah perjuangan/sejarah pelaku usaha.
6. **QR Code Deep-Linking:** Web mendukung akses parameter `?umkm=id_unik` yang otomatis menggeser peta dan membuka jendela detail UMKM tersebut (ideal untuk ditempel di meja/stand UMKM).
7. **Dukungan File Upload Foto:** Mendukung upload foto tempat/produk secara langsung di Google Forms dan mengonversi link Google Drive menjadi gambar web otomatis.

---

## 🟢 LANGKAH 1: PEMBUATAN GOOGLE FORM

Buatlah formulir baru di [Google Forms](https://forms.google.com) dengan pertanyaan-pertanyaan berikut secara berurutan. Ini akan diisi oleh pelaku UMKM atau petugas survei KKN:

### Daftar Pertanyaan Formulir:
1. **Nama Usaha** *(Tipe: Jawaban Singkat)*
2. **Kategori Usaha** *(Tipe: Pilihan Ganda)*
   *   *Wajib masukkan opsi berikut:* `Kuliner`, `Jasa`, `Kerajinan`, `Pertanian`, `Belanja`
   *   *(Anda boleh mengaktifkan opsi "Tambahkan Lainnya/Other")*
3. **Deskripsi Singkat Usaha** *(Tipe: Paragraf)*
   *   *Contoh:* Menjual sembako murah, gas LPG, pulsa, dan token listrik.
4. **Koordinat Latitude** *(Tipe: Jawaban Singkat)*
   *   *Petunjuk:* Ambil dari Google Maps di HP/Laptop (contoh: `-7.1475`).
5. **Koordinat Longitude** *(Tipe: Jawaban Singkat)*
   *   *Petunjuk:* Ambil dari Google Maps di HP/Laptop (contoh: `111.9015`).
6. **Nomor WhatsApp Aktif** *(Tipe: Jawaban Singkat)*
   *   *Contoh:* `081234567890`. Format bebas karena akan dibersihkan otomatis oleh sistem.
7. **Foto Tempat / Produk** *(Tipe: Upload File)*
   *   *Keterangan:* Izinkan pengunggah mengunggah file gambar (JPEG/PNG). **Anda dapat mengizinkan upload lebih dari 1 file (maksimal 5 atau 10)**. Web secara otomatis akan mendeteksi banyak file dan menampilkannya sebagai **Galeri Foto Geser (Slider Gallery)** yang indah di halaman Kisah UMKM.
8. **Link Google Maps Resmi (Share Link)** *(Tipe: Jawaban Singkat - Opsional)*
   *   *Keterangan:* Jika toko sudah terdaftar di Google Maps, masukkan link share-nya (contoh: `https://maps.app.goo.gl/...`). Jika kosong, sistem otomatis memakai koordinat Latitude/Longitude di atas.
9. **ID Unik untuk QR Code** *(Tipe: Jawaban Singkat)*
   *   *Petunjuk:* Tulis huruf kecil tanpa spasi, gunakan tanda hubung `-` (contoh: `warung-bu-sumi`). Ini dipakai untuk mencetak QR Code.
10. **Produk/Jasa Unggulan** *(Tipe: Jawaban Singkat)*
    *   *Contoh:* `Nasi Pecel, Pecel Tumpang, Tempe Mendoan`. Batasi dengan tanda koma.
11. **Jam Operasional** *(Tipe: Jawaban Singkat)*
    *   *Petunjuk:* Harus berformat `HH:MM - HH:MM` dengan spasi di antara tanda hubung (contoh: `08:00 - 17:00` atau `06:30 - 21:00`).
12. **Kisah Inspiratif UMKM** *(Tipe: Paragraf - Opsional)*
    *   *Petunjuk:* Ceritakan sejarah berdirinya usaha, keunikan produk, resep rahasia, atau perjuangan pemilik usaha untuk dimuat di halaman web.

---

## 🟡 LANGKAH 2: PENGATURAN GOOGLE SHEETS & PEMETAAN (MAPPING)

1. Buka tab **Responses (Jawaban)** di Google Form Anda, lalu klik tombol **Link to Sheets (Hubungkan ke Spreadsheet)** untuk membuat lembar kerja baru.
2. Tab pertama otomatis terbentuk dengan nama **`Jawaban Formulir 1`** (berisi kolom *Timestamp* di kolom A, diikuti pertanyaan Anda di kolom B, C, dst).
3. Buat **tab kedua** di file spreadsheet tersebut dengan mengklik ikon **`+` (Tambah lembar)** di pojok kiri bawah. Beri nama tab kedua ini **`Data_Web`**.
4. Di baris pertama tab **`Data_Web`** (sel **A1** sampai **L1**), tulis header kolom berikut secara persis (semua huruf kecil):
   ```text
   nama_usaha | kategori | deskripsi | latitude | longitude | kontak_wa | link_foto | link_gmaps | id_unik | produk_unggulan | jam_operasional | cerita_umkm
   ```
5. Di baris kedua tepat di bawah header tersebut (sel **A2** sampai **L2**), masukkan rumus Excel berikut untuk menarik data dari tab pertama secara otomatis:
   *   Di sel **A2** (nama_usaha)  : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!B2)`
   *   Di sel **B2** (kategori)    : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!C2)`
   *   Di sel **C2** (deskripsi)   : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!D2)`
   *   Di sel **D2** (latitude)    : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!E2)`
   *   Di sel **E2** (longitude)   : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!F2)`
   *   Di sel **F2** (kontak_wa)   : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!G2)`
   *   Di sel **G2** (link_foto)   : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!H2)`
   *   Di sel **H2** (link_gmaps)  : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!I2)`
   *   Di sel **I2** (id_unik)     : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!J2)`
   *   Di sel **J2** (produk_unggulan): `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!K2)`
   *   Di sel **K2** (jam_operasional): `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!L2)`
   *   Di sel **L2** (cerita_umkm)  : `=IF('Jawaban Formulir 1'!B2=""; ""; 'Jawaban Formulir 1'!M2)`
6. **Tarik seluruh rumus di baris ke-2 ini ke bawah** (misal sampai baris 100 atau lebih) agar data baru otomatis terformat saat formulir diisi.

---

## 🔵 LANGKAH 3: PENGATURAN IZIN GOOGLE DRIVE (FOTO UPLOAD)

Agar browser pengunjung bisa memuat gambar hasil upload Google Form secara langsung:
1. Buka akun **Google Drive** Anda.
2. Cari folder otomatis tempat Google Forms menyimpan file unggahan (biasanya tersimpan di dalam folder bernama *"Pertanyaan Tanpa Judul (File Responses)"*).
3. Klik kanan pada folder tersebut -> Pilih **Bagikan (Share)** -> **Bagikan**.
4. Di bagian *Akses Umum (General Access)*, ubah status dari **Dibatasi (Restricted)** menjadi **"Siapa saja yang memiliki link" (Anyone with the link)**.
5. Pastikan hak aksesnya diatur sebagai **Pengakses Lihat-Saja (Viewer)**.
6. Klik **Selesai / Simpan**.

---

## 🟣 LANGKAH 4: HUBUNGKAN SHEET KE CODE & HOSTING GITHUB PAGES

### 1. Publikasikan Sheet sebagai CSV
1. Di Google Sheets Anda, klik menu **File** -> **Bagikan (Share)** -> **Publikasikan ke web**.
2. Di kotak dialog, pilih tab **Tautan (Link)**.
3. Ubah pilihan *Seluruh Dokumen (Entire Document)* menjadi **`Data_Web`** (tab kedua kita).
4. Ubah tipe file *Halaman Web (Web page)* menjadi **Nilai yang dipisahkan koma (.csv)**.
5. Klik **Publikasikan** dan salin URL tautan yang diberikan.

### 2. Hubungkan ke Kode
1. Buka file `app.js` menggunakan text editor.
2. Tempelkan URL CSV tersebut pada variabel di baris paling atas:
   ```javascript
   const GOOGLE_SHEET_CSV_URL = "URL_CSV_YANG_ANDA_SALIN_TADI";
   ```
3. Simpan file `app.js`.

### 3. Deploy ke GitHub Pages
1. Buat repositori baru di GitHub (misal: `radar-umkm-campurejo`) dan upload semua file proyek ini (`index.html`, `styles.css`, `app.js`, folder `data`, folder `geojson`) ke repositori tersebut.
2. Buka menu **Settings** repositori Anda -> pilih tab **Pages** di sebelah kiri.
3. Di bawah **Build and deployment**, ubah Source menjadi **Deploy from a branch**.
4. Pilih branch **main** (atau **master**) dan biarkan folder terpilih di **/(root)**. Klik **Save**.
5. Tunggu 1 menit. Halaman Settings Pages akan memunculkan link web aktif Anda:
   `https://[username].github.io/radar-umkm-campurejo/`

---

## 📲 Cara Penggunaan Link QR Code

Untuk menautkan QR Code di meja pelaku UMKM langsung ke pin lokasi mereka di web:
```text
https://[username].github.io/radar-umkm-campurejo/?umkm=[id_unik_umkm]
```
*Contoh:*
`https://adit.github.io/radar-umkm-campurejo/?umkm=warung-bu-sumi`
Ketika dipindai, web otomatis ter-load, kamera langsung terbang (*fly*) memusatkan ke titik Warung Bu Sumi, dan dialog rute/kisah langsung terbuka secara otomatis.
