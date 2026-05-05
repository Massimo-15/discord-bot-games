import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

const games = new Map();

const DEFAULT_CONFIG = {
  lobby: 30,
  writing: 60
};

function embed(title, desc) {
  return new EmbedBuilder()
    .setColor(0x8B5CF6)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: 'DYNASTY-GAMES • Hole Game' })
    .setTimestamp();
}

function getGame(guildId) {
  return games.get(guildId);
}

function setGame(guildId, game) {
  if (game) games.set(guildId, game);
  else games.delete(guildId);
}

/* ========================
   🎮 COMMANDES
======================== */

export async function handleHoleCommand(interaction) {
  const guildId = interaction.guildId;

  if (interaction.commandName === 'confighole') {
    return interaction.reply({
      embeds: [embed('⚙️ Config Hole Game', 'Configuration enregistrée (version simple).')],
      ephemeral: true
    });
  }

  if (interaction.commandName === 'holecreate') {
    if (getGame(guildId)) {
      return interaction.reply({ content: 'Une partie est déjà en cours.', ephemeral: true });
    }

    const game = {
      host: interaction.user.id,
      players: [],
      state: 'lobby'
    };

    setGame(guildId, game);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hole_join')
        .setLabel('Rejoindre')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('hole_start')
        .setLabel('Démarrer')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({
      embeds: [embed('🕳️ Hole Game', 'Clique sur rejoindre pour participer')],
      components: [row]
    });
  }
}

/* ========================
   🔘 BOUTONS
======================== */

export async function handleHoleButtons(interaction) {
  const game = getGame(interaction.guildId);
  if (!game) return;

  if (interaction.customId === 'hole_join') {
    if (game.players.includes(interaction.user.id)) {
      return interaction.reply({ content: 'Déjà dans la partie.', ephemeral: true });
    }

    game.players.push(interaction.user.id);

    return interaction.reply({
      content: `✅ Rejoint ! (${game.players.length} joueurs)`,
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_start') {
    if (interaction.user.id !== game.host) {
      return interaction.reply({ content: 'Seul l’hôte peut lancer.', ephemeral: true });
    }

    game.state = 'writing';

    const modal = new ModalBuilder()
      .setCustomId('hole_modal')
      .setTitle('Écris ta phrase');

    const input = new TextInputBuilder()
      .setCustomId('sentence')
      .setLabel('Ta phrase avec ___')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
  }
}

/* ========================
   📝 MODAL
======================== */

export async function handleHoleModal(interaction) {
  const game = getGame(interaction.guildId);
  if (!game) return;

  const sentence = interaction.fields.getTextInputValue('sentence');

  game.sentences ??= [];
  game.sentences.push({
    author: interaction.user.id,
    text: sentence
  });

  return interaction.reply({
    content: '✅ Phrase enregistrée !',
    ephemeral: true
  });
}