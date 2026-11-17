# Bot-Music

Bot musik Discord berbasis [JMusicBot](https://github.com/jagrosh/MusicBot) 0.4.3.
Panduan lengkap: https://jmusicbot.com/setup/

## Cara jalanin

1. Install Java 11:
   - Ubuntu/Debian: `sudo apt-get install openjdk-11-jre -y`
2. Download jar terbaru dari
   https://github.com/jagrosh/MusicBot/releases
   lalu taruh `JMusicBot-0.4.3.jar` di folder ini.
3. Copy `config.example.txt` jadi `config.txt`, isi `token` dan `owner`
   (ID Discord kamu — lihat https://jmusicbot.com/finding-your-user-id/).
4. Jalanin:
   ```
   java -Dnogui=true -jar JMusicBot-0.4.3.jar
   ```
   atau `./run.sh`, lalu tunggu pesan "Finished Loading".
5. Invite bot ke server pakai link yang muncul di console saat pertama jalan.

## Catatan

- `config.txt` berisi token — JANGAN PERNAH di-commit. File itu sudah masuk
  `.gitignore`, begitu juga file `.jar` dan log.
- Di Discord Developer Portal, pastikan "Public Bot" tidak dicentang, dan
  "Message Content Intent" + "Server Members Intent" dicentang.
- Prefix default bot adalah mention (`@Botname play`).
