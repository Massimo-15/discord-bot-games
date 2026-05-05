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
const timers = new Map();

const COLORS = {
  main: 0x8B5CF6,
  success: 0x22C55E,
  error: 0xEF4444,
  warning: 0xF59E0B,
  dark: 0x111827
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

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function getConfig(guildId) {
  return configs.get(guildId) ?? structuredClone(DEFAULT_CONFIG);
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

function clearGameTimer(guildId) {
  const timer = timers.get(guildId);
  if (timer) clearTimeout(timer);
  timers.delete(guildId);
}

function setGameTimer(guildId, seconds, callback) {
  clearGameTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      await callback();
    } catch (err) {
      console.error('Erreur timer Hole Game:', err);
    }
  }, seconds * 1000);

  timers.set(guildId, timer);
}

function baseEmbed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'DYNASTY-GAMES • Hole Game' })
    .setTimestamp();
}

function stateName(state) {
  return {
    lobby: 'Lobby',
    writing: 'Écriture des phrases',
    answering: 'Réponses',
    voting: 'Vote',
    ended: 'Terminée'
  }[state] ?? state;
}

function normalizeSentence(text) {
  return text
    .trim()
    .replace(/___/g, '[trou]')
    .replace(/\[Trou\]/g, '[trou]')
    .replace(/\[TROU\]/g, '[trou]');
}

function countHoles(text) {
  return (text.match(/\[trou\]/g) ?? []).length;
}

function validateSentence(text) {
  const sentence = normalizeSentence(text);
  const holes = countHoles(sentence);

  if (sentence.length < 15 || sentence.length > 150) {
    return 'Ta phrase doit faire entre **15 et 150 caractères**.';
  }

  if (holes < 1) {
    return 'Ta phrase doit contenir au moins **1 trou** avec `[trou]`.';
  }

  if (holes > 4) {
    return 'Ta phrase ne peut pas contenir plus de **4 trous**.';
  }

  return null;
}

function fillSentence(sentence, values) {
  let index = 0;

  return sentence.replace(/\[trou\]/g, () => {
    const value = values[index] ?? '...';
    index++;
    return `**${value}**`;
  });
}

function playersList(game) {
  if (!game.players.length) return 'Aucun joueur inscrit.';

  return game.players
    .map((id, index) => `**${index + 1}.** ${mention(id)}${id === game.host ? ' 👑' : ''}`)
    .join('\n');
}

function scoresText(game) {
  const entries = Object.entries(game.scores ?? {})
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) return 'Aucun score pour le moment.';

  return entries
    .map(([id, score], index) => `**${index + 1}.** ${mention(id)} — **${score} point(s)**`)
    .join('\n');
}

function currentPrompt(game) {
  return game.prompts[game.currentPromptIndex] ?? null;
}

function currentPromptAnswers(game) {
  const prompt = currentPrompt(game);
  if (!prompt) return [];
  return game.answers.filter(answer => answer.promptId === prompt.id);
}

function lobbyEmbed(game, config) {
  return new EmbedBuilder()
    .setColor(COLORS.main)
    .setTitle('🕳️ Hole Game — Lobby')
    .setDescription(
      `Bienvenue dans le **Hole Game**.\n\n` +
      `Chaque joueur écrit une phrase avec des emplacements \`[trou]\`.\n` +
      `Ensuite, les autres joueurs complètent les phrases anonymement, puis tout le monde vote.\n\n` +
      `👑 **Hôte :** ${mention(game.host)}\n` +
      `📌 **Phase :** ${stateName(game.state)}\n` +
      `👥 **Joueurs :** ${game.players.length}\n\n` +
      `## Joueurs inscrits\n${playersList(game)}`
    )
    .addFields(
      {
        name: '📜 Règles',
        value:
          `• Utilise exactement \`[trou]\` pour créer un vide\n` +
          `• Minimum **1 trou**\n` +
          `• Maximum **4 trous**\n` +
          `• Phrase entre **15 et 150 caractères**\n` +
          `• Réponses anonymes\n` +
          `• Vote anonyme\n` +
          `• Impossible de voter deux fois\n` +
          `• Impossible de voter pour sa propre réponse`,
        inline: false
      },
      {
        name: '⏱️ Timers',
        value:
          `Lobby : **${config.lobby}s**\n` +
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
  const prompt = currentPrompt(game);
  const answers = currentPromptAnswers(game);

  let extra = '';

  if (game.state === 'writing') {
    extra =
      `📝 **Phrases reçues :** ${game.sentences.length}/${game.players.length}\n`;
  }

  if (game.state === 'answering' && prompt) {
    extra =
      `📄 **Phrase :** ${game.currentPromptIndex + 1}/${game.prompts.length}\n` +
      `💬 **Réponses reçues :** ${answers.length}/${answerEligiblePlayers(game, prompt).length}\n`;
  }

  if (game.state === 'voting' && prompt) {
    extra =
      `📄 **Phrase :** ${game.currentPromptIndex + 1}/${game.prompts.length}\n` +
      `🗳️ **Votes reçus :** ${Object.keys(game.votes).length}/${voteEligiblePlayers(game).length}\n`;
  }

  return baseEmbed(
    '📊 État du Hole Game',
    `👑 **Hôte :** ${mention(game.host)}\n` +
    `📌 **Phase :** ${stateName(game.state)}\n` +
    `👥 **Joueurs :** ${game.players.length}\n` +
    extra +
    `\n## Scores\n${scoresText(game)}\n\n` +
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
    controlRow()
  ];
}

function writingRows() {
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
        .setStyle(ButtonStyle.Secondary)
    ),
    controlRow()
  ];
}

function answeringRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hole_answer')
        .setLabel('Répondre')
        .setEmoji('💬')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('hole_refresh')
        .setLabel('Actualiser')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    ),
    controlRow()
  ];
}

function votingRows(game) {
  const answers = currentPromptAnswers(game).slice(0, 15);
  const rows = [];
  let row = new ActionRowBuilder();

  answers.forEach((answer, index) => {
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`hole_vote_${answer.id}`)
        .setLabel(`Réponse ${index + 1}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  if (row.components.length) rows.push(row);

  rows.push(controlRow());

  return rows.slice(0, 5);
}

function endedRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hole_delete')
        .setLabel('Supprimer')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function controlRow() {
  return new ActionRowBuilder().addComponents(
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
  );
}
function componentsForState(game) {
  if (game.state === 'lobby') return lobbyRows();
  if (game.state === 'writing') return writingRows();
  if (game.state === 'answering') return answeringRows();
  if (game.state === 'voting') return votingRows(game);
  if (game.state === 'ended') return endedRows();
  return [controlRow()];
}

function isHost(interaction, game) {
  return interaction.user.id === game.host;
}

function answerEligiblePlayers(game, prompt) {
  return game.players.filter(id => id !== prompt.author);
}

function voteEligiblePlayers(game) {
  return game.players;
}

function hasPlayerAnswered(game, userId, promptId) {
  return game.answers.some(answer => answer.promptId === promptId && answer.author === userId);
}

async function updateMainPanel(interactionOrChannel, game) {
  if (!game.messageId) return;

  const channel = interactionOrChannel.channel ?? interactionOrChannel;
  const message = await channel.messages.fetch(game.messageId).catch(() => null);
  if (!message) return;

  const config = getConfig(message.guildId ?? game.guildId);

  await message.edit({
    embeds: [
      game.state === 'lobby'
        ? lobbyEmbed(game, config)
        : statusEmbed(game)
    ],
    components: componentsForState(game)
  }).catch(() => {});
}

async function sendPhaseMessage(channel, game, title, description, color = COLORS.main) {
  return channel.send({
    embeds: [baseEmbed(title, description, color)],
    components: componentsForState(game)
  });
}

async function startWritingPhase(interaction) {
  const game = getGame(interaction.guildId);
  const config = getConfig(interaction.guildId);

  if (!game) return;

  game.state = 'writing';
  game.sentences = [];
  game.answers = [];
  game.votes = {};
  game.scores = Object.fromEntries(game.players.map(id => [id, 0]));
  game.prompts = [];
  game.currentPromptIndex = 0;
  setGame(interaction.guildId, game);

  await updateMainPanel(interaction, game);

  await interaction.reply({
    embeds: [
      baseEmbed(
        '📝 Phase 1 — Écriture des phrases',
        `Chaque joueur doit écrire **1 phrase** avec \`[trou]\`.\n\n` +
        `📌 **Règles :**\n` +
        `• Minimum **1** \`[trou]\`\n` +
        `• Maximum **4** \`[trou]\`\n` +
        `• Phrase entre **15 et 150 caractères**\n\n` +
        `✅ Exemple :\n` +
        `Nous aimerions tous aller [trou] pour se farcir [trou] demain.\n\n` +
        `Clique sur **Écrire ma phrase**.\n\n` +
        `⏱️ Durée : **${config.writing}s**.`,
        COLORS.warning
      )
    ],
    components: writingRows()
  });

  setGameTimer(interaction.guildId, config.writing, async () => {
    await finishWritingPhase(interaction.channel, interaction.guildId);
  });
}

