import { Client, Events, GatewayIntentBits } from "discord.js";
import {
  getLoginUrl,
  loadOAuthToken,
  startLoginListener,
  OAuthNeedsLoginError,
} from "./oauth.js";
import { parseIntent } from "./discord/intents.js";
import { handleIntent } from "./discord/actions.js";
import { say, sendTyping } from "./discord/say.js";
import { generateText } from "./ai/generate.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

loadOAuthToken().then(
  (t) => console.log(`OAuth OpenAI siap (exp ${new Date(t.expires).toISOString()})`),
  (e) => console.log("OAuth OpenAI belum siap:", e instanceof Error ? e.message : e),
);

if (!process.env.OPENAI_REFRESH_TOKEN) startLoginListener();

client.once(Events.ClientReady, (c) => console.log(`online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.mentions.has(client.user!)) return;
  const prompt = msg.content.replace(/<@!?\d+>/g, "").trim();
  if (!prompt) return;

  try {
    if (/^(login|hubung(kan|in)?|connect|auth|oauth|masuk)/i.test(prompt) && prompt.length < 40) {
      if (process.env.OPENAI_REFRESH_TOKEN) {
        await say(msg, "Token sudah dipasang lewat `OPENAI_REFRESH_TOKEN`, nggak perlu login.");
        return;
      }
      const url = getLoginUrl();
      startLoginListener();
      await say(
        msg,
        `Bot belum login ke akun ChatGPT. Login biar bisa jawab:\n${url}\n\nSetelah sukses (muncul "Login berhasil"), bilang lagi ke gue ya.`,
      );
      return;
    }

    const intent = parseIntent(prompt);
    if (await handleIntent(msg, intent)) return;

    await sendTyping(msg.channel);
    const text = await generateText(prompt, () => {
      void sendTyping(msg.channel);
    });
    await say(msg, text);
  } catch (e) {
    if (e instanceof OAuthNeedsLoginError) {
      await say(
        msg,
        "provide token — login lokal dulu (`npm run dev`, bilang `login`), lalu ambil `refresh` dari `~/.config/bangjago/openai-oauth.json` dan set sebagai secret `OPENAI_REFRESH_TOKEN`.",
      );
      return;
    }
    await say(msg, `Error: ${e instanceof Error ? e.message : String(e)}`);
  }
});

client.on("error", (e) => console.error("client error:", e));

client.login(process.env.DISCORD_TOKEN);
