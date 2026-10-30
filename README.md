# Layar 3 · Private Cinema

Aplikasi katalog film dan series untuk laptop Windows, HP Android, dan Android TV. UI menyesuaikan perangkat: navigasi atas dan banner sinematik di laptop/TV, navigasi bawah di HP.

## Download sesuai perangkat

Buka [halaman Releases](https://github.com/bramafajar25-gif/layar-andro-tv/releases/latest), lalu pilih file di bagian **Assets**:

| Perangkat | File download | Cara menjalankan |
| --- | --- | --- |
| Laptop Windows x64 | `Layar-Windows-Laptop-v3.0.5-x64.zip` | Ekstrak seluruh ZIP, buka `Layar.exe`. Tidak perlu Node.js/npm. |
| **Android TV / TV Box** | `Layar-Android-TV-v3.0.5.apk` | Pasang di TV. Nama aplikasi **Layar TV**, mode remote dan landscape. |
| **Android HP / Tablet** | `Layar-Android-HP-v3.0.5.apk` | Pasang di HP/tablet. Nama aplikasi **Layar HP**, mode sentuh dan katalog portrait/landscape. |

Tersedia **tiga download terpisah: Windows, Android TV, dan Android HP**. Varian TV dan HP memiliki identitas aplikasi berbeda. Jangan pilih arsip **Source code** untuk pemasangan biasa. Jika release terbaru masih dibuild, cek [progres build](https://github.com/bramafajar25-gif/layar-andro-tv/actions/workflows/build-apk.yml). Release baru diterbitkan setelah ketiga paket berhasil dibuat.

APK memakai debug key CI. Jika update APK lama ditolak karena tanda tangan berbeda, instalasi lama perlu dihapus terlebih dahulu (data lokal ikut terhapus).

## Episode dan kualitas player

- Scrollbar disembunyikan di katalog, modal, daftar episode, dan player; scrolling tetap tersedia.
- Detail series menggunakan backdrop, tab Overview / Episodes / Details, timeline season, dan kartu episode dengan durasi. Status **Pernah diputar** mencatat episode yang dibuka, bukan klaim selesai menonton.
- Katalog HP mengikuti orientasi perangkat; player Android tetap landscape. Android TV memakai fokus D-Pad dan efek tanpa blur berat.
- Tombol **Kualitas video dan audio** di player laptop dan **Kualitas & audio** di Android menampilkan resolusi aktif serta format audio yang berhasil dibaca dari manifest HLS. Format di manifest tidak menjamin keluaran speaker.
- Auto / 720p / 1080p / 4K hanya ditawarkan jika player sumber mengekspos pilihan itu. Bila API kualitas tidak tersedia, gunakan menu kualitas bawaan sumber; tidak ada peningkatan resolusi buatan.
- Toggle passthrough di popup laptop berlaku pada sesi mpv berikutnya. WebView Android belum mendukung passthrough; toggle-nya dinonaktifkan dengan penjelasan.

## Menjalankan source di laptop

Klik dua kali **Layar.vbs** setelah memasang komponen:

```powershell
npm.cmd ci
npm.cmd start
```

Panduan laptop: [dist/desktop/Panduan.md](dist/desktop/Panduan.md). Untuk membuat folder aplikasi Windows portabel dari source pada Windows: `npm.cmd run package:windows`. Output masuk `dist/windows/` dan tidak menyertakan source Android, profil pribadi, atau file marketing.

Pilihan **ID / EN** di navigasi atas atau **Pengaturan → Bahasa tampilan** mengganti bahasa menu tanpa restart dan tersimpan lokal. Bahasa tampilan terpisah dari judul, sinopsis, serta subtitle sumber. Sub Indo tidak dijamin untuk seluruh katalog; pilih Indonesia di menu CC/Subtitle player bila tersedia. Indikator subtitle hanya menyatakan track yang terdeteksi, bukan jaminan untuk judul lain.

Source Android ada di `android/`; source desktop ada di `desktop/`. Workflow [Build Windows and Android Downloads](.github/workflows/build-apk.yml) menjalankan tes, menyalin aset web ke Android, lalu membuat APK dan ZIP Windows dalam job terpisah. Artifact bernama `Layar-Android-TV`, `Layar-Android-HP`, dan `Layar-Windows-Laptop`. Android menggunakan flavor `tv` dan `mobile`, dengan label launcher dan konfigurasi perangkat masing-masing. Pada branch `main`, ketiganya dipublikasikan bersama di Releases. Android memakai Activity player sendiri; mpv dan pengaturan ukuran player hanya berlaku di desktop.

Pemutaran internal menggunakan Electron WebContentsView terisolasi. Pop-up ditolak; filter iklan dapat dimatikan jika sumber bermasalah. Verifikasi dan waktu tunggu dari server tetap berlaku. Tidak ada file film yang disimpan atau diunduh.

4K dan Dolby Atmos membutuhkan video/track asli, decoder dan perangkat yang sesuai. Layar memeriksa decoder, menampilkan resolusi aktif, dan membaca kualitas manifest jika tersedia; kualitas tidak dibuat-buat. mpv harus dipilih lewat Pengaturan dan tidak dibundel. Gunakan **Buka file** untuk video lokal atau **Putar di mpv** untuk stream HLS kompatibel; sumber dengan player khusus tetap memakai player internal. Subtitle terpisah dari sumber belum diteruskan ke mpv. Dukungan passthrough mengikuti [dokumentasi mpv](https://mpv.io/manual/stable/#options-audio-spdif); pemeriksaan decoder Atmos mengikuti [contoh Dolby](https://optiview.dolby.com/docs/theoplayer/examples/streaming/dolby-atmos/).

Mode pratinjau browser lokal: `node server.cjs`, lalu `http://127.0.0.1:5173/`. Player dalam aplikasi tersedia melalui Layar.vbs. Pemeriksaan: `npm.cmd test`; uji integrasi sumber langsung: `npm.cmd start -- --smoke-test` (membutuhkan koneksi ke IDLIX).