async function finishWritingPhase(channel, guildId) {
  const game = getGame(guildId);
  if (!game || game.state !== 'writing') return;

  clearGameTimer(guildId);

  if (!game.sentences.length) {
    game.state = 'ended';
    setGame(guildId, game);
    await updateMainPanel(channel, game);

    return channel.send({
      embeds: [
        baseEmbed(
          '🏁 Hole Game terminé',
          'Aucune phrase n’a été envoyée.',
          COLORS.error
        )
      ],
      components: endedRows()
    });
  }

  game.prompts = shuffle(game.sentences).map((sentence, index) => ({
    id: `prompt_${index + 1}`,
    author: sentence.author,
    text: sentence.text
  }));

  game.currentPromptIndex = 0;
  game.answers = [];
  game.votes = {};
  game.state = 'answering';

  setGame(guildId, game);
  await updateMainPanel(channel, game);

  return startAnsweringPhase(channel, guildId);
}

async function startAnsweringPhase(channel, guildId) {
  const config = getConfig(guildId);
  const game = getGame(guildId);

  if (!game || game.state !== 'answering') return;

  const prompt = currentPrompt(game);

  if (!prompt) {
    return finishGame(channel, guildId);
  }

  const eligible = answerEligiblePlayers(game, prompt);

  if (!eligible.length) {
    return startVotingPhase(channel, guildId);
  }

  await updateMainPanel(channel, game);

  await sendPhaseMessage(
    channel,
    game,
    `💬 Phase 2 — Réponses (${game.currentPromptIndex + 1}/${game.prompts.length})`,
    `Phrase à compléter :\n\n` +
    `> ${prompt.text}\n\n` +
    `👤 Auteur de la phrase : **anonyme**\n` +
    `💬 Joueurs qui peuvent répondre : **${eligible.length}**\n\n` +
    `Clique sur **Répondre** pour remplir les \`[trou]\`.\n\n` +
    `⏱️ Durée : **${config.answering}s**.`,
    COLORS.main
  );

  setGameTimer(guildId, config.answering, async () => {
    await startVotingPhase(channel, guildId);
  });
}

