import type { Message } from "discord.js";

const MAX_MSG = 1900;

// pecah teks jadi beberapa pesan tanpa merusak markdown.
// track fence ``` supaya code block gak pernah kepotong di tengah.
export function smartSplit(text: string, max = MAX_MSG): string[] {
  const chunks: string[] = [];
  let current = "";
  let inCode = false;
  let lang = "";

  const flush = () => {
    if (current) chunks.push(inCode ? current + "\n```" : current);
    current = inCode ? "```" + lang : "";
  };

  for (const line of text.split("\n")) {
    if (line.length > max) {
      flush();
      for (let i = 0; i < line.length; i += max)
        chunks.push(line.slice(i, i + max));
      continue;
    }
    if (current && current.length + 1 + line.length > max) flush();

    if (/^\s*```/.test(line)) {
      if (!inCode) {
        lang = line.trim().replace(/^```/, "").trim();
        inCode = true;
      } else {
        inCode = false;
        lang = "";
      }
    }

    current = current ? current + "\n" + line : line;
  }

  if (current) chunks.push(inCode ? current + "\n```" : current);
  return chunks;
}

// sendTyping aman untuk tipe channel apapun (discord.js union type).
export async function sendTyping(channel: any): Promise<void> {
  try {
    await channel.sendTyping();
  } catch {
    /* abaikan — typing cuma penanda */
  }
}

// reply bisa gagal kalau pesan asli dihapus; jangan sampai crash proses.
export async function say(msg: Message, text: string): Promise<void> {
  if (!text) text = "(kosong)";
  const parts = smartSplit(text);
  try {
    await msg.reply(parts[0]);
    for (const part of parts.slice(1)) {
      if (msg.channel.isSendable()) await msg.channel.send(part);
    }
  } catch {
    try {
      if (msg.channel.isSendable()) {
        for (const part of parts) await msg.channel.send(part);
      }
    } catch (e) {
      console.error("gagal kirim:", e);
    }
  }
}