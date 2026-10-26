# Layar 3 · Private Cinema

Layar sekarang khusus laptop Windows. Buka `Layar.vbs` dari folder utama. APK HP, Android TV, server jaringan Android, SDK, dan Gradle sudah dihapus.

## Mulai menonton

1. Pilih film dari Beranda atau menu Film di navigasi atas. Tombol **Putar** pada banner langsung membuka player. **Info lainnya** membuka detail judul; kartu beranda berbentuk mendatar.
2. Untuk series, buka detail, pilih season, lalu episode.
3. Klik ikon pencarian di kanan atas atau tekan `/` untuk mencari judul. Simpan pilihan dengan `+` ke Daftarku. Ikon folder membuka file lokal dan ikon profil merah membuka Pengaturan.
4. `Esc` menutup player. `F11` atau tombol layar penuh mengganti mode layar.

Daftarku dan episode terakhir tetap tersimpan di laptop. Riwayat mencatat episode yang dibuka, belum menyimpan posisi menit video internal.

## Bahasa tampilan

Pilih **ID / EN** di navigasi kanan atas, atau buka **Pengaturan → Bahasa tampilan → English**. Menu, detail, episode, tombol player, dan pesan aplikasi berganti langsung. Pilihan tersimpan saat Layar ditutup dan dibuka lagi. Mengganti bahasa saat menonton tidak memulai ulang video.

Bahasa ini hanya untuk tampilan Layar. Judul, sinopsis, dan menu player dari penyedia bisa tetap memakai bahasa sumber. Pilihan ini tidak mengubah bahasa subtitle atau membuat terjemahan film.

## Subtitle Indonesia

**Sub Indo tidak dijamin tersedia untuk semua film atau episode.** Data katalog tidak mencantumkan daftar subtitle lengkap untuk setiap judul. Saat video diputar, buka menu **CC / Subtitle** pada player sumber dan pilih **Indonesia / Indonesian** jika ada.

Jika track Indonesia dapat dibaca dari player, Layar menampilkan **Sub Indo terdeteksi**. Jika belum dapat dibaca, tampil **Subtitle: cek menu CC**; ini belum membuktikan ada atau tidaknya sub Indo karena sebagian sumber merender subtitle lewat player khusus. Bahasa menu English tetap bisa dipakai bersama subtitle Indonesia.

Subtitle situs belum diteruskan ke mpv. Untuk **Buka file**, gunakan track subtitle di dalam file atau tambahkan file subtitle sendiri melalui mpv.

## Iklan

Pengaturan **Lewati iklan otomatis** aktif secara bawaan. Layar memblokir pop-up, beberapa jaringan iklan, dan permintaan VAST praputar, serta mengklik tombol Lewati yang tersedia. Verifikasi dan waktu tunggu yang ditentukan server tetap bisa muncul. Tidak semua iklan yang menyatu dengan video dapat dilewati. Jika sumber gagal memutar, matikan opsi ini di Pengaturan lalu muat ulang.

## 4K dan Dolby Atmos

Resolusi aktif ditampilkan sesuai dimensi video yang sedang diputar. Informasi kualitas sumber dibaca dari manifest HLS ketika tersedia. Label Atmos hanya ditampilkan bila manifest menyatakan JOC; codec Dolby Digital Plus saja tidak membuktikan Atmos.

Player internal dapat memutar 4K jika sumber, codec, GPU, dan jaringan mendukung. Pengaturan memeriksa decoder 2160p, HEVC, dan audio spasial di laptop. Ini bukan pengukuran kemampuan layar, speaker, atau headphone.

Untuk pilihan format dan audio HDMI yang lebih luas:

1. Pasang atau siapkan [mpv](https://mpv.io/installation/) untuk Windows secara terpisah.
2. Buka **Pengaturan → Pilih mpv.exe**. mpv tidak dibundel agar Layar tetap kecil.
3. Pilih kualitas mpv: **Hemat** memilih rendition hingga 2 Mbps, **Seimbang** hingga 8 Mbps, atau **Maksimum / 4K** memilih bitrate tertinggi yang tersedia. Jika tidak ada rendition di bawah batas, pilihan mengikuti perilaku mpv/sumber. Ini bukan konversi resolusi.
4. Mulai film di Layar. Untuk file milikmu di laptop, klik **Buka file** di bagian atas katalog. Untuk streaming, saat stream HLS kompatibel terdeteksi, klik **Putar di mpv**. Sumber yang memakai format terenkripsi/player khusus tetap harus diputar dengan player internal; tombol mpv belum tersedia untuk sumber tersebut. Player internal dijeda. Tutup mpv untuk kembali ke player internal atau muat ulang. Tutup player Layar untuk menutup mpv yang dibukanya.
5. Aktifkan **Dolby Atmos / DTS · passthrough** hanya untuk perangkat HDMI/receiver yang sesuai dan track asli E-AC-3/TrueHD Atmos atau DTS. Untuk speaker laptop biasa, biarkan mati.

Pemutaran eksternal memakai sesi stream yang sama; server yang mengikat stream ke player tertentu dapat menolak pemutaran eksternal. Subtitle dari penyedia dapat dipilih di player internal jika track tersedia; subtitle terpisah dari situs belum diteruskan ke mpv. 4K dan Atmos tidak tersedia untuk setiap judul. Video HD dan audio stereo tidak diubah menjadi 4K atau Atmos.

## Perawatan

Tidak ada backend Android yang perlu dijalankan. Player sumber hanya dibuat ketika mulai menonton dan dilepas ketika ditutup. Poster dimuat saat dibutuhkan, bagian katalog di luar layar ditunda rendering-nya, dan tidak ada preview video otomatis.

Pengaturan tersimpan di `.runtime/profile/playback.json`. Daftarku memakai profil desktop lama sehingga tetap tersedia. Cadangan kecil kunci penandatanganan Android disimpan di `.backup/retired-android-signing/`; alat build dan APK tidak dipertahankan.