async function startVotingPhase(channel, guildId) {
  const config = getConfig(guildId);
  const game = getGame(guildId);

  if (!game || !['answering', 'voting'].includes(game.state)) return;

  clearGameTimer(guildId);

  const prompt = currentPrompt(game);
  if (!prompt) return finishGame(channel, guildId);

  const answers = currentPromptAnswers(game);

  if (!answers.length) {
    await channel.send({
      embeds: [
        baseEmbed(
          '⚠️ Aucune réponse',
          `Personne n’a répondu à cette phrase.\n\n` +
          `Phrase :\n> ${prompt.text}\n\n` +
          `On passe à la phrase suivante.`,
          COLORS.warning
        )
      ],
      components: componentsForState(game)
    });

    return nextPrompt(channel, guildId);
  }

  game.state = 'voting';
  game.votes = {};
  setGame(guildId, game);

  await updateMainPanel(channel, game);

  const answerLines = answers
    .map((answer, index) => {
      const filled = fillSentence(prompt.text, answer.values);
      return `## Réponse ${index + 1}\n${filled}`;
    })
    .join('\n\n');

  await channel.send({
    embeds: [
      baseEmbed(
        `🗳️ Phase 3 — Vote (${game.currentPromptIndex + 1}/${game.prompts.length})`,
        `Phrase originale :\n> ${prompt.text}\n\n` +
        `${answerLines}\n\n` +
        `Vote pour la meilleure réponse avec les boutons ci-dessous.\n` +
        `✅ Vote anonyme\n` +
        `🚫 Impossible de voter deux fois\n` +
        `🚫 Impossible de voter pour sa propre réponse\n\n` +
        `⏱️ Durée : **${config.vote}s**.`,
        COLORS.warning
      )
    ],
    components: votingRows(game)
  });

  setGameTimer(guildId, config.vote, async () => {
    await resolveVotingPhase(channel, guildId);
  });
}

async function resolveVotingPhase(channel, guildId) {
  const game = getGame(guildId);
  if (!game || game.state !== 'voting') return;

  clearGameTimer(guildId);

  const prompt = currentPrompt(game);
  const answers = currentPromptAnswers(game);

  if (!prompt || !answers.length) {
    return nextPrompt(channel, guildId);
  }

  const counts = {};

  for (const answer of answers) {
    counts[answer.id] = 0;
  }

  for (const answerId of Object.values(game.votes)) {
    if (counts[answerId] !== undefined) {
      counts[answerId]++;
    }
  }

  const maxVotes = Math.max(...Object.values(counts));
  const winners = answers.filter(answer => counts[answer.id] === maxVotes);

  let resultText = `Phrase :\n> ${prompt.text}\n\n`;

  resultText += answers
    .map((answer, index) => {
      const filled = fillSentence(prompt.text, answer.values);
      return `**Réponse ${index + 1}** — **${counts[answer.id]} vote(s)**\n${filled}`;
    })
    .join('\n\n');

  if (maxVotes <= 0) {
    resultText += `\n\n⚠️ Aucun vote valide. Aucun point distribué.`;
  } else if (winners.length > 1) {
    resultText +=
      `\n\n🤝 **Égalité !**\n` +
      winners
        .map(winner => `${mention(winner.author)} gagne **1 point**.`)
        .join('\n');

    for (const winner of winners) {
      game.scores[winner.author] = (game.scores[winner.author] ?? 0) + 1;
    }
  } else {
    const winner = winners[0];
    game.scores[winner.author] = (game.scores[winner.author] ?? 0) + 1;

    resultText +=
      `\n\n🏆 **Gagnant de cette phrase :** ${mention(winner.author)}\n` +
      `+1 point`;
  }

  setGame(guildId, game);

  await channel.send({
    embeds: [
      baseEmbed(
        `📊 Résultat (${game.currentPromptIndex + 1}/${game.prompts.length})`,
        resultText,
        COLORS.success
      )
    ],
    components: componentsForState(game)
  });

  return nextPrompt(channel, guildId);
}

async function nextPrompt(channel, guildId) {
  const game = getGame(guildId);
  if (!game) return;

  game.currentPromptIndex += 1;
  game.votes = {};

  if (game.currentPromptIndex >= game.prompts.length) {
    setGame(guildId, game);
    return finishGame(channel, guildId);
  }

  game.state = 'answering';
  setGame(guildId, game);

  return startAnsweringPhase(channel, guildId);
}

