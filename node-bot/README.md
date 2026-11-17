# Bot-music (Node)

Bot musik Discord pengganti JMusicBot (JMusicBot 0.4.3 sudah tidak bisa
memutar YouTube — source manager bawaannya gagal membaca player script
YouTube yang sekarang, jadi lagu gagal load dan bot keluar-masuk VC).

Bot ini pakai discord.js v14 + @discordjs/voice + yt-dlp + ffmpeg.
Satu token Discord dipakai satu bot dalam satu waktu — matikan dulu
JMusicBot sebelum menjalankan bot ini.

## Setup

1. `npm install`
2. Copy `.env.example` jadi `.env`, isi `DISCORD_TOKEN` (token bot) dan
   `OWNER_ID` (ID Discord kamu).
3. `node index.js` atau `npm start`
4. Di Discord, bot harus punya izin Connect + Speak di VC.

## PENTING: tidak bisa jalan di VM ini

Bot ini **tidak bisa memutar suara dari VM ini** — suara Discord pakai UDP
dan UDP diblokir total di server ini (socket UDP ditolak OS, sudah dites).
Jadi jalankan bot ini dari laptop/PC kamu (Windows):

1. Install Node.js LTS, ffmpeg, dan yt-dlp di laptop
   (paling gampang: `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg yt-dlp`).
2. `git clone https://github.com/itzadanplayzz/Bot-Music.git`,
   lalu `cd Bot-Music/node-bot`.
3. `npm install`
4. Copy `.env.example` jadi `.env`, isi token botnya.
5. `node index.js` — bot online, lalu di Discord pakai `!play` di VC.
   (yt-dlp harus ada di PATH; kalau mau ditaruh lokal, simpan sebagai
   `bin/yt-dlp.exe`.)

## Command (prefix `!` atau mention bot)

- `!play <link YouTube / judul lagu>` — putar lagu (judul dicari di YouTube)
- `!skip` — lewati lagu
- `!stop` — berhenti dan keluar VC
- `!queue` — lihat antrean
- `!np` — lagu yang lagi muter
- `!pause` / `!resume`
- `!volume 0-100`
- `!help`

## Catatan

- yt-dlp dibundel di `bin/yt-dlp` dan dipanggil dengan
  `--no-check-certificate` (perlu karena proxy sandbox mem-MITM TLS).
- Kalau antrean kosong, bot keluar VC sendiri setelah 60 detik.
- `.env` berisi token — jangan pernah di-commit (sudah di-`.gitignore`).
