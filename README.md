# Layar 3 · Private Cinema

Aplikasi khusus laptop Windows untuk katalog film dan series IDLIX. Tampilan streaming dengan navigasi atas, banner judul memenuhi lebar layar, dan deretan kartu mendatar. Mendukung Daftarku, pemilihan season/episode, blokir pop-up, lewati iklan otomatis saat tersedia, serta integrasi mpv opsional untuk kualitas tertinggi dan audio passthrough.

Klik dua kali **Layar.vbs**. Tidak perlu server Android atau API key. Untuk pemasangan komponen pertama:

```powershell
npm.cmd ci
npm.cmd start
```

Panduan lengkap: [dist/desktop/Panduan.md](dist/desktop/Panduan.md).

Pilihan **ID / EN** di navigasi atas atau **Pengaturan → Bahasa tampilan** mengganti bahasa menu tanpa restart dan tersimpan lokal. Bahasa tampilan terpisah dari judul, sinopsis, serta subtitle sumber. Sub Indo tidak dijamin untuk seluruh katalog; pilih Indonesia di menu CC/Subtitle player bila tersedia. Indikator subtitle hanya menyatakan track yang terdeteksi, bukan jaminan untuk judul lain.

Versi HP dan Android TV, APK, server Android, SDK, dan Gradle telah dihapus. Profil desktop dan Daftarku tetap tersedia. Pengaturan kualitas mpv, filter iklan, dan passthrough disimpan lokal.

Pemutaran internal menggunakan Electron WebContentsView terisolasi. Pop-up ditolak; filter iklan dapat dimatikan jika sumber bermasalah. Verifikasi dan waktu tunggu dari server tetap berlaku. Tidak ada file film yang disimpan atau diunduh.

4K dan Dolby Atmos membutuhkan video/track asli, decoder dan perangkat yang sesuai. Layar memeriksa decoder, menampilkan resolusi aktif, dan membaca kualitas manifest jika tersedia; kualitas tidak dibuat-buat. mpv harus dipilih lewat Pengaturan dan tidak dibundel. Gunakan **Buka file** untuk video lokal atau **Putar di mpv** untuk stream HLS kompatibel; sumber dengan player khusus tetap memakai player internal. Subtitle terpisah dari sumber belum diteruskan ke mpv. Dukungan passthrough mengikuti [dokumentasi mpv](https://mpv.io/manual/stable/#options-audio-spdif); pemeriksaan decoder Atmos mengikuti [contoh Dolby](https://optiview.dolby.com/docs/theoplayer/examples/streaming/dolby-atmos/).

Mode pratinjau browser lokal: `node server.cjs`, lalu `http://127.0.0.1:5173/`. Player dalam aplikasi tersedia melalui Layar.vbs. Pemeriksaan: `npm.cmd test`; uji integrasi sumber langsung: `npm.cmd start -- --smoke-test` (membutuhkan koneksi ke IDLIX).
