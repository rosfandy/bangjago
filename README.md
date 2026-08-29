# Bangjago — Discord Bot Ahli Cyber Security

Bot Discord yang ditugaskan untuk membantu seputar **keamanan siber**: pentest, jaringan, kripto, malware analysis, hardening, incident response, secure coding, OSINT, CTF, dan forensik. Ditenagai oleh **GPT-5.6 Luna via OAuth ChatGPT** (tanpa biaya API per-token), streaming penuh tanpa terpotong, dan bisa mengontrol Discord langsung — bikin thread, channel, sampai kirim file.

## Fitur

- 💬 **Jawab via AI** — bertanya apa saja soal cyber security, dijawab dalam Bahasa Indonesia dengan contoh command.
- 🎯 **Knows CTF** — materi jeopardy (web, crypto, pwn, reverse, forensik, OSINT), write-up, dan pembahasan challenge.
- 🧵 **Kontrol Discord** — perintah untuk membuat thread, membuat channel, dan mengirim pesan ke channel lain.
- 📄 **Generate file markdown** — hasil generate dikirim sebagai lampiran `.md` yang bisa diunduh.
- 🛡️ **Filter topik** — menolak pertanyaan di luar keamanan siber & permintaan menyerang sistem yang bukan milik penanya.
- 📡 **Streaming output panjang** — jawaban panjang diproses streaming sehingga tidak kepotong di tengah (beda dengan relay yang gampang `529`/`truncated`).

## Cara Pakai

Di server Discord, **mention bot** lalu tulis perintahnya, contoh:

```
@bangjago beri materi lengkap ctf jeopardy
@bangjago jelaskan SQL injection
@bangjago buat thread write up untuk "The Command Line Murders"
@bangjago buat file markdown berisi command linux
@bangjago buat channel ctf-discussion
@bangjago kirim pesan ke #general halo semua
@bangjago login          # kalau AI belum login ke akun ChatGPT
```

## Cara Menjalankan

### 1. Prasyarat

- Node.js 18+ (disarankan 20+)
- Bot Discord (token dari [Discord Developer Portal](https://discord.com/developers/applications)) dengan permission:
  - `Send Messages`
  - `Manage Threads` (buat thread)
  - `Manage Channels` (buat channel)
  - `Read Message History`
  - `Mention Everyone`/`Use slash commands` (opsional)
- Akun ChatGPT (Free/Plus/Pro) sebagai backend AI via OAuth

### 2. Setup environment

```bash
cp .env.example .env
```

Isi `DISCORD_TOKEN` di `.env`:

```
DISCORD_TOKEN=token_bot_kamu
```

> Bot memakai **OAuth ChatGPT** (bukan API key). Kalau store token belum ada, cukup bilang `@bangjago login` di Discord — bot kirim link login, buka di browser, lalu token tersimpan otomatis di `~/.config/bangjago/openai-oauth.json`.

### 3. Instalasi & jalankan

```bash
npm install
npm start
```

Log sukses menandakan bot online:

```
OAuth OpenAI siap (exp ...)
online: bangjago#8888
```

### 4. Jalankan dengan Docker (opsional)

```bash
docker build -t bangjago .
docker run -d --name bangjago \
  -e DISCORD_TOKEN=token_bot_kamu \
  -v bangjago-oauth:/root/.config/bangjago \
  bangjago
```

- `-v bangjago-oauth:/root/.config/bangjago` menyimpan token OAuth supaya login ChatGPT tidak hilang saat container restart.
- Port `1455` (callback login OAuth) hanya relevan untuk login dari host; lewati jika login tidak dipakai di dalam container (token bisa di-copy via volume).
- Environment seperti `OPENAI_MODEL` bisa ditambahkan lewat `-e`.

## Konfigurasi (`.env`)

| Variabel          | Keterangan                                          |
| ----------------- | --------------------------------------------------- |
| `DISCORD_TOKEN`   | Token bot Discord (wajib)                            |
| `OPENAI_MODEL`    | Model AI (default: `gpt-5.6-luna`)            |
| `OPENAI_OAUTH_PATH` | Lokasi file token OAuth (default: `~/.config/bangjago/openai-oauth.json`) |
| `OAUTH_PORT`      | Port callback OAuth (default: `1455`)                  |
| `OAUTH_REDIRECT_URI` | URL callback OAuth — harus persis yang didaftarkan utk client (default: `http://localhost:1455/auth/callback`) |

## Struktur

```
src/
  index.ts            # entry: boot Discord, route pesan, login OAuth
  config.ts           # system prompt & konstanta backend AI
  discord/
    say.ts            # pesan Discord: smartSplit (aman markdown) + reply
    intents.ts        # deteksi perintah (thread, channel, file md, kirim pesan)
    actions.ts        # eksekusi aksi Discord (thread/channel/file/send)
  ai/
    generate.ts       # streaming ChatGPT (SSE) + lanjut otomatis kalau terpotong
  oauth.ts            # OAuth ChatGPT: login (PKCE+state), refresh, store mandiri
```

## Teknis Singkat

- **OAuth ChatGPT**: bot login via `auth.openai.com` (PKCE + state, redirect `http://localhost:1455/auth/callback`). Refresh token otomatis.
- **Streaming**: memanggil `chatgpt.com/backend-api/codex/responses` dengan `stream:true`, di-parse per event `response.output_text.delta` supaya output utuh & tidak dobel.
- **Tanpa fallback ke opencode**: kredensial disimpan mandiri, tidak tergantung instalasi opencode.
- **Anti-putus**: kalau stream terputus/empty, otomatis retry dengan backoff, dan jawaban panjang dilanjutkan berlapis (`MAX_CHUNKS`).

## Lisensi

MIT