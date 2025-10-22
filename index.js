import { Client, GatewayIntentBits, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Events } from 'discord.js';
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const mmData = new Map();

client.once(Events.ClientReady, () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
});

// ---------------- KOMENDA STARTMM ----------------
client.on(Events.MessageCreate, async message => {
  if (!message.content.startsWith('!startmm') || message.author.bot) return;
  const args = message.content.split(' ');
  const ticketChannelId = args[1];
  if (!ticketChannelId) return message.reply('❌ Podaj ID kanału ticketu.');

  const ticketChannel = message.guild.channels.cache.get(ticketChannelId);
  if (!ticketChannel) return message.reply('❌ Nie znaleziono kanału ticketu.');

  mmData.set(ticketChannelId, { sender: null, receiver: null, amount: null, phone: null, confirmed: [] });

  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setDescription(
      '```💛 DUKAAN MM```\n\nWybierz swoją rolę poniżej:\n📦 Nadawca - osoba wysyłająca środki\n📨 Odbiorca - osoba otrzymująca środki'
    )
    .setFooter({ text: 'DUKAAN MM' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sender').setLabel('📦 Nadawca').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('receiver').setLabel('📨 Odbiorca').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('confirm_role').setLabel('✅ Potwierdź').setStyle(ButtonStyle.Success)
  );

  await ticketChannel.send({ embeds: [embed], components: [row] });
});

// ---------------- WYBÓR ROLI ----------------
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const ticketId = interaction.channel.id;
  const data = mmData.get(ticketId);
  if (!data) return;

  if (interaction.customId === 'sender') {
    if (data.sender) return interaction.reply({ content: '❌ Nadawca został już wybrany.', ephemeral: true });
    data.sender = interaction.user.id;
    mmData.set(ticketId, data);
    return interaction.reply({ content: `✅ ${interaction.user} został oznaczony jako **NADAWCA**.`, ephemeral: false });
  }

  if (interaction.customId === 'receiver') {
    if (data.receiver) return interaction.reply({ content: '❌ Odbiorca został już wybrany.', ephemeral: true });
    data.receiver = interaction.user.id;
    mmData.set(ticketId, data);
    return interaction.reply({ content: `✅ ${interaction.user} został oznaczony jako **ODBIORCA**.`, ephemeral: false });
  }

  if (interaction.customId === 'confirm_role') {
    if (interaction.user.id !== data.sender && interaction.user.id !== data.receiver) {
      return interaction.reply({ content: '❌ Najpierw wybierz swoją rolę.', ephemeral: true });
    }

    if (data.confirmed.includes(interaction.user.id)) {
      return interaction.reply({ content: '✅ Już potwierdziłeś swoją rolę.', ephemeral: true });
    }

    data.confirmed.push(interaction.user.id);
    mmData.set(ticketId, data);

    // Zmieniamy stan przycisku Potwierdź tylko dla klikającego użytkownika
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sender').setLabel('📦 Nadawca').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('receiver').setLabel('📨 Odbiorca').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('confirm_role')
        .setLabel('✅ Potwierdź')
        .setStyle(ButtonStyle.Success)
        .setDisabled(data.confirmed.includes(interaction.user.id))
    );

    if (interaction.message.editable) {
      await interaction.message.edit({ components: [newRow] });
    }

    if (data.sender && data.receiver && data.confirmed.length === 2) {
      await interaction.reply({ content: '✅ Obie role zostały potwierdzone! Możecie kontynuować transakcję.', ephemeral: false });
    } else {
      await interaction.reply({ content: '✅ Rola została potwierdzona! Czekamy na drugiego użytkownika.', ephemeral: true });
    }
  }

  if (interaction.customId === 'copy_number') {
    return interaction.reply({
      content: '💛 DUKAAN MM\nNumer do wysłania środków: **698 962 262**',
      ephemeral: true,
    });
  }

  if (interaction.customId === 'send_to_receiver') {
    if (interaction.user.id !== data.sender)
      return interaction.reply({ content: '❌ Nie możesz użyć tego przycisku — tylko nadawca może wysłać środki.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setDescription('```💛 DUKAAN MM```\n\n📩 Odbiorco, podaj numer telefonu, na który mają zostać wysłane środki.');

    await interaction.channel.send({ content: `<@${data.receiver}>`, embeds: [embed] });
    return interaction.reply({ content: '📤 Powiadomiono odbiorcę o podaniu numeru telefonu.', ephemeral: true });
  }
});

// ---------------- NADAWCA PODAJE KWOTĘ ----------------
client.on(Events.MessageCreate, async message => {
  const ticketId = message.channel.id;
  const data = mmData.get(ticketId);
  if (!data || !data.sender || !data.receiver || data.amount) return;

  if (message.author.id !== data.sender) return;
  const kwota = message.content.trim();
  if (!kwota.match(/^\d+(zł)?$/i)) return message.reply('❌ Podaj poprawną kwotę, np. `123zł`.');

  data.amount = kwota;
  mmData.set(ticketId, data);

  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setDescription(
      `\`\`\`💛 DUKAAN MM\`\`\`\n📱 Wyślij środki na numer: **698 962 262**\n💰 Kwota: **${data.amount}**\n⏳ Oczekiwanie na przesłanie środków…`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('copy_number').setLabel('📋 Skopiuj numer').setStyle(ButtonStyle.Secondary)
  );

  await message.channel.send({ content: `<@${data.sender}>`, embeds: [embed], components: [row] });
});

// ---------------- !detect ----------------
client.on(Events.MessageCreate, async message => {
  if (!message.content.startsWith('!detect') || message.author.bot) return;
  const args = message.content.split(' ');
  const amount = args[1];
  if (!amount) return message.reply('❌ Podaj kwotę, np. `!detect 475zł`.');

  const ticketChannelId = [...mmData.keys()].find(id => mmData.get(id).amount === amount);
  if (!ticketChannelId) return message.reply('❌ Nie znaleziono pasującej transakcji.');

  const ticketChannel = message.guild.channels.cache.get(ticketChannelId);
  const data = mmData.get(ticketChannelId);

  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setDescription(
      `\`\`\`💛 DUKAAN MM\`\`\`\n💰 Wykryto przesłane środki.\n📦 Kwota: **${amount}**`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('send_to_receiver').setLabel('📤 Wyślij odbiorcy').setStyle(ButtonStyle.Success)
  );

  await ticketChannel.send({ content: `<@${data.sender}>`, embeds: [embed], components: [row] });
});

// ---------------- ODBIORCA PODAJE NUMER ----------------
client.on(Events.MessageCreate, async message => {
  const ticketId = message.channel.id;
  const data = mmData.get(ticketId);
  if (!data || !data.receiver || data.phone) return;

  if (message.author.id !== data.receiver) return;

  const phone = message.content.trim();
  if (!phone.match(/^\d{3}\s?\d{3}\s?\d{3}$/))
    return message.reply('❌ Podaj poprawny numer telefonu w formacie `123 456 789`.');

  data.phone = phone;
  mmData.set(ticketId, data);
  return message.reply(`✅ Numer zapisany: **${phone}**`);
});

// ---------------- !finalize ----------------
client.on(Events.MessageCreate, async message => {
  if (!message.content.startsWith('!finalize') || message.author.bot) return;

  for (const [id, data] of mmData) {
    if (!data.phone) continue;
    const ticketChannel = message.guild.channels.cache.get(id);

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setDescription(
        `\`\`\`💛 DUKAAN MM\`\`\`\n💸 Środki zostały wysłane na numer: **${data.phone}**\n⏳ Środki zostaną wysłane do 2 min`
      );

    await ticketChannel.send({ embeds: [embed] });
    mmData.delete(id);
  }
});

// ---------------- EXPRESS SERVER DO RENDER WEB ----------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot Discord działa poprawnie!');
});

app.listen(PORT, () => {
  console.log(`✅ Serwer nasłuchuje na porcie ${PORT}`);
});

// ---------------- LOGIN BOTA ----------------
client.login(process.env.TOKEN);
