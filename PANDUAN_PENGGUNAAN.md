# Panduan Penggunaan Judol Detector

Panduan lengkap mulai dari mengunduh ekstensi hingga menggunakan seluruh fiturnya.

---

## Daftar Isi

1. [Unduh Ekstensi](#1-unduh-ekstensi)
2. [Ekstrak File ZIP](#2-ekstrak-file-zip)
3. [Aktifkan Developer Mode di Browser](#3-aktifkan-developer-mode-di-browser)
4. [Pasang Ekstensi](#4-pasang-ekstensi)
5. [Tampilan Popup](#5-tampilan-popup)
6. [Fitur: Aktifkan / Nonaktifkan Ekstensi](#6-fitur-aktifkan--nonaktifkan-ekstensi)
7. [Fitur: Mode Sensor](#7-fitur-mode-sensor)
8. [Fitur: Hasil Deteksi](#8-fitur-hasil-deteksi)
9. [Fitur: Blokir Situs](#9-fitur-blokir-situs)
10. [Fitur: Laporkan ke Komdigi](#10-fitur-laporkan-ke-komdigi)
11. [Fitur: Daftar Blokir](#11-fitur-daftar-blokir)
12. [Fitur: Hapus Cache](#12-fitur-hapus-cache)
13. [Informasi Tambahan](#13-informasi-tambahan)

---

## 1. Unduh Ekstensi

1. Buka landing page Judol Detector di browser.
2. Klik tombol **Download Ekstensi** atau **Unduh**.
3. File akan terunduh dalam format `.zip` ke folder Downloads kamu.

---

## 2. Ekstrak File ZIP

1. Buka folder **Downloads** di komputer.
2. Klik kanan pada file `judol-detector.zip` → pilih **Extract All** (Windows) atau **Open With > Archive Utility** (Mac).
3. Pilih lokasi ekstrak, misalnya `D:\judol-detector\` atau folder mana saja yang mudah diakses.
4. Setelah diekstrak, pastikan ada folder bernama `extension` di dalamnya yang berisi file `manifest.json`.

> Jangan hapus atau pindahkan folder ini setelah ekstensi dipasang. Browser mengambil file dari lokasi tersebut.

---

## 3. Aktifkan Developer Mode di Browser

Ekstensi ini dipasang secara manual (unpacked), sehingga **Developer Mode** perlu diaktifkan terlebih dahulu.

### Google Chrome / Microsoft Edge

1. Buka browser, ketik di address bar:
   ```
   chrome://extensions/
   ```
   atau untuk Edge:
   ```
   edge://extensions/
   ```
2. Tekan **Enter**.
3. Di pojok kanan atas halaman, aktifkan toggle **Developer mode**.

   Setelah aktif, akan muncul tiga tombol baru: **Load unpacked**, Pack extension, dan Update.

### Brave Browser

Langkahnya sama seperti Chrome — buka `brave://extensions/` lalu aktifkan **Developer mode**.

---

## 4. Pasang Ekstensi

1. Masih di halaman Extensions, klik tombol **Load unpacked**.
2. Navigasi ke folder hasil ekstrak tadi.
3. Pilih folder `extension` (folder yang berisi `manifest.json`), lalu klik **Select Folder**.
4. Ekstensi **Judol Detector** akan langsung muncul di daftar ekstensi terpasang.
5. Pastikan toggle di card ekstensi dalam posisi **aktif** (biru).
6. Ikon Judol Detector akan muncul di toolbar browser (pojok kanan atas). Jika tidak terlihat, klik ikon puzzle 🧩 di toolbar lalu pin Judol Detector.

---

## 5. Tampilan Popup

Klik ikon Judol Detector di toolbar untuk membuka popup. Popup terdiri dari beberapa bagian:

```
┌─────────────────────────────────┐
│  Judol Detector          ● Aktif │  ← Header: nama & status
├─────────────────────────────────┤
│  Aktifkan Ekstensi      [toggle] │  ← Toggle utama
│  Mode Sensor            [toggle] │  ← Toggle sensor/blur
├─────────────────────────────────┤
│  [Hasil deteksi halaman ini]     │  ← Area hasil (muncul setelah scan)
├─────────────────────────────────┤
│  🔒 Daftar Blokir   🗑 Hapus Cache │  ← Footer
└─────────────────────────────────┘
```

---

## 6. Fitur: Aktifkan / Nonaktifkan Ekstensi

Toggle **Aktifkan Ekstensi** mengontrol apakah Judol Detector berjalan atau tidak.

**Kondisi ON:**
- Setiap halaman yang dibuka akan otomatis dianalisis.
- Indikator loading kecil muncul di pojok kanan bawah halaman saat analisis berlangsung.
- Hasil deteksi ditampilkan di popup setelah analisis selesai.

**Kondisi OFF:**
- Tidak ada analisis yang berjalan.
- Semua blur/sensor yang sudah diterapkan di halaman akan dihapus.
- Badge `!` di ikon ekstensi akan hilang.

> Pengaturan ini tersimpan permanen — tidak akan berubah meski browser ditutup dan dibuka kembali.

---

## 7. Fitur: Mode Sensor

Toggle **Mode Sensor** mengontrol apakah konten yang terdeteksi sebagai judol akan disembunyikan (blur/sensor).

**Kondisi ON:**
- Gambar yang teridentifikasi sebagai konten judol ditutup dengan overlay hitam dan ikon 🚫.
- Teks yang mengandung kata kunci judol (slot gacor, maxwin, togel, dll.) diblur.
- Link/anchor yang mengarah ke situs judol dinonaktifkan dan diblur.
- Banner iklan sponsor judol langsung disensor tanpa menunggu hasil API.

**Kondisi OFF:**
- Semua blur dihapus, konten kembali terlihat normal.
- Deteksi tetap berjalan, tapi tidak ada yang disembunyikan.

> Mode Sensor bisa diaktifkan/nonaktifkan kapan saja, termasuk di tengah sesi browsing.

---

## 8. Fitur: Hasil Deteksi

Setelah halaman selesai dianalisis, popup akan menampilkan salah satu dari tiga kondisi:

### Halaman Aman
Ditampilkan kartu hijau kecil dengan teks **"Halaman ini aman"**. Artinya model tidak mendeteksi promosi judol di halaman tersebut.

### Terdeteksi Judol
Ditampilkan panel merah dengan informasi berikut:

| Baris | Keterangan |
|-------|-----------|
| **Analisis Gambar** | Confidence dari model ResNet34 (deteksi visual) |
| **Analisis Teks** | Confidence dari model IndoBERT (deteksi teks) |
| **Analisis Fusion** | Confidence dari model gabungan (Self-Attention) |
| **Skor Akhir** | Hasil akhir weighted late fusion |

Setiap baris ditampilkan dalam bentuk bar animasi dan persentase. Skor akhir di atas threshold (60%) berarti halaman diklasifikasikan sebagai situs promosi judol.

### Sedang Mendeteksi
Ditampilkan spinner dengan teks **"Mendeteksi halaman..."** selama proses analisis berlangsung (maksimal sekitar 60 detik).

### Server Tidak Tersedia
Muncul jika API tidak merespons setelah beberapa kali percobaan ulang. Ini biasanya terjadi saat server baru saja dinyalakan (*cold start*). Coba kembali beberapa saat kemudian.

---

### Overlay Warning di Halaman

Saat judol pertama kali terdeteksi di sebuah halaman (bukan dari cache), muncul overlay peringatan di tengah layar:

- Menampilkan skor kepercayaan deteksi
- Tombol **Blokir Situs Ini** — menambahkan domain ke daftar blokir dan redirect ke halaman blokir
- Tombol **Laporkan ke Komdigi** — membuka aduankonten.id dengan URL halaman sudah tersalin ke clipboard
- Tombol **Lanjut Akses Situs** — menutup overlay dan melanjutkan browsing (sensor tetap aktif jika Mode Sensor ON)

---

## 9. Fitur: Blokir Situs

Memblokir sebuah domain agar tidak bisa diakses melalui browser selama ekstensi aktif.

### Cara memblokir dari overlay warning:
Klik tombol **Blokir Situs Ini** pada overlay peringatan yang muncul saat judol terdeteksi.

### Cara memblokir dari popup:
Saat halaman terdeteksi judol, klik tombol **Blokir Situs Ini** di dalam panel deteksi pada popup.

### Setelah diblokir:
Setiap kali domain tersebut dibuka, browser akan otomatis diarahkan ke halaman **"Situs Ini Diblokir"** yang menampilkan nama domain yang diblokir dan tombol untuk mengelola daftar blokir.

---

## 10. Fitur: Laporkan ke Komdigi

Melaporkan situs judol ke platform aduan resmi Kementerian Komunikasi dan Digital (Komdigi).

1. Klik tombol **Laporkan ke Komdigi** — bisa dari overlay warning di halaman maupun dari popup.
2. URL halaman yang sedang dibuka otomatis disalin ke clipboard.
3. Browser membuka tab baru ke **aduankonten.id**.
4. Tempel (Ctrl+V) URL yang sudah tersalin ke form pelaporan di situs tersebut.

---

## 11. Fitur: Daftar Blokir

Halaman manajemen untuk melihat, menambah, mencari, dan menghapus domain yang diblokir.

**Cara membuka:** Klik link **🔒 Daftar Blokir** di footer popup.

### Apa yang bisa dilakukan di halaman ini:

**Melihat daftar blokir**
Semua domain yang pernah diblokir ditampilkan dalam daftar beserta favicon masing-masing.

**Menambah domain secara manual**
Ketik nama domain (contoh: `slotonline123.com`) atau URL lengkap di kolom input, lalu klik **Tambah** atau tekan Enter. Domain akan langsung aktif diblokir.

**Mencari domain**
Gunakan kolom pencarian di bagian atas daftar untuk memfilter domain berdasarkan nama.

**Menghapus satu domain**
Klik ikon tempat sampah di sebelah kanan nama domain. Domain akan dihapus dari blokir dan bisa diakses kembali.

**Hapus semua blokir**
Klik tombol **Hapus Semua** lalu konfirmasi di dialog yang muncul. Semua domain akan dihapus sekaligus.

---

## 12. Fitur: Hapus Cache

Judol Detector menyimpan hasil deteksi setiap halaman secara lokal agar halaman yang sama tidak perlu dianalisis ulang. Cache ini juga menyimpan elemen mana saja yang perlu diblur.

**Cara menghapus cache:** Klik link **🗑 Hapus Cache** di footer popup.

**Kapan perlu menghapus cache:**
- Halaman yang sebelumnya terdeteksi judol sudah diubah/dihapus konten judolnya, tapi ekstensi masih menampilkan hasil lama.
- Halaman yang sebelumnya aman sekarang berisi konten judol baru, tapi ekstensi tidak mendeteksi karena masih pakai cache lama.
- Ingin memaksa scan ulang dari awal untuk semua halaman.

> Menghapus cache tidak menghapus daftar blokir.

---

## 13. Informasi Tambahan

### Halaman yang tidak di-scan
Beberapa halaman sengaja dilewati untuk menghindari false positive:
- Halaman hasil pencarian Google, Bing, DuckDuckGo, dan search engine lainnya
- Domain `aduankonten.id` (platform pelaporan resmi)
- Tab yang sedang tidak aktif (background tabs) — akan di-scan saat tab dibuka

### Indikator di toolbar
- **Titik hijau** di pojok kiri header popup → ekstensi aktif
- **Badge `!`** merah di ikon ekstensi → halaman saat ini terdeteksi judol

### Server cold start
Backend di-deploy di Hugging Face Spaces. Jika tidak ada request dalam beberapa waktu, server akan tidur dan butuh waktu sekitar 30–60 detik untuk menyala kembali. Ekstensi akan otomatis retry hingga 3 kali. Jika tetap gagal, muncul notifikasi "Server sedang tidak tersedia" di halaman.

### Privasi
Judol Detector tidak menyimpan data browsing kamu di server. Teks dan gambar halaman hanya dikirim ke API untuk keperluan analisis dan tidak disimpan secara permanen.