async function finishGame(channel, guildId) {
  const game = getGame(guildId);
  if (!game) return;

  clearGameTimer(guildId);

  game.state = 'ended';
  setGame(guildId, game);

  const scores = Object.entries(game.scores ?? {})
    .sort((a, b) => b[1] - a[1]);

  const maxScore = scores[0]?.[1] ?? 0;
  const winners = scores.filter(([, score]) => score === maxScore && score > 0);

  let finalText = `## Classement final\n${scoresText(game)}\n\n`;

  if (!winners.length) {
    finalText += 'Aucun gagnant : aucun point marqué.';
  } else if (winners.length > 1) {
    finalText +=
      `🤝 **Égalité finale !**\n` +
      winners.map(([id, score]) => `${mention(id)} avec **${score} point(s)**`).join('\n');
  } else {
    finalText += `🏆 **Grand gagnant :** ${mention(winners[0][0])} avec **${winners[0][1]} point(s)**`;
  }

  await updateMainPanel(channel, game);

  await channel.send({
    embeds: [
      baseEmbed(
        '🏁 Hole Game terminé',
        finalText,
        COLORS.success
      )
    ],
    components: endedRows()
  });
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
      guildId,
      host: interaction.user.id,
      players: [],
      state: 'lobby',
      sentences: [],
      prompts: [],
      answers: [],
      votes: {},
      scores: {},
      currentPromptIndex: 0,
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

    setGameTimer(guildId, config.lobby, async () => {
      const fresh = getGame(guildId);
      if (fresh?.state === 'lobby') {
        const channel = await interaction.channel.fetch().catch(() => interaction.channel);
        if (fresh.players.length >= 2) {
          fresh.state = 'writing';
          setGame(guildId, fresh);
          await startWritingFromChannel(channel, guildId);
        } else {
          await channel.send({
            embeds: [
              baseEmbed(
                '⏱️ Lobby expiré',
                'Pas assez de joueurs pour lancer la partie.',
                COLORS.error
              )
            ],
            components: endedRows()
          });

          clearGameTimer(guildId);
          setGame(guildId, null);
        }
      }
    });
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
    game.scores[interaction.user.id] = 0;

    setGame(interaction.guildId, game);
    await updateMainPanel(interaction, game);

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
    delete game.scores[interaction.user.id];

    if (interaction.user.id === game.host) {
      clearGameTimer(interaction.guildId);
      setGame(interaction.guildId, null);

      return interaction.reply({
        content: '❌ L’hôte a quitté la partie. La partie est supprimée.',
        ephemeral: false
      });
    }

    setGame(interaction.guildId, game);
    await updateMainPanel(interaction, game);

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

    clearGameTimer(interaction.guildId);
    return startWritingPhase(interaction);
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

    if (game.sentences.some(sentence => sentence.author === interaction.user.id)) {
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
      .setLabel('Phrase avec [trou]')
      .setPlaceholder('Exemple : Nous voulons aller [trou] pour manger [trou] demain.')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(15)
      .setMaxLength(150)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  if (interaction.customId === 'hole_answer') {
    if (game.state !== 'answering') {
      return interaction.reply({
        content: '❌ Ce n’est pas la phase de réponse.',
        ephemeral: true
      });
    }

    const prompt = currentPrompt(game);

    if (!prompt) {
      return interaction.reply({
        content: '❌ Aucune phrase active.',
        ephemeral: true
      });
    }

    if (!game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu ne participes pas à cette partie.',
        ephemeral: true
      });
    }

    if (prompt.author === interaction.user.id) {
      return interaction.reply({
        content: '❌ Tu ne peux pas répondre à ta propre phrase.',
        ephemeral: true
      });
    }

    if (hasPlayerAnswered(game, interaction.user.id, prompt.id)) {
      return interaction.reply({
        content: '❌ Tu as déjà répondu à cette phrase.',
        ephemeral: true
      });
    }

    const holes = countHoles(prompt.text);

    const modal = new ModalBuilder()
      .setCustomId(`hole_answer_modal_${prompt.id}`)
      .setTitle('Complète la phrase');

    for (let i = 0; i < holes; i++) {
      const input = new TextInputBuilder()
        .setCustomId(`answer_${i}`)
        .setLabel(`Réponse pour le trou ${i + 1}`)
        .setPlaceholder('Ta réponse')
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(40)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
    }

    return interaction.showModal(modal);
  }

  if (interaction.customId.startsWith('hole_vote_')) {
    if (game.state !== 'voting') {
      return interaction.reply({
        content: '❌ Ce n’est pas la phase de vote.',
        ephemeral: true
      });
    }

    const answerId = interaction.customId.replace('hole_vote_', '');
    const answer = game.answers.find(item => item.id === answerId);
    const prompt = currentPrompt(game);

    if (!answer || !prompt) {
      return interaction.reply({
        content: '❌ Réponse introuvable.',
        ephemeral: true
      });
    }

    if (!game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu ne participes pas à cette partie.',
        ephemeral: true
      });
    }

    if (answer.author === interaction.user.id) {
      return interaction.reply({
        content: '❌ Tu ne peux pas voter pour ta propre réponse.',
        ephemeral: true
      });
    }

    if (game.votes[interaction.user.id]) {
      return interaction.reply({
        content: '❌ Tu as déjà voté pour cette phrase.',
        ephemeral: true
      });
    }

    game.votes[interaction.user.id] = answerId;
    setGame(interaction.guildId, game);
    await updateMainPanel(interaction, game);

    return interaction.reply({
      content: '✅ Vote enregistré anonymement.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'hole_refresh') {
    await updateMainPanel(interaction, game);

    return interaction.reply({
      embeds: [
        game.state === 'lobby'
          ? lobbyEmbed(game, getConfig(interaction.guildId))
          : statusEmbed(game)
      ],
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

    clearGameTimer(interaction.guildId);

    if (game.state === 'lobby') {
      if (game.players.length < 2) {
        return interaction.reply({
          content: '❌ Il faut au moins **2 joueurs** pour lancer.',
          ephemeral: true
        });
      }

      return startWritingPhase(interaction);
    }

    await interaction.reply({
      content: '⏭️ Étape passée manuellement.',
      ephemeral: true
    });

    if (game.state === 'writing') {
      return finishWritingPhase(interaction.channel, interaction.guildId);
    }

    if (game.state === 'answering') {
      return startVotingPhase(interaction.channel, interaction.guildId);
    }

    if (game.state === 'voting') {
      return resolveVotingPhase(interaction.channel, interaction.guildId);
    }

    return interaction.followUp({
      content: 'Cette étape ne peut pas être skip.',
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

    clearGameTimer(interaction.guildId);
    setGame(interaction.guildId, null);

    return interaction.reply({
      content: '❌ Partie Hole Game supprimée.',
      ephemeral: false
    });
  }
}
/* ========================
   📝 MODALS
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
    if (game.state !== 'writing') {
      return interaction.reply({
        content: '❌ Ce n’est plus la phase d’écriture.',
        ephemeral: true
      });
    }

    if (!game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu ne participes pas à cette partie.',
        ephemeral: true
      });
    }

    if (game.sentences.some(item => item.author === interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu as déjà envoyé ta phrase.',
        ephemeral: true
      });
    }

    const rawSentence = interaction.fields.getTextInputValue('sentence');
    const error = validateSentence(rawSentence);

    if (error) {
      return interaction.reply({
        content: `❌ ${error}`,
        ephemeral: true
      });
    }

    const sentence = normalizeSentence(rawSentence);

    game.sentences.push({
      id: `sentence_${interaction.user.id}`,
      author: interaction.user.id,
      text: sentence
    });

    setGame(interaction.guildId, game);
    await updateMainPanel(interaction, game);

    if (game.sentences.length >= game.players.length) {
      await interaction.reply({
        content: `✅ Phrase enregistrée ! Toutes les phrases sont reçues, on passe à la suite.`,
        ephemeral: true
      });

      return finishWritingPhase(interaction.channel, interaction.guildId);
    }

    return interaction.reply({
      content: `✅ Phrase enregistrée ! (${game.sentences.length}/${game.players.length})`,
      ephemeral: true
    });
  }

  if (interaction.customId.startsWith('hole_answer_modal_')) {
    if (game.state !== 'answering') {
      return interaction.reply({
        content: '❌ Ce n’est plus la phase de réponse.',
        ephemeral: true
      });
    }

    const promptId = interaction.customId.replace('hole_answer_modal_', '');
    const prompt = currentPrompt(game);

    if (!prompt || prompt.id !== promptId) {
      return interaction.reply({
        content: '❌ Cette phrase n’est plus active.',
        ephemeral: true
      });
    }

    if (!game.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Tu ne participes pas à cette partie.',
        ephemeral: true
      });
    }

    if (prompt.author === interaction.user.id) {
      return interaction.reply({
        content: '❌ Tu ne peux pas répondre à ta propre phrase.',
        ephemeral: true
      });
    }

    if (hasPlayerAnswered(game, interaction.user.id, prompt.id)) {
      return interaction.reply({
        content: '❌ Tu as déjà répondu à cette phrase.',
        ephemeral: true
      });
    }

    const holes = countHoles(prompt.text);
    const values = [];

    for (let i = 0; i < holes; i++) {
      const value = interaction.fields.getTextInputValue(`answer_${i}`).trim();

      if (!value || value.length > 40) {
        return interaction.reply({
          content: `❌ La réponse du trou ${i + 1} doit faire entre **1 et 40 caractères**.`,
          ephemeral: true
        });
      }

      values.push(value);
    }

    game.answers.push({
      id: `answer_${prompt.id}_${interaction.user.id}`,
      promptId: prompt.id,
      author: interaction.user.id,
      values
    });

    setGame(interaction.guildId, game);
    await updateMainPanel(interaction, game);

    const eligible = answerEligiblePlayers(game, prompt);
    const answers = currentPromptAnswers(game);

    if (answers.length >= eligible.length) {
      await interaction.reply({
        content: '✅ Réponse enregistrée ! Toutes les réponses sont reçues, on passe au vote.',
        ephemeral: true
      });

      return startVotingPhase(interaction.channel, interaction.guildId);
    }

    return interaction.reply({
      content: `✅ Réponse enregistrée ! (${answers.length}/${eligible.length})`,
      ephemeral: true
    });
  }
}

/* ========================
   HELPERS MANQUANTS
======================== */

async function startWritingFromChannel(channel, guildId) {
  const game = getGame(guildId);
  const config = getConfig(guildId);

  if (!game) return;

  game.state = 'writing';
  game.sentences = [];
  game.answers = [];
  game.votes = {};
  game.scores = Object.fromEntries(game.players.map(id => [id, 0]));
  game.prompts = [];
  game.currentPromptIndex = 0;

  setGame(guildId, game);
  await updateMainPanel(channel, game);

  await channel.send({
    embeds: [
      baseEmbed(
        '📝 Phase 1 — Écriture des phrases',
        `Chaque joueur doit écrire **1 phrase** avec \`[trou]\`.\n\n` +
        `📌 **Règles :**\n` +
        `• Minimum **1** \`[trou]\`\n` +
        `• Maximum **4** \`[trou]\`\n` +
        `• Phrase entre **15 et 150 caractères**\n\n` +
        `✅ Exemple :\n` +
        `Nous aimerions tous aller [trou] pour se farcir [trou] demain.\n\n` +
        `Clique sur **Écrire ma phrase**.\n\n` +
        `⏱️ Durée : **${config.writing}s**.`,
        COLORS.warning
      )
    ],
    components: writingRows()
  });

  setGameTimer(guildId, config.writing, async () => {
    await finishWritingPhase(channel, guildId);
  });
}