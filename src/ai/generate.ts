import { getAccessToken, OAuthNeedsLoginError } from "../oauth.js";
import {
  CONTINUE_PROMPT,
  MAX_ATTEMPTS,
  MAX_CHUNKS,
  OAUTH_ENDPOINT,
  OAUTH_HEADERS,
  OAUTH_MODEL,
  SYSTEM,
} from "../config.js";

export interface ApiResult {
  content: string;
  toolCalls: any[];
  finish: string;
  truncated: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const retriable = (e: unknown): boolean => {
  if (!(e instanceof Error)) return true;
  return /5\d\d|403|429|timeout|connection|ECONNRESET|empty response|upstream|no body|truncated/i.test(
    e.message,
  );
};

const backoff = (attempt: number) =>
  Math.min(30000, 3000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 1000);

export function parseSSE(sse: string): {
  text: string;
  finish: string;
  truncated: boolean;
} {
  let text = "";
  let finish = "";
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.replace(/^data:\s*/, "").trim();
    if (!raw) continue;
    let ev: any;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    if (ev.type === "response.output_text.delta" && ev.delta) {
      text += ev.delta;
    } else if (
      (ev.type === "response.output_item.done" ||
        ev.type === "response.completed" ||
        ev.type === "response.output_text.done") &&
      !finish
    ) {
      finish = "stop";
    } else if (ev.type === "error") {
      throw new Error(`OAuth SSE error: ${JSON.stringify(ev.error || ev)?.slice(0, 200)}`);
    }
  }
  return { text, finish, truncated: !finish };
}

function systemToInput(): any[] {
  return [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: `${SYSTEM}\n\n[instruksi pertama dari user:]` },
      ],
    },
  ];
}

function messagesToInput(msgs: any[]): any[] {
  const out: any[] = systemToInput();
  for (const m of msgs) {
    if (m.content == null || m.content === "") continue;
    let content: any;
    if (Array.isArray(m.content)) content = m.content;
    else content = [{ type: "input_text", text: String(m.content) }];
    try {
      const parsed = typeof m.content === "string" ? JSON.parse(m.content) : null;
      if (parsed?.role === "user" && parsed?.content) return parsed.content;
    } catch {}
    out.push({ type: "message", role: m.role === "assistant" ? "assistant" : "user", content });
  }
  return out;
}

async function oaiFetch(input: any[]): Promise<Response> {
  const access = await getAccessToken();
  return fetch(OAUTH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      ...OAUTH_HEADERS,
    },
    body: JSON.stringify({
      model: OAUTH_MODEL,
      input,
      store: false,
      stream: true,
    }),
  });
}

export async function apiCall(
  messages: any[],
  notify?: () => void,
): Promise<ApiResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await oaiFetch(messagesToInput(messages));
      const text = await res.text();
      if (!res.ok) throw new Error(`OAuth ${res.status}: ${text.slice(0, 200)}`);
      const parsed = parseSSE(text);
      return {
        content: parsed.text,
        toolCalls: [],
        finish: parsed.finish,
        truncated: parsed.truncated,
      };
    } catch (e) {
      lastErr = e;
      if (e instanceof OAuthNeedsLoginError) throw e;
      if (attempt === MAX_ATTEMPTS || !retriable(e)) throw e;
      console.log(
        `retry ${attempt}/${MAX_ATTEMPTS}: ${e instanceof Error ? e.message : e}`,
      );
    }
    notify?.();
    await sleep(backoff(attempt));
  }
  throw lastErr ?? new Error("apiCall gagal");
}

export async function generateText(
  prompt: string,
  notify?: () => void,
): Promise<string> {
  const messages: any[] = [{ role: "user", content: prompt }];
  let result = await apiCall(messages, notify);
  let answer = result.content || "";
  let chunks = 1;
  while ((result.finish === "length" || result.truncated) && chunks < MAX_CHUNKS) {
    messages.push({ role: "assistant", content: result.content || "" });
    messages.push({ role: "user", content: CONTINUE_PROMPT });
    result = await apiCall(messages, notify);
    if (!result.content) break;
    answer += result.content;
    chunks++;
  }
  return answer || "(kosong)";
}
