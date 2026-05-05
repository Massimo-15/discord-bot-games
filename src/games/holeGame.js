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
const configs = new Map();

const COLORS = {
  main: 0x8B5CF6,
  success: 0x22C55E,
  error: 0xEF4444,
  warning: 0xF59E0B
};

const DEFAULT_CONFIG = {
  lobby: 60,
  holesChoice: 30,
  writing: 90,
  answering: 90,
  vote: 45
};

function mention(id) {
  return `<@${id}>`;
}

function getConfig(guildId) {
  return configs.get(guildId) ?? DEFAULT_CONFIG;
}

function setConfig(guildId, config) {
  configs.set(guildId, config);
}

function getGame(guildId) {
  return games.get(guildId);
}

function setGame(guildId, game) {
  if (game) games.set(guildId, game);
  else games.delete(guildId);
}

function stateName(state) {
  return {
    lobby: 'Lobby',
    writing: 'Écriture des phrases',
    answering: 'Réponses aux phrases',
    voting: 'Vote final',
    ended: 'Terminée'
  }[state] ?? state;
}

function baseEmbed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'DYNASTY-GAMES • Hole Game' })
    .setTimestamp();
}

function playersList(game) {
  if (!game.players.length) return 'Aucun joueur inscrit.';

  return game.players
    .map((id, index) => `**${index + 1}.** ${mention(id)}${id === game.host ? ' 👑' : ''}`)
    .join('\n');
}

function lobbyEmbed(game, config) {
  return new EmbedBuilder()
    .setColor(COLORS.main)
    .setTitle('🕳️ Hole Game — Lobby')
    .setDescription(
      `Bienvenue dans le **Hole Game**.\n\n` +
      `Chaque joueur écrit une phrase avec des trous \`___\`, puis les autres devront la compléter anonymement.\n\n` +
      `👑 **Hôte :** ${mention(game.host)}\n` +
      `📌 **État :** ${stateName(game.state)}\n` +
      `👥 **Joueurs :** ${game.players.length}\n\n` +
      `## Joueurs inscrits\n${playersList(game)}`
    )
    .addFields(
      {
        name: '📜 Règles',
        value:
          `• Minimum **1 trou** \`___\`\n` +
          `• Maximum **4 trous**\n` +
          `• Phrase entre **15 et 150 caractères**\n` +
          `• Vote anonyme\n` +
          `• Impossible de voter deux fois\n` +
          `• La phrase avec le plus de votes gagne`,
        inline: false
      },
      {
        name: '⏱️ Timers',
        value:
          `Lobby : **${config.lobby}s**\n` +
          `Choix trous : **${config.holesChoice}s**\n` +
          `Écriture : **${config.writing}s**\n` +
          `Réponses : **${config.answering}s**\n` +
          `Vote : **${config.vote}s**`,
        inline: true
      }
    )
    .setFooter({ text: 'DYNASTY-GAMES • Hole Game' })
    .setTimestamp();
}

function statusEmbed(game) {
  return baseEmbed(
    '📊 État du Hole Game',
    `👑 **Hôte :** ${mention(game.host)}\n` +
    `📌 **Phase :** ${stateName(game.state)}\n` +
    `👥 **Joueurs :** ${game.players.length}\n` +
    `📝 **Phrases enregistrées :** ${game.sentences?.length ?? 0}\n\n` +
    `## Joueurs\n${playersList(game)}`
  );
}

function lobbyRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hole_join')
        .setLabel('Rejoindre')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('hole_leave')
        .setLabel('Quitter')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('hole_start')
        .setLabel('Lancer')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('hole_refresh')
        .setLabel('Actualiser')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hole_skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('hole_delete')
        .setLabel('Supprimer')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function gameRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hole_write')
        .setLabel('Écrire ma phrase')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('hole_refresh')
        .setLabel('Actualiser')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('hole_skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('hole_delete')
        .setLabel('Supprimer')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function isHost(interaction, game) {
  return interaction.user.id === game.host;
}

async function updatePanel(interaction, game) {
  if (!game.messageId) return;

  const message = await interaction.channel.messages.fetch(game.messageId).catch(() => null);
  if (!message) return;

  const config = getConfig(interaction.guildId);

  await message.edit({
    embeds: [game.state === 'lobby' ? lobbyEmbed(game, config) : statusEmbed(game)],
    components: game.state === 'lobby' ? lobbyRows() : gameRows()
  }).catch(() => {});
}

function validateSentence(sentence) {
  const trimmed = sentence.trim();
  const holes = (trimmed.match(/___/g) ?? []).length;

  if (trimmed.length < 15 || trimmed.length > 150) {
    return 'Ta phrase doit faire entre **15 et 150 caractères**.';
  }

  if (holes < 1) {
    return 'Ta phrase doit contenir au moins **1 trou** avec `___`.';
  }

  if (holes > 4) {
    return 'Ta phrase ne peut pas contenir plus de **4 trous**.';
  }

  return null;
}

/* ========================
   🎮 COMMANDES
======================== */

export async function handleHoleCommand(interaction) {
  const guildId = interaction.guildId;

  if (interaction.commandName === 'confighole') {
    const current = getConfig(guildId);

    const next = {
      lobby: interaction.options.getInteger('lobby_sec') ?? current.lobby,
      holesChoice: interaction.options.getInteger('choix_trous_sec') ?? current.holesChoice,
      writing: interaction.options.getInteger('ecriture_sec') ?? current.writing,
      answering: interaction.options.getInteger('reponse_sec') ?? current.answering,
      vote: interaction.options.getInteger('vote_sec') ?? current.vote
    };

    setConfig(guildId, next);

    return interaction.reply({
      embeds: [
        baseEmbed(
          '⚙️ Configuration Hole Game enregistrée',
          `⏱️ **Lobby :** ${next.lobby}s\n` +
          `🕳️ **Choix trous :** ${next.holesChoice}s\n` +
          `📝 **Écriture :** ${next.writing}s\n` +
          `💬 **Réponses :** ${next.answering}s\n` +
          `🗳️ **Vote :** ${next.vote}s`,
          COLORS.success
        )
      ],
      ephemeral: true
    });
  }

  if (interaction.commandName === 'holecreate') {
    if (getGame(guildId)) {
      return interaction.reply({
        content: '❌ Une partie Hole Game est déjà en cours.',
        ephemeral: true
      });
    }

    const config = getConfig(guildId);

    const game = {
      host: interaction.user.id,
      players: [],
      state: 'lobby',
      sentences: [],
      answers: [],
      votes: {},
      scores: {},
      messageId: null,
      createdAt: Date.now()
    };

    setGame(guildId, game);

    await interaction.reply({
      embeds: [lobbyEmbed(game, config)],
      components: lobbyRows()
    });

    const message = await interaction.fetchReply().catch(() => null);
    if (message) {
      game.messageId = message.id;
      setGame(guildId, game);
    }
  }
}

/* ========================
   🔘 BOUTONS
======================== */

export async function handleHoleButtons(interaction) {
  const game = getGame(interaction.guildId);

  if (!game) {
    return interaction.reply({
      content: '❌ Aucune partie Hole Game en cours.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_join') {
    if (game.state !== 'lobby') {
      return interaction.reply({
        content: '❌ La partie a déjà commencé.',
        ephemeral: true
      });
    }

    if (game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'Tu es déjà dans la partie.',
        ephemeral: true
      });
    }

    game.players.push(interaction.user.id);
    setGame(interaction.guildId, game);

    await updatePanel(interaction, game);

    return interaction.reply({
      content: '✅ Tu as rejoint la partie.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_leave') {
    if (game.state !== 'lobby') {
      return interaction.reply({
        content: '❌ Tu ne peux plus quitter après le lancement.',
        ephemeral: true
      });
    }

    if (!game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'Tu n’es pas dans la partie.',
        ephemeral: true
      });
    }

    game.players = game.players.filter(id => id !== interaction.user.id);

    if (interaction.user.id === game.host) {
      setGame(interaction.guildId, null);
      return interaction.reply({
        content: '❌ L’hôte a quitté la partie. La partie est supprimée.',
        ephemeral: false
      });
    }

    setGame(interaction.guildId, game);
    await updatePanel(interaction, game);

    return interaction.reply({
      content: '🚪 Tu as quitté la partie.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_start') {
    if (!isHost(interaction, game)) {
      return interaction.reply({
        content: '❌ Seul l’hôte peut lancer la partie.',
        ephemeral: true
      });
    }

    if (game.players.length < 2) {
      return interaction.reply({
        content: '❌ Il faut au moins **2 joueurs** pour lancer.',
        ephemeral: true
      });
    }

    game.state = 'writing';
    setGame(interaction.guildId, game);
    await updatePanel(interaction, game);

    return interaction.reply({
      embeds: [
        baseEmbed(
          '📝 Phase d’écriture',
          `Chaque joueur doit écrire une phrase avec des trous \`___\`.\n\n` +
          `Exemple :\n` +
          `Nous aimerions tous aller ___ pour se farcir ___ demain.\n\n` +
          `Clique sur **Écrire ma phrase** pour participer.`,
          COLORS.warning
        )
      ],
      components: gameRows()
    });
  }

  if (interaction.customId === 'hole_write') {
    if (game.state !== 'writing') {
      return interaction.reply({
        content: '❌ Ce n’est pas la phase d’écriture.',
        ephemeral: true
      });
    }

    if (!game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu ne participes pas à cette partie.',
        ephemeral: true
      });
    }

    const alreadySent = game.sentences.some(sentence => sentence.author === interaction.user.id);
    if (alreadySent) {
      return interaction.reply({
        content: '❌ Tu as déjà envoyé ta phrase.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('hole_sentence_modal')
      .setTitle('Écris ta phrase');

    const input = new TextInputBuilder()
      .setCustomId('sentence')
      .setLabel('Phrase avec ___')
      .setPlaceholder('Exemple : Nous voulons aller ___ pour manger ___ demain.')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(15)
      .setMaxLength(150)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  if (interaction.customId === 'hole_refresh') {
    await updatePanel(interaction, game);

    return interaction.reply({
      embeds: [game.state === 'lobby' ? lobbyEmbed(game, getConfig(interaction.guildId)) : statusEmbed(game)],
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_skip') {
    if (!isHost(interaction, game)) {
      return interaction.reply({
        content: '❌ Seul l’hôte peut skip.',
        ephemeral: true
      });
    }

    if (game.state === 'lobby') {
      return interaction.reply({
        content: 'Utilise plutôt le bouton **Lancer**.',
        ephemeral: true
      });
    }

    if (game.state === 'writing') {
      game.state = 'ended';
      setGame(interaction.guildId, game);
      await updatePanel(interaction, game);

      const list = game.sentences.length
        ? game.sentences.map((sentence, index) => `**${index + 1}.** ${sentence.text}`).join('\n\n')
        : 'Aucune phrase enregistrée.';

      return interaction.reply({
        embeds: [
          baseEmbed(
            '🏁 Fin temporaire du Hole Game',
            `Phrases enregistrées : **${game.sentences.length}**\n\n${list}`,
            COLORS.success
          )
        ]
      });
    }

    return interaction.reply({
      content: '⏭️ Étape passée.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_delete') {
    if (!isHost(interaction, game)) {
      return interaction.reply({
        content: '❌ Seul l’hôte peut supprimer la partie.',
        ephemeral: true
      });
    }

    setGame(interaction.guildId, null);

    return interaction.reply({
      content: '❌ Partie Hole Game supprimée.',
      ephemeral: false
    });
  }
}

/* ========================
   📝 MODAL
======================== */

export async function handleHoleModal(interaction) {
  const game = getGame(interaction.guildId);

  if (!game) {
    return interaction.reply({
      content: '❌ Aucune partie Hole Game en cours.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_sentence_modal') {
    const sentence = interaction.fields.getTextInputValue('sentence');
    const error = validateSentence(sentence);

    if (error) {
      return interaction.reply({
        content: `❌ ${error}`,
        ephemeral: true
      });
    }

    if (game.sentences.some(item => item.author === interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu as déjà envoyé ta phrase.',
        ephemeral: true
      });
    }

    game.sentences.push({
      author: interaction.user.id,
      text: sentence.trim()
    });

    setGame(interaction.guildId, game);

    return interaction.reply({
      content: `✅ Phrase enregistrée ! (${game.sentences.length}/${game.players.length})`,
      ephemeral: true
    });
  }
}