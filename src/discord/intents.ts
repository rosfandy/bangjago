export type Intent =
  | { kind: "create_thread"; name: string; content: string }
  | { kind: "create_channel"; name: string; topic?: string }
  | { kind: "send_message"; channel: string; text: string }
  | { kind: "create_markdown_file"; filename: string; content: string }
  | { kind: "none" };

// deteksi intent Discord dari teks user (tanpa LLM) supaya aksi
// seperti buat thread / channel bisa jalan cepat & stabil.
export function parseIntent(prompt: string): Intent {
  const p = prompt.trim();
  const low = p.toLowerCase();

  const threadMention = /\b(thread|tread)\b/.test(low) || /\bwrite\s?up\b/.test(low);
  if (threadMention) {
    const name =
      /(?:\bwrite ?up\b|\bthread\b|\btread\b).{0,40}?"([^"]+)"/.exec(p)?.[1] ||
      /Scenario:\s*["“]?([^"”\n]+?)["”]?(?:\s|\n|$)/.exec(p)?.[1]?.trim() ||
      "Write-up";
    const content = p
      .replace(/(?:buat|bikin|create|tulis)\s+(?:sebuah\s+)?(?:thread|tread)/i, "")
      .replace(/\bwrite\s?up\b/i, "")
      .replace(/^[:\s]+/, "")
      .trim();
    return { kind: "create_thread", name, content };
  }

  if (/\b(?:buat|bikin|create|membuat)\s+(?:channel|kanal)\b/i.test(low)) {
    const name =
      /(?:\bchannel\b|\bkanal\b).{0,40}?"?([A-Za-z0-9_-]+)"?/.exec(p)?.[1] ||
      "baru";
    return { kind: "create_channel", name };
  }

  const sendMatch =
    /(?:kirim|send|post)\s+(?:pesan\s+)?(?:ke\s+)?(?:#([a-z0-9_-]+))/i.exec(p);
  if (sendMatch) {
    const text = p.replace(sendMatch[0], "").trim() || "(pesan kosong)";
    return { kind: "send_message", channel: sendMatch[1], text };
  }

  // buat/simpan file markdown (kirim sebagai attachment .md)
  if (
    /(?:buat|bikin|buatkan|generate|simpan|save|tulis)\s+(?:sebuah\s+)?(?:file|dokumen)\s*(?:mark|m\.?d|md)/i.test(
      low,
    ) ||
    /\.md\b/.test(low)
  ) {
    const filename =
      /(?:sebagai|jadi|dengan\s+nama|nama)\s+["']?([A-Za-z0-9_-]+\.md)/i.exec(p)?.[1] ||
      /(["'])([^"']+\.md)\1/.exec(p)?.[2] ||
      "catatan.md";
    const content = p
      .replace(
        /(?:buat|bikin|generate|simpan|save|tulis)\s+(?:sebuah\s+)?(?:file|dokumen)\s*(?:mark|m\.?d|md)/i,
        "",
      )
      .replace(/\.md\b/i, "")
      .replace(/^[:\s]+/, "")
      .trim();
    return { kind: "create_markdown_file", filename, content };
  }

  return { kind: "none" };
}