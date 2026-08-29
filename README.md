# Bangjago

Bot Discord untuk tanya-jawab keamanan siber: pentest, jaringan, kripto, malware analysis, hardening, incident response, secure coding, OSINT, CTF, forensik.

Backend-nya akun ChatGPT lewat OAuth, bukan API key, jadi tidak ada biaya per-token. Jawaban di-stream supaya tidak kepotong di tengah. Bot juga bisa bikin thread, bikin channel, dan kirim file.

Pertanyaan di luar keamanan siber ditolak, begitu juga permintaan menyerang sistem yang bukan milik penanya.

## Pakai

Mention bot, tulis perintahnya:

```
@bangjago beri materi lengkap ctf jeopardy
@bangjago jelaskan SQL injection
@bangjago buat thread write up untuk "The Command Line Murders"
@bangjago buat file markdown berisi command linux
@bangjago buat channel ctf-discussion
@bangjago kirim pesan ke #general halo semua
@bangjago login
```

## Jalankan

Butuh Node.js 18+ dan akun ChatGPT. Bot Discord-nya perlu permission `Send Messages`, `Manage Threads`, `Manage Channels`, dan `Read Message History`.

```bash
cp .env.example .env      # isi DISCORD_TOKEN
npm install
npm start
```

Sukses kalau log-nya:

```
OAuth OpenAI siap (exp ...)
online: bangjago#8888
```

Kalau muncul `provide token`, bot belum punya kredensial ChatGPT. Bilang `@bangjago login`, buka link yang dikirim, selesaikan di browser. Token tersimpan di `~/.config/bangjago/openai-oauth.json` dan terminal mencetak refresh token-nya.

## Deploy

Login OAuth tidak bisa dilakukan dari server. `client_id` yang dipakai hanya mendaftarkan `http://localhost:1455/auth/callback`, jadi callback publik selalu ditolak dengan `invalid_authorize_request`.

Jadi: login lokal sekali, lalu pindahkan refresh token-nya sebagai env di server.

```bash
fly secrets set "OPENAI_REFRESH_TOKEN=<nilai>" -a bangjago
```

Kalau `OPENAI_REFRESH_TOKEN` ada, bot menukarnya jadi access token saat start dan tidak menjalankan login listener.

Satu batasan: refresh token dirotasi setiap dipakai. Instance lokal dan instance deploy tidak bisa berbagi satu token — begitu yang satu refresh, yang lain mati. Jalankan satu saja.

Docker:

```bash
docker build -t bangjago .
docker run -d --name bangjago \
  -e DISCORD_TOKEN=... \
  -e OPENAI_REFRESH_TOKEN=... \
  bangjago
```

## Environment

| Variabel              | Keterangan                                                            |
| --------------------- | --------------------------------------------------------------------- |
| `DISCORD_TOKEN`       | Token bot Discord. Wajib.                                             |
| `OPENAI_REFRESH_TOKEN`| Refresh token OAuth. Untuk deploy; menang atas file token.             |
| `OPENAI_MODEL`        | Default `gpt-5.6-luna`.                                               |
| `OPENAI_OAUTH_PATH`   | Default `~/.config/bangjago/openai-oauth.json`.                        |
| `OAUTH_PORT`          | Port callback login lokal. Default `1455`.                            |

## Struktur

```
src/
  index.ts            # boot Discord, route pesan
  config.ts           # system prompt & konstanta backend
  discord/
    say.ts            # split pesan aman markdown + reply
    intents.ts        # deteksi perintah
    actions.ts        # eksekusi aksi Discord
  ai/
    generate.ts       # streaming SSE + lanjut kalau terpotong
  oauth.ts            # login PKCE, refresh, store token
```

## Catatan teknis

Streaming lewat `chatgpt.com/backend-api/codex/responses` dengan `stream:true`, di-parse per event `response.output_text.delta`. Kalau stream putus atau kosong, retry dengan backoff; jawaban panjang dilanjutkan berlapis sampai `MAX_CHUNKS`.

Kredensial disimpan sendiri, tidak bergantung instalasi opencode.

## Lisensi

MIT
