import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { createServer as httpCreateServer, type Server } from "node:http";
import os from "node:os";
import { join, dirname } from "node:path";

export const OWN_PATH =
  process.env.OPENAI_OAUTH_PATH ||
  join(os.homedir(), ".config", "bangjago", "openai-oauth.json");

export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
function defaultRedirect() {
  return `http://localhost:${process.env.OAUTH_PORT || 1455}/auth/callback`;
}
export const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || defaultRedirect();
const AUTH_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
export const PORT = Number(process.env.OAUTH_PORT) || 1455;
const SCOPE = "openid profile email offline_access";

let cached: { access: string; refresh: string; expires: number } | null = null;
let refreshPromise: Promise<void> | null = null;
let loginListener: Server | null = null;
let pending: { verifier: string; challenge: string; state: string } | null = null;

export class OAuthNeedsLoginError extends Error {
  constructor(msg = "OpenAI OAuth belum login") {
    super(msg);
    this.name = "OAuthNeedsLoginError";
  }
}

function now() {
  return Date.now();
}

function parseError(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.error?.message || j.detail || body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

async function readOwn(): Promise<{ access: string; refresh: string; expires: number } | null> {
  try {
    const raw = await readFile(OWN_PATH, "utf8");
    const j = JSON.parse(raw);
    if (j?.access && j?.refresh) return { access: j.access, refresh: j.refresh, expires: j.expires ?? 0 };
  } catch {}
  return null;
}

async function writeOwn(t: { access: string; refresh: string; expires: number }) {
  try {
    await mkdir(dirname(OWN_PATH), { recursive: true });
    await writeFile(OWN_PATH, JSON.stringify(t, null, 2), { mode: 0o600 });
  } catch (e) {
    console.log("gagal simpan file oauth sendiri:", e);
  }
}

export async function loadOAuthToken(): Promise<{
  access: string;
  refresh: string;
  expires: number;
}> {
  if (cached) return cached;
  const own = await readOwn();
  if (!own) throw new OAuthNeedsLoginError();
  cached = own;
  return cached;
}

export async function getAccessToken(): Promise<string> {
  if (!cached) await loadOAuthToken();
  if (!cached) throw new OAuthNeedsLoginError();
  if (now() < cached.expires - 60000) return cached.access;
  await refreshAccessToken();
  return cached!.access;
}

export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    if (!cached) throw new OAuthNeedsLoginError();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cached.refresh,
      client_id: CLIENT_ID,
    }).toString();
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      cached = null;
      throw new OAuthNeedsLoginError(`refresh gagal ${res.status}: ${parseError(text)}`);
    }
    const j = JSON.parse(text);
    const access = j.access_token || j.access;
    const refresh = j.refresh_token || cached.refresh;
    const expires_in = j.expires_in || 3600;
    if (!access) throw new Error("refresh response tanpa access token");
    cached = { access, refresh, expires: now() + expires_in * 1000 };
    await writeOwn(cached);
  })();
  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pkcePair() {
  const verifier = b64u(randomBytes(32));
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function randomState(): string {
  return b64u(randomBytes(16));
}

export function getLoginUrl(): string {
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  pending = { verifier, challenge, state };
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code: string): Promise<{ access: string; refresh: string; expires: number }> {
  if (!pending) throw new Error("PKCE state kosong, minta link login baru");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: pending.verifier,
  }).toString();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`exchange gagal ${res.status} ${parseError(text)}`);
  const j = JSON.parse(text);
  const access = j.access_token || j.access;
  const refresh = j.refresh_token;
  if (!access) throw new Error("exchange response tanpa access token");
  return { access, refresh, expires: now() + (j.expires_in || 3600) * 1000 };
}

export function startLoginListener(): void {
  if (loginListener) return;
  loginListener = httpCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://localhost:${PORT}`);
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      if (err) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<h3>Login dibatalkan: ${err}</h3><p>Kamu bisa kembali ke Discord.</p>`);
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!state || !pending || state !== pending.state) {
        const msg = code ? "Invalid OAuth state" : "Missing authorization code";
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h3>${msg}</h3>`);
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h3>Missing authorization code</h3>");
        return;
      }
      const tokens = await exchangeCode(code);
      cached = tokens;
      await writeOwn(tokens);
      pending = null;
      console.log("OAuth login berhasil");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h2>Login berhasil! Kamu bisa kembali ke Discord.</h2>");
    } catch (e) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h3>Login gagal: ${e instanceof Error ? e.message : String(e)}</h3>`);
    }
  });
  loginListener.listen(PORT, "localhost", () =>
    console.log(`OAuth callback listening on ${REDIRECT_URI}`),
  );
}
