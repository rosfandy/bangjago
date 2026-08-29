import { AttachmentBuilder, ChannelType, type Message } from "discord.js";
import { generateText } from "../ai/generate.js";
import { say, sendTyping, smartSplit } from "./say.js";
import type { Intent } from "./intents.js";

function notify(msg: Message): () => void {
  return () => {
    void sendTyping(msg.channel);
  };
}

export async function handleIntent(msg: Message, intent: Intent): Promise<boolean> {
  switch (intent.kind) {
    case "create_markdown_file": {
      await sendTyping(msg.channel);
      await say(msg, `Bikin file **${intent.filename}**. Nulis...`);

      const answer = await generateText(
        `Buatkan konten file Markdown untuk permintaan berikut, JANGAN pakai code-fence markdown tambahan (\`\`\`) di sekeliling, langsung isi markdown-nya saja. Jangan sebut model/CLI/platform.\n\n${intent.content || intent.filename}`,
        notify(msg),
      );
      const clean = answer
        .replace(/^```(?:markdown|md)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const file = new AttachmentBuilder(Buffer.from(clean, "utf8"), {
        name: intent.filename.replace(/[\\/:*?"<>|]/g, "_"),
      });
      if (msg.channel.isSendable()) await msg.channel.send({ files: [file] });
      return true;
    }

    case "create_thread": {
      const parent = msg.channel as any;
      if (!msg.guild) throw new Error("guild gak ketemu");
      if (parent.isThread?.()) throw new Error("gak bisa bikin thread dari dalam thread");
      if (!parent.threads?.create) throw new Error("channel ini gak mendukung thread");

      await sendTyping(msg.channel);
      const thread = await parent.threads.create({
        name: String(intent.name).slice(0, 100),
        message: `Write-up: **${intent.name}**`,
      });
      await say(msg, `Thread **${thread.name}** dibuat. Nulis write-up... ${thread.url}`);

      const answer = await generateText(
        `Buatkan write-up lengkap untuk challenge CTF berikut dalam bahasa Indonesia (jangan sebut model/CLI/platform):\n\n${intent.content || intent.name}`,
        notify(msg),
      );
      for (const part of smartSplit(answer)) await thread.send(part);
      return true;
    }

    case "create_channel": {
      if (!msg.guild) throw new Error("guild gak ketemu");
      const ch = await msg.guild.channels.create({
        name: String(intent.name).toLowerCase().trim().replace(/\s+/g, "-"),
        type: ChannelType.GuildText,
      });
      await say(msg, `Channel #${ch.name} dibuat: ${(ch as any).url}`);
      return true;
    }

    case "send_message": {
      if (!msg.guild) throw new Error("guild gak ketemu");
      const target = msg.guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.name === String(intent.channel).toLowerCase(),
      ) as any;
      if (!target?.isSendable())
        throw new Error(`channel #${intent.channel} gak ketemu atau gak bisa dikirim`);
      for (const part of smartSplit(intent.text)) await target.send(part);
      await say(msg, `Pesan terkirim ke #${target.name}: ${target.url}`);
      return true;
    }

    case "none":
      return false;
  }
}
