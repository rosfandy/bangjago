# Bangjago

Discord bot for cyber security Q&A: pentesting, networking, crypto, malware analysis, hardening, incident response, secure coding, OSINT, CTF, forensics.

The backend is a ChatGPT account over OAuth rather than an API key, so there is no per-token cost. Responses are streamed so long answers don't get cut off mid-way. The bot can also create threads, create channels, and send files.

Questions outside cyber security are refused, as are requests to attack systems the asker doesn't own.

## Usage

Mention the bot, then write the command:

```
@bangjago beri materi lengkap ctf jeopardy
@bangjago jelaskan SQL injection
@bangjago buat thread write up untuk "The Command Line Murders"
@bangjago buat file markdown berisi command linux
@bangjago buat channel ctf-discussion
@bangjago kirim pesan ke #general halo semua
@bangjago login
```

## Setup

Requires Node.js 18+ and a ChatGPT account. The Discord bot needs `Send Messages`, `Manage Threads`, `Manage Channels`, and `Read Message History`.

```bash
cp .env.example .env      # fill in DISCORD_TOKEN
npm install
npm start
```

It's working when the log reads:

```
OAuth OpenAI siap (exp ...)
online: bangjago#8888
```

If you see `provide token`, the bot has no ChatGPT credentials yet. Say `@bangjago login`, open the link it sends, and finish in the browser. The token is saved to `~/.config/bangjago/openai-oauth.json` and the terminal prints the refresh token.

## Deployment

OAuth login can't be done from a server. The `client_id` in use only registers `http://localhost:1455/auth/callback`, so a public callback is always rejected with `invalid_authorize_request`.

So: log in locally once, then move the refresh token to the server as an env var.

```bash
fly secrets set "OPENAI_REFRESH_TOKEN=<value>" -a bangjago
```

When `OPENAI_REFRESH_TOKEN` is set, the bot exchanges it for an access token at startup and skips the login listener.

One constraint: the refresh token rotates on every use. A local instance and a deployed instance can't share one token — as soon as one refreshes, the other dies. Run only one.

Docker:

```bash
docker build -t bangjago .
docker run -d --name bangjago \
  -e DISCORD_TOKEN=... \
  -e OPENAI_REFRESH_TOKEN=... \
  bangjago
```

## Environment

| Variable              | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `DISCORD_TOKEN`       | Discord bot token. Required.                                          |
| `OPENAI_REFRESH_TOKEN`| OAuth refresh token. For deployment; takes precedence over the token file. |
| `OPENAI_MODEL`        | Defaults to `gpt-5.6-luna`.                                           |
| `OPENAI_OAUTH_PATH`   | Defaults to `~/.config/bangjago/openai-oauth.json`.                   |
| `OAUTH_PORT`          | Local login callback port. Defaults to `1455`.                        |

## Structure

```
src/
  index.ts            # boot Discord, route messages
  config.ts           # system prompt & backend constants
  discord/
    say.ts            # markdown-safe message splitting + reply
    intents.ts        # command detection
    actions.ts        # Discord action execution
  ai/
    generate.ts       # SSE streaming + continuation when truncated
  oauth.ts            # PKCE login, refresh, token store
```

## Notes

Streaming goes through `chatgpt.com/backend-api/codex/responses` with `stream:true`, parsed per `response.output_text.delta` event. If the stream drops or comes back empty, it retries with backoff; long answers continue in layers up to `MAX_CHUNKS`.

Credentials are stored independently, with no dependency on an opencode installation.

## License

MIT
