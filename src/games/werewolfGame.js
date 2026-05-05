import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';

import fs from 'node:fs';
import path from 'node:path';

const LG_CHANNEL_ID = '1499036124063072458';
const CONFIG_FILE = './data/config.json';

const COLORS = {
  main: 0x8B5CF6,
  success: 0x22C55E,
  error: 0xEF4444,
  warning: 0xF59E0B,
  night: 0x312E81,
  day: 0xFACC15
};

const defaultConfig = {
  minPlayers: 4,
  maxPlayers: 16,
  wolves: 1,
  roles: {
    seer: true,
    witch: true,
    hunter: true,
    guard: true,
    elder: true,
    raven: true,
    cupid: true
  },
  timers: {
    lobby: 90,
    night: 60,
    day: 180,
    vote: 60,
    hunter: 45
  }
};

const games = new Map();
const timers = new Map();

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function mergeConfig(cfg) {
  return {
    ...structuredClone(defaultConfig),
    ...cfg,
    roles: {
      ...defaultConfig.roles,
      ...(cfg?.roles ?? {})
    },
    timers: {
      ...defaultConfig.timers,
      ...(cfg?.timers ?? {})
    }
  };
}

function getGuildConfig(guildId) {
  const all = loadJson(CONFIG_FILE, {});
  return mergeConfig(all[guildId]);
}

function setGuildConfig(guildId, config) {
  const all = loadJson(CONFIG_FILE, {});
  all[guildId] = mergeConfig(config);
  saveJson(CONFIG_FILE, all);
}

function mention(id) {
  return `<@${id}>`;
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function clearTimer(guildId) {
  const timer = timers.get(guildId);
  if (timer) clearTimeout(timer);
  timers.delete(guildId);
}

function setTimer(guildId, seconds, callback) {
  clearTimer(guildId);

  const timer = setTimeout(async () => {
    try {
      await callback();
    } catch (err) {
      console.error('Erreur timer LG:', err);
    }
  }, seconds * 1000);

  timers.set(guildId, timer);
}

function embed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'DYNASTY-GAMES • Loup-Garou' })
    .setTimestamp();
}

function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

function roleName(role) {
  return {
    wolf: '🐺 Loup-Garou',
    villager: '👨‍🌾 Villageois',
    seer: '🔮 Voyante',
    witch: '🧪 Sorcière',
    hunter: '🏹 Chasseur',
    guard: '🛡️ Salvateur',
    elder: '🧓 Ancien',
    raven: '🪶 Corbeau',
    cupid: '💘 Cupidon'
  }[role] ?? role;
}

function stateName(state) {
  return {
    lobby: 'Lobby',
    cupid: 'Cupidon',
    night_guard: 'Nuit — Salvateur',
    night_wolves: 'Nuit — Loups-Garous',
    night_seer: 'Nuit — Voyante',
    night_raven: 'Nuit — Corbeau',
    night_witch: 'Nuit — Sorcière',
    night_resolve: 'Résolution de nuit',
    hunter_shot: 'Chasseur',
    day: 'Débat du village',
    day_vote: 'Vote du village'
  }[state] ?? state;
}

function getGame(guildId) {
  return games.get(guildId) ?? null;
}

function setGame(guildId, game) {
  if (game) games.set(guildId, game);
  else games.delete(guildId);
}

function alivePlayers(game) {
  return game.players.filter(p => p.alive);
}

function findPlayer(game, id) {
  return game.players.find(p => p.id === id);
}

async function getGameChannel(guild) {
  return guild.channels.fetch(LG_CHANNEL_ID).catch(() => null);
}

function assertGameChannel(interaction) {
  return interaction.channelId === LG_CHANNEL_ID;
}

function wrongChannelReply(interaction) {
  return interaction.reply({
    content: `Cette commande est utilisable uniquement dans <#${LG_CHANNEL_ID}>.`,
    ephemeral: true
  });
}

function buildButtons(lobby = false) {
  const rows = [];

  if (lobby) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lg_join')
          .setLabel('Rejoindre')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('lg_leave')
          .setLabel('Quitter')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('lg_begin')
          .setLabel('Lancer')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('lg_refresh')
          .setLabel('Actualiser')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lg_skip')
        .setLabel('Skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('lg_delete')
        .setLabel('Supprimer')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

function listPlayers(game, revealRoles = false) {
  if (!game.players.length) return 'Aucun joueur.';

  return game.players.map((p, i) => {
    const status = p.alive ? '🟢' : '🔴';
    const role = revealRoles ? ` — **${roleName(p.role)}**` : '';
    const lover = game.lovers?.includes(p.id) ? ' 💘' : '';
    return `**${i + 1}.** ${status} ${mention(p.id)}${lover}${role}`;
  }).join('\n');
}

function lobbyEmbed(game, cfg) {
  return new EmbedBuilder()
    .setColor(COLORS.main)
    .setTitle('🐺 Lobby Loup-Garou')
    .setDescription(
      `👑 **Hôte :** ${mention(game.hostId)}\n` +
      `📍 **Salon :** <#${LG_CHANNEL_ID}>\n` +
      `👥 **Joueurs :** ${game.players.length}/${cfg.maxPlayers}\n` +
      `🎯 **Minimum :** ${cfg.minPlayers}\n` +
      `⏱️ **Départ auto :** ${cfg.timers.lobby}s\n\n` +
      `## Joueurs inscrits\n${listPlayers(game)}`
    )
    .addFields(
      {
        name: '🎭 Rôles activés',
        value:
          `🐺 Loups : **${cfg.wolves}**\n` +
          `🔮 Voyante : **${cfg.roles.seer ? 'ON' : 'OFF'}**\n` +
          `🧪 Sorcière : **${cfg.roles.witch ? 'ON' : 'OFF'}**\n` +
          `🏹 Chasseur : **${cfg.roles.hunter ? 'ON' : 'OFF'}**\n` +
          `🛡️ Salvateur : **${cfg.roles.guard ? 'ON' : 'OFF'}**\n` +
          `🧓 Ancien : **${cfg.roles.elder ? 'ON' : 'OFF'}**\n` +
          `🪶 Corbeau : **${cfg.roles.raven ? 'ON' : 'OFF'}**\n` +
          `💘 Cupidon : **${cfg.roles.cupid ? 'ON' : 'OFF'}**`,
        inline: true
      },
      {
        name: '⏱️ Timers',
        value:
          `Lobby : **${cfg.timers.lobby}s**\n` +
          `Nuit : **${cfg.timers.night}s**\n` +
          `Jour : **${cfg.timers.day}s**\n` +
          `Vote : **${cfg.timers.vote}s**\n` +
          `Chasseur : **${cfg.timers.hunter}s**`,
        inline: true
      }
    )
    .setFooter({ text: 'DYNASTY-GAMES • Loup-Garou' })
    .setTimestamp();
}

function statusEmbed(game) {
  const alive = alivePlayers(game);
  const wolves = alive.filter(p => p.role === 'wolf').length;
  const village = alive.length - wolves;

  return embed(
    '📊 État de la partie',
    `📌 **Phase :** ${stateName(game.state)}\n` +
    `☀️ **Jour :** ${game.day}\n` +
    `👥 **Vivants :** ${alive.length}\n` +
    `🐺 **Loups vivants :** ${wolves}\n` +
    `🏘️ **Village vivants :** ${village}\n\n` +
    `## Joueurs\n${listPlayers(game)}`
  );
}

function buildRoles(playerCount, cfg) {
  const roles = [];
  const wolves = Math.min(cfg.wolves, Math.max(1, Math.floor(playerCount / 3)));

  for (let i = 0; i < wolves; i++) roles.push('wolf');

  const specials = [
    ['seer', cfg.roles.seer],
    ['witch', cfg.roles.witch],
    ['hunter', cfg.roles.hunter],
    ['guard', cfg.roles.guard],
    ['elder', cfg.roles.elder],
    ['raven', cfg.roles.raven],
    ['cupid', cfg.roles.cupid]
  ];

  for (const [role, enabled] of specials) {
    if (enabled && roles.length < playerCount) roles.push(role);
  }

  while (roles.length < playerCount) roles.push('villager');

  return shuffle(roles);
}

async function safeDM(client, id, content) {
  const user = await client.users.fetch(id).catch(() => null);
  if (!user) return false;
  return user.send(content).then(() => true).catch(() => false);
}

async function deleteWolfChannel(guild, game) {
  if (!game?.wolfChannelId) return;
  const channel = await guild.channels.fetch(game.wolfChannelId).catch(() => null);
  if (channel) await channel.delete().catch(() => {});
}

async function updateLobbyMessage(guild, game, cfg) {
  if (!game.lobbyMessageId) return;

  const channel = await getGameChannel(guild);
  const message = await channel?.messages.fetch(game.lobbyMessageId).catch(() => null);

  if (!message) return;

  await message.edit({
    embeds: [lobbyEmbed(game, cfg)],
    components: buildButtons(true)
  }).catch(() => {});
}

function firstNightState(game, cfg) {
  if (cfg.roles.guard && alivePlayers(game).some(p => p.role === 'guard')) return 'night_guard';
  return 'night_wolves';
}

function nextAfterSeer(game, cfg) {
  if (cfg.roles.raven && alivePlayers(game).some(p => p.role === 'raven')) return 'night_raven';
  return 'night_witch';
}

/* ========================
   COMMANDES
======================== */

export async function handleLGCommand(interaction, client) {
  if (!assertGameChannel(interaction)) return wrongChannelReply(interaction);

  const sub = interaction.options.getSubcommand();
  const cfg = getGuildConfig(interaction.guildId);

  if (sub === 'config') return configCommand(interaction, cfg);
  if (sub === 'voir-config') return viewConfig(interaction, cfg);
  if (sub === 'start') return startLobby(interaction);
  if (sub === 'join') return joinGame(interaction);
  if (sub === 'leave') return leaveGame(interaction);
  if (sub === 'begin') return beginCommand(interaction, client);
  if (sub === 'skip') return skipPhase(interaction, client);
  if (sub === 'vote') return voteCommand(interaction);
  if (sub === 'action') return actionCommand(interaction, client);
  if (sub === 'status') return statusCommand(interaction);
  if (sub === 'stop') return stopCommand(interaction);
}

export async function handleLGButtons(interaction, client) {
  if (!assertGameChannel(interaction)) return wrongChannelReply(interaction);

  if (interaction.customId === 'lg_join') return joinGame(interaction);
  if (interaction.customId === 'lg_leave') return leaveGame(interaction);
  if (interaction.customId === 'lg_begin') return beginCommand(interaction, client);
  if (interaction.customId === 'lg_skip') return skipPhase(interaction, client);
  if (interaction.customId === 'lg_delete') return stopCommand(interaction);

  if (interaction.customId === 'lg_refresh') {
    const game = getGame(interaction.guildId);
    const cfg = getGuildConfig(interaction.guildId);

    if (!game) {
      return interaction.reply({ content: 'Aucune partie en cours.', ephemeral: true });
    }

    if (game.state === 'lobby') {
      await updateLobbyMessage(interaction.guild, game, cfg);
      return interaction.reply({
        embeds: [lobbyEmbed(game, cfg)],
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [statusEmbed(game)],
      ephemeral: true
    });
  }
}

async function configCommand(interaction, cfg) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Permission modérateur requise.', ephemeral: true });
  }

  const next = structuredClone(cfg);

  next.minPlayers = interaction.options.getInteger('min') ?? next.minPlayers;
  next.maxPlayers = interaction.options.getInteger('max') ?? next.maxPlayers;
  next.wolves = interaction.options.getInteger('loups') ?? next.wolves;

  next.roles.seer = interaction.options.getBoolean('voyante') ?? next.roles.seer;
  next.roles.witch = interaction.options.getBoolean('sorciere') ?? next.roles.witch;
  next.roles.hunter = interaction.options.getBoolean('chasseur') ?? next.roles.hunter;
  next.roles.guard = interaction.options.getBoolean('salvateur') ?? next.roles.guard;
  next.roles.elder = interaction.options.getBoolean('ancien') ?? next.roles.elder;
  next.roles.raven = interaction.options.getBoolean('corbeau') ?? next.roles.raven;
  next.roles.cupid = interaction.options.getBoolean('cupidon') ?? next.roles.cupid;

  next.timers.lobby = interaction.options.getInteger('lobby_sec') ?? next.timers.lobby;
  next.timers.night = interaction.options.getInteger('nuit_sec') ?? next.timers.night;
  next.timers.day = interaction.options.getInteger('jour_sec') ?? next.timers.day;
  next.timers.vote = interaction.options.getInteger('vote_sec') ?? next.timers.vote;
  next.timers.hunter = interaction.options.getInteger('chasseur_sec') ?? next.timers.hunter;

  if (next.minPlayers > next.maxPlayers) {
    return interaction.reply({
      content: '`min` ne peut pas être supérieur à `max`.',
      ephemeral: true
    });
  }

  setGuildConfig(interaction.guildId, next);

  return interaction.reply({
    embeds: [
      embed(
        '✅ Configuration enregistrée',
        `Salon fixe : <#${LG_CHANNEL_ID}>\n` +
        `Joueurs : **${next.minPlayers}-${next.maxPlayers}**\n` +
        `Loups : **${next.wolves}**\n\n` +
        `## Rôles\n` +
        `🔮 Voyante : **${next.roles.seer ? 'ON' : 'OFF'}**\n` +
        `🧪 Sorcière : **${next.roles.witch ? 'ON' : 'OFF'}**\n` +
        `🏹 Chasseur : **${next.roles.hunter ? 'ON' : 'OFF'}**\n` +
        `🛡️ Salvateur : **${next.roles.guard ? 'ON' : 'OFF'}**\n` +
        `🧓 Ancien : **${next.roles.elder ? 'ON' : 'OFF'}**\n` +
        `🪶 Corbeau : **${next.roles.raven ? 'ON' : 'OFF'}**\n` +
        `💘 Cupidon : **${next.roles.cupid ? 'ON' : 'OFF'}**\n\n` +
        `Utilise maintenant \`/lg start\` pour lancer un lobby.`,
        COLORS.success
      )
    ]
  });
}

async function viewConfig(interaction, cfg) {
  return interaction.reply({
    embeds: [
      embed(
        '⚙️ Configuration Loup-Garou',
        `Salon fixe : <#${LG_CHANNEL_ID}>\n` +
        `Joueurs : **${cfg.minPlayers}-${cfg.maxPlayers}**\n` +
        `Loups : **${cfg.wolves}**\n\n` +
        `## Rôles\n` +
        `🔮 Voyante : **${cfg.roles.seer ? 'ON' : 'OFF'}**\n` +
        `🧪 Sorcière : **${cfg.roles.witch ? 'ON' : 'OFF'}**\n` +
        `🏹 Chasseur : **${cfg.roles.hunter ? 'ON' : 'OFF'}**\n` +
        `🛡️ Salvateur : **${cfg.roles.guard ? 'ON' : 'OFF'}**\n` +
        `🧓 Ancien : **${cfg.roles.elder ? 'ON' : 'OFF'}**\n` +
        `🪶 Corbeau : **${cfg.roles.raven ? 'ON' : 'OFF'}**\n` +
        `💘 Cupidon : **${cfg.roles.cupid ? 'ON' : 'OFF'}**\n\n` +
        `## Timers\n` +
        `Lobby : **${cfg.timers.lobby}s**\n` +
        `Nuit : **${cfg.timers.night}s**\n` +
        `Jour : **${cfg.timers.day}s**\n` +
        `Vote : **${cfg.timers.vote}s**\n` +
        `Chasseur : **${cfg.timers.hunter}s**`
      )
    ]
  });
}

async function startLobby(interaction) {
  const cfg = getGuildConfig(interaction.guildId);

  if (getGame(interaction.guildId)) {
    return interaction.reply({
      content: 'Une partie existe déjà.',
      ephemeral: true
    });
  }

  const game = {
    guildId: interaction.guildId,
    channelId: LG_CHANNEL_ID,
    hostId: interaction.user.id,
    state: 'lobby',
    day: 0,
    players: [],
    votes: {},
    night: {},
    witch: { healUsed: false, killUsed: false },
    wolfChannelId: null,
    hunterDeadId: null,
    hunterDeathPhase: null,
    lovers: [],
    cupidChoices: [],
    ravenTarget: null,
    ravenNextTarget: null,
    previousGuardTarget: null,
    lobbyMessageId: null
  };

  setGame(interaction.guildId, game);

  await interaction.reply({
    embeds: [lobbyEmbed(game, cfg)],
    components: buildButtons(true)
  });

  const message = await interaction.fetchReply().catch(() => null);
  if (message) {
    game.lobbyMessageId = message.id;
    setGame(interaction.guildId, game);
  }

  setTimer(interaction.guildId, cfg.timers.lobby, async () => {
    const fresh = getGame(interaction.guildId);
    if (fresh?.state === 'lobby') await beginGame(interaction.guild, null, interaction.client);
  });
}

async function joinGame(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const game = getGame(interaction.guildId);

  if (!game || game.state !== 'lobby') {
    return interaction.reply({ content: 'Aucun lobby ouvert.', ephemeral: true });
  }

  if (game.players.some(p => p.id === interaction.user.id)) {
    return interaction.reply({ content: 'Tu es déjà inscrit.', ephemeral: true });
  }

  if (game.players.length >= cfg.maxPlayers) {
    return interaction.reply({ content: 'Le lobby est complet.', ephemeral: true });
  }

  game.players.push({
    id: interaction.user.id,
    username: interaction.user.username,
    alive: true,
    role: null,
    elderShield: true
  });

  setGame(interaction.guildId, game);
  await updateLobbyMessage(interaction.guild, game, cfg);

  return interaction.reply({
    content: `✅ Tu as rejoint la partie. Joueurs : **${game.players.length}/${cfg.maxPlayers}**`,
    ephemeral: true
  });
}

async function leaveGame(interaction) {
  const cfg = getGuildConfig(interaction.guildId);
  const game = getGame(interaction.guildId);

  if (!game || game.state !== 'lobby') {
    return interaction.reply({ content: 'Aucun lobby ouvert.', ephemeral: true });
  }

  game.players = game.players.filter(p => p.id !== interaction.user.id);
  setGame(interaction.guildId, game);
  await updateLobbyMessage(interaction.guild, game, cfg);

  return interaction.reply({ content: '🚪 Tu as quitté le lobby.', ephemeral: true });
}

async function beginCommand(interaction, client) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: 'Seuls les modérateurs peuvent lancer la partie.',
      ephemeral: true
    });
  }

  await interaction.deferReply();
  return beginGame(interaction.guild, interaction, client);
}

async function beginGame(guild, interaction = null, client = null) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game || game.state !== 'lobby') {
    if (interaction) return interaction.editReply('Aucun lobby à démarrer.');
    return;
  }

  if (game.players.length < cfg.minPlayers) {
    const msg = `Pas assez de joueurs : **${game.players.length}/${cfg.minPlayers}**.`;

    if (interaction) return interaction.editReply(msg);
    if (channel) await channel.send(msg).catch(() => {});
    return;
  }

  clearTimer(guild.id);

  const roles = buildRoles(game.players.length, cfg);

  game.players = shuffle(game.players).map((player, index) => ({
    ...player,
    role: roles[index],
    alive: true,
    elderShield: roles[index] === 'elder'
  }));

  game.day = 1;
  game.votes = {};
  game.night = {};
  game.hunterDeadId = null;
  game.hunterDeathPhase = null;
  game.lovers = [];
  game.cupidChoices = [];
  game.ravenTarget = null;
  game.ravenNextTarget = null;
  game.previousGuardTarget = null;

  const hasCupid = cfg.roles.cupid && alivePlayers(game).some(p => p.role === 'cupid');
  game.state = hasCupid ? 'cupid' : firstNightState(game, cfg);

  setGame(guild.id, game);

  const wolves = game.players.filter(p => p.role === 'wolf');
  const wolvesText = wolves.map(p => mention(p.id)).join(', ') || 'aucun';

  let wolfChannel = null;

  try {
    wolfChannel = await guild.channels.create({
      name: `loups-garous-${Date.now()}`,
      type: ChannelType.GuildText,
      parent: channel?.parentId ?? null,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        ...wolves.map(player => ({
          id: player.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        })),
        {
          id: guild.members.me?.id ?? guild.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });

    game.wolfChannelId = wolfChannel.id;
    setGame(guild.id, game);

    await wolfChannel.send(
      '🐺 **Salon privé des Loups-Garous**\n' +
      'Discutez ici pendant la partie.\n' +
      'Pendant la nuit, utilisez `/lg action type:Loups: attaquer joueur:@cible`.'
    );
  } catch (err) {
    console.error('Impossible de créer le salon des loups:', err);

    await channel?.send(
      '⚠️ Impossible de créer le salon privé des loups. Vérifie la permission **Gérer les salons**.'
    ).catch(() => {});
  }

  for (const player of game.players) {
    let extra = '';

    if (player.role === 'wolf') {
      extra += `\nTes alliés loups : ${wolvesText}`;
      if (wolfChannel) extra += `\nSalon privé : <#${wolfChannel.id}>`;
    }

    if (player.role === 'witch') {
      extra += '\nTu as **1 potion de vie** et **1 potion de mort** pour toute la partie.';
    }

    if (player.role === 'elder') {
      extra += '\nTu résistes à la première attaque des Loups-Garous.';
    }

    if (player.role === 'guard') {
      extra += '\nTu peux protéger une personne chaque nuit.';
    }

    if (player.role === 'raven') {
      extra += '\nTu peux marquer une personne pour lui ajouter 1 vote au prochain vote du village.';
    }

    if (player.role === 'cupid') {
      extra += '\nAu début de la partie, tu choisis deux amoureux.';
    }

    await safeDM(
      client,
      player.id,
      `🎭 Ton rôle est **${roleName(player.role)}**.${extra}\n\n` +
      `Utilise \`/lg action\` dans le salon du jeu quand ton rôle est appelé.`
    );
  }

  if (interaction) {
    await interaction.editReply('✅ La partie commence. Les rôles ont été envoyés en message privé.');
  }

  await channel?.send({
    embeds: [
      embed(
        '🎭 Distribution des rôles',
        `La partie commence avec **${game.players.length} joueurs**.\n\n` +
        `🐺 Loups-Garous : **${game.players.filter(p => p.role === 'wolf').length}**\n` +
        `🔮 Voyante : **${game.players.filter(p => p.role === 'seer').length}**\n` +
        `🧪 Sorcière : **${game.players.filter(p => p.role === 'witch').length}**\n` +
        `🏹 Chasseur : **${game.players.filter(p => p.role === 'hunter').length}**\n` +
        `🛡️ Salvateur : **${game.players.filter(p => p.role === 'guard').length}**\n` +
        `🧓 Ancien : **${game.players.filter(p => p.role === 'elder').length}**\n` +
        `🪶 Corbeau : **${game.players.filter(p => p.role === 'raven').length}**\n` +
        `💘 Cupidon : **${game.players.filter(p => p.role === 'cupid').length}**\n\n` +
        `Première phase : **${stateName(game.state)}**.`,
        COLORS.night
      )
    ],
    components: buildButtons(false)
  });

  return announceCurrentPhase(guild);
}

async function announceCurrentPhase(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return;

  if (game.state === 'cupid') {
    await channel?.send({
      embeds: [
        embed(
          '💘 Cupidon',
          `Cupidon choisit deux amoureux avec :\n` +
          `\`/lg action type:Cupidon: amoureux 1 joueur:@joueur\`\n` +
          `\`/lg action type:Cupidon: amoureux 2 joueur:@joueur\`\n\n` +
          `Durée : **${cfg.timers.night}s**.`,
          COLORS.night
        )
      ],
      components: buildButtons(false)
    });

    return setTimer(guild.id, cfg.timers.night, () => nextNightPhase(guild));
  }

  if (game.state === 'night_guard') {
    await channel?.send({
      embeds: [
        embed(
          `🛡️ Salvateur — Nuit ${game.day}`,
          `Le Salvateur peut protéger un joueur avec :\n` +
          `\`/lg action type:Salvateur: protéger joueur:@cible\`\n\n` +
          `Il ne peut pas protéger deux nuits de suite la même personne.\n` +
          `Durée : **${cfg.timers.night}s**.`,
          COLORS.night
        )
      ],
      components: buildButtons(false)
    });

    return setTimer(guild.id, cfg.timers.night, () => nextNightPhase(guild));
  }

  if (game.state === 'night_wolves') {
    await channel?.send({
      embeds: [
        embed(
          `🌙 Loups-Garous — Nuit ${game.day}`,
          `Les Loups-Garous choisissent une victime avec :\n` +
          `\`/lg action type:Loups: attaquer joueur:@cible\`\n\n` +
          `Durée : **${cfg.timers.night}s**.`,
          COLORS.night
        )
      ],
      components: buildButtons(false)
    });

    return setTimer(guild.id, cfg.timers.night, () => nextNightPhase(guild));
  }
}

async function nextNightPhase(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return;

  if (game.state === 'cupid') {
    if (
      game.cupidChoices.length >= 2 &&
      game.cupidChoices[0] &&
      game.cupidChoices[1] &&
      game.cupidChoices[0] !== game.cupidChoices[1]
    ) {
      game.lovers = [game.cupidChoices[0], game.cupidChoices[1]];

      await channel?.send('💘 Deux joueurs sont maintenant amoureux. Leur identité reste secrète.')
        .catch(() => {});
    }

    game.state = firstNightState(game, cfg);
    setGame(guild.id, game);
    return announceCurrentPhase(guild);
  }

  if (game.state === 'night_guard') {
    game.state = 'night_wolves';
    setGame(guild.id, game);
    return announceCurrentPhase(guild);
  }

  if (game.state === 'night_wolves') {
    game.state = cfg.roles.seer && alivePlayers(game).some(p => p.role === 'seer')
      ? 'night_seer'
      : nextAfterSeer(game, cfg);

    setGame(guild.id, game);

    if (game.state === 'night_seer') {
      await channel?.send({
        embeds: [
          embed(
            '🔮 Voyante',
            `La Voyante peut espionner un joueur avec :\n` +
            `\`/lg action type:Voyante: espionner joueur:@cible\`\n\n` +
            `Durée : **${cfg.timers.night}s**.`,
            COLORS.night
          )
        ],
        components: buildButtons(false)
      });

      return setTimer(guild.id, cfg.timers.night, () => nextNightPhase(guild));
    }
  }

  if (game.state === 'night_seer') {
    game.state = nextAfterSeer(game, cfg);
    setGame(guild.id, game);
  }

  if (game.state === 'night_raven') {
    await channel?.send({
      embeds: [
        embed(
          '🪶 Corbeau',
          `Le Corbeau peut marquer un joueur avec :\n` +
          `\`/lg action type:Corbeau: marquer joueur:@cible\`\n\n` +
          `La cible commencera le vote avec **1 vote contre elle**.\n` +
          `Durée : **${cfg.timers.night}s**.`,
          COLORS.night
        )
      ],
      components: buildButtons(false)
    });

    game.state = 'night_witch';
    setGame(guild.id, game);
    return setTimer(guild.id, cfg.timers.night, () => nextNightPhase(guild));
  }

  if (game.state === 'night_witch') {
    const victimId = game.night.wolfTarget;
    const victimText = victimId ? mention(victimId) : 'personne';
    const witchAlive = alivePlayers(game).some(p => p.role === 'witch');

    if (witchAlive && (!game.witch.healUsed || !game.witch.killUsed)) {
      game.state = 'night_resolve';
      setGame(guild.id, game);

      await channel?.send({
        embeds: [
          embed(
            '🧪 Sorcière',
            `Victime des loups : **${victimText}**\n\n` +
            `Actions possibles :\n` +
            `\`/lg action type:Sorcière: sauver joueur:@victime\`\n` +
            `\`/lg action type:Sorcière: empoisonner joueur:@cible\`\n\n` +
            `Potion de vie : **${game.witch.healUsed ? 'utilisée' : 'disponible'}**\n` +
            `Potion de mort : **${game.witch.killUsed ? 'utilisée' : 'disponible'}**\n\n` +
            `Durée : **${cfg.timers.night}s**.`,
            COLORS.night
          )
        ],
        components: buildButtons(false)
      });

      return setTimer(guild.id, cfg.timers.night, () => resolveNight(guild));
    }

    return resolveNight(guild);
  }

  if (game.state === 'night_resolve') return resolveNight(guild);
}

function killPlayer(game, id, reason = 'unknown') {
  const player = findPlayer(game, id);
  if (!player?.alive) return { killed: false, protected: false };

  if (player.role === 'elder' && player.elderShield && reason === 'wolves') {
    player.elderShield = false;
    return { killed: false, protected: true };
  }

  player.alive = false;
  return { killed: true, protected: false };
}

function killLoverIfNeeded(game, deadId) {
  if (!game.lovers?.includes(deadId)) return [];

  const loverId = game.lovers.find(id => id !== deadId);
  const lover = findPlayer(game, loverId);

  if (lover?.alive) {
    lover.alive = false;
    return [loverId];
  }

  return [];
}

async function resolveNight(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return;

  const deaths = new Set();
  const protectedMessages = [];

  const wolfTarget = game.night.wolfTarget;
  const guarded = game.night.guardTarget;
  const savedByWitch = game.night.witchSave;

  if (wolfTarget && wolfTarget !== guarded && wolfTarget !== savedByWitch) {
    const result = killPlayer(game, wolfTarget, 'wolves');

    if (result.killed) deaths.add(wolfTarget);
    if (result.protected) {
      protectedMessages.push(`${mention(wolfTarget)} a résisté à l’attaque des Loups-Garous.`);
    }
  }

  if (game.night.witchKill) {
    const result = killPlayer(game, game.night.witchKill, 'witch');
    if (result.killed) deaths.add(game.night.witchKill);
  }

  for (const id of [...deaths]) {
    const loverDeaths = killLoverIfNeeded(game, id);
    for (const loverId of loverDeaths) deaths.add(loverId);
  }

  const deathText = deaths.size
    ? [...deaths].map(id => {
      const p = findPlayer(game, id);
      return `${mention(id)} — **${roleName(p?.role)}**`;
    }).join('\n')
    : 'Personne n’est mort cette nuit.';

  await channel?.send({
    embeds: [
      embed(
        `☀️ Résultat de la nuit ${game.day}`,
        `${deathText}\n\n${protectedMessages.length ? `🛡️ ${protectedMessages.join('\n')}` : ''}`,
        COLORS.day
      )
    ],
    components: buildButtons(false)
  });

  const deadHunter = [...deaths]
    .map(id => findPlayer(game, id))
    .find(p => p?.role === 'hunter');

  if (deadHunter) {
    game.state = 'hunter_shot';
    game.hunterDeadId = deadHunter.id;
    game.hunterDeathPhase = 'night';
    setGame(guild.id, game);

    await channel?.send(
      `🏹 ${mention(deadHunter.id)} était **Chasseur**.\n` +
      `Il peut tirer avec :\n` +
      `\`/lg action type:Chasseur: tirer joueur:@cible\`\n\n` +
      `Il a **${cfg.timers.hunter}s**.`
    );

    return setTimer(guild.id, cfg.timers.hunter, () => resolveNightAfterHunter(guild));
  }

  game.state = 'day';
  game.votes = {};
  game.night = {};
  game.hunterDeadId = null;
  game.hunterDeathPhase = null;
  game.ravenTarget = game.ravenNextTarget;
  game.ravenNextTarget = null;

  setGame(guild.id, game);

  if (await checkWin(guild)) return;

  await channel?.send({
    embeds: [
      embed(
        `☀️ Jour ${game.day}`,
        `Le village se réveille.\n\n` +
        `👥 Vivants : **${alivePlayers(game).length}**\n` +
        `🗳️ Le vote commencera dans **${cfg.timers.day}s**.\n\n` +
        `## Joueurs vivants\n${alivePlayers(game).map(p => `🟢 ${mention(p.id)}`).join('\n')}`,
        COLORS.day
      )
    ],
    components: buildButtons(false)
  });

  setTimer(guild.id, cfg.timers.day, () => startDayVote(guild));
}

async function resolveNightAfterHunter(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return;

  game.state = 'day';
  game.votes = {};
  game.night = {};
  game.hunterDeadId = null;
  game.hunterDeathPhase = null;
  game.ravenTarget = game.ravenNextTarget;
  game.ravenNextTarget = null;

  setGame(guild.id, game);

  if (await checkWin(guild)) return;

  await channel?.send({
    embeds: [
      embed(
        `☀️ Jour ${game.day}`,
        `Le jour se lève.\nVote dans **${cfg.timers.day}s**.`,
        COLORS.day
      )
    ],
    components: buildButtons(false)
  });

  setTimer(guild.id, cfg.timers.day, () => startDayVote(guild));
}

async function startDayVote(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return;

  game.state = 'day_vote';
  game.votes = {};

  if (game.ravenTarget && findPlayer(game, game.ravenTarget)?.alive) {
    game.votes.__raven = game.ravenTarget;
  }

  setGame(guild.id, game);

  await channel?.send({
    embeds: [
      embed(
        '🗳️ Vote du village',
        `Votez avec :\n` +
        `\`/lg vote joueur:@suspect\`\n\n` +
        `✅ Vote discret : confirmation privée.\n` +
        `🔁 Si tu votes plusieurs fois, ton dernier vote compte.\n` +
        `🪶 Corbeau : ${game.ravenTarget ? `${mention(game.ravenTarget)} commence avec **1 vote contre lui**.` : 'aucune cible.'}\n\n` +
        `Durée : **${cfg.timers.vote}s**.`,
        COLORS.warning
      )
    ],
    components: buildButtons(false)
  });

  setTimer(guild.id, cfg.timers.vote, () => resolveDayVote(guild));
}

async function resolveDayVote(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return;

  const counts = {};

  for (const target of Object.values(game.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  const winners = entries.filter(([, count]) => count === max).map(([id]) => id);

  if (!max || winners.length !== 1) {
    await channel?.send({
      embeds: [
        embed(
          '🤝 Vote terminé — Égalité',
          max
            ? `Égalité entre :\n${winners.map(id => `${mention(id)} — **${max} vote(s)**`).join('\n')}\n\nPersonne n’est éliminé.`
            : 'Aucun vote valide. Personne n’est éliminé.',
          COLORS.warning
        )
      ],
      components: buildButtons(false)
    });
  } else {
    const eliminated = winners[0];
    const player = findPlayer(game, eliminated);

    if (player?.alive) player.alive = false;

    const loverDeaths = killLoverIfNeeded(game, eliminated);

    await channel?.send({
      embeds: [
        embed(
          '⚖️ Verdict du village',
          `Le village élimine ${mention(eliminated)}.\n` +
          `Son rôle était **${roleName(player?.role)}**.` +
          `${loverDeaths.length ? `\n\n💘 Par amour, ${loverDeaths.map(mention).join(', ')} meurt aussi.` : ''}`,
          COLORS.error
        )
      ],
      components: buildButtons(false)
    });

    if (player?.role === 'hunter') {
      game.state = 'hunter_shot';
      game.hunterDeadId = player.id;
      game.hunterDeathPhase = 'day';
      setGame(guild.id, game);

      await channel?.send(
        `🏹 ${mention(player.id)} était **Chasseur**.\n` +
        `Il peut tirer avec :\n` +
        `\`/lg action type:Chasseur: tirer joueur:@cible\`\n\n` +
        `Il a **${cfg.timers.hunter}s**.`
      );

      return setTimer(guild.id, cfg.timers.hunter, () => afterDay(guild));
    }
  }

  setGame(guild.id, game);

  if (await checkWin(guild)) return;

  return afterDay(guild);
}

async function afterDay(guild) {
  const cfg = getGuildConfig(guild.id);
  const game = getGame(guild.id);

  if (!game) return;
  if (await checkWin(guild)) return;

  game.day += 1;
  game.state = firstNightState(game, cfg);
  game.votes = {};
  game.night = {};
  game.hunterDeadId = null;
  game.hunterDeathPhase = null;

  setGame(guild.id, game);

  return announceCurrentPhase(guild);
}

async function checkWin(guild) {
  const game = getGame(guild.id);
  const channel = await getGameChannel(guild);

  if (!game) return true;

  const alive = alivePlayers(game);
  const wolves = alive.filter(p => p.role === 'wolf').length;
  const village = alive.length - wolves;

  if (wolves === 0) {
    await channel?.send({
      embeds: [
        embed(
          '🏆 Victoire du village',
          `Tous les Loups-Garous sont morts.\n\n` +
          `## Rôles finaux\n${listPlayers(game, true)}`,
          COLORS.success
        )
      ]
    });

    await deleteWolfChannel(guild, game);
    clearTimer(guild.id);
    setGame(guild.id, null);
    return true;
  }

  if (wolves >= village) {
    await channel?.send({
      embeds: [
        embed(
          '🐺 Victoire des Loups-Garous',
          `Les Loups-Garous sont aussi nombreux ou plus nombreux que le village.\n\n` +
          `## Rôles finaux\n${listPlayers(game, true)}`,
          COLORS.error
        )
      ]
    });

    await deleteWolfChannel(guild, game);
    clearTimer(guild.id);
    setGame(guild.id, null);
    return true;
  }

  return false;
}

async function voteCommand(interaction) {
  const game = getGame(interaction.guildId);

  if (!game || game.state !== 'day_vote') {
    return interaction.reply({
      content: 'Ce n’est pas la phase de vote.',
      ephemeral: true
    });
  }

  const voter = findPlayer(game, interaction.user.id);
  const target = findPlayer(game, interaction.options.getUser('joueur').id);

  if (!voter?.alive || !target?.alive) {
    return interaction.reply({
      content: 'Votant ou cible invalide.',
      ephemeral: true
    });
  }

  if (voter.id === target.id) {
    return interaction.reply({
      content: 'Tu ne peux pas voter contre toi-même.',
      ephemeral: true
    });
  }

  game.votes[voter.id] = target.id;
  setGame(interaction.guildId, game);

  return interaction.reply({
    content: `🗳️ Vote enregistré contre ${mention(target.id)}. Ton vote reste discret.`,
    ephemeral: true
  });
}

async function actionCommand(interaction) {
  const game = getGame(interaction.guildId);

  if (!game) {
    return interaction.reply({
      content: 'Aucune partie en cours.',
      ephemeral: true
    });
  }

  const actor = findPlayer(game, interaction.user.id);
  const target = interaction.options.getUser('joueur');
  const type = interaction.options.getString('type');
  const targetPlayer = findPlayer(game, target.id);

  if (!actor) {
    return interaction.reply({
      content: 'Tu ne joues pas dans cette partie.',
      ephemeral: true
    });
  }

  if (type !== 'hunter_shoot' && !actor.alive) {
    return interaction.reply({
      content: 'Tu n’es pas vivant dans cette partie.',
      ephemeral: true
    });
  }

  if (!targetPlayer?.alive) {
    return interaction.reply({
      content: 'Cette cible n’est pas vivante.',
      ephemeral: true
    });
  }

  if (type === 'wolf') {
    if (actor.role !== 'wolf' || game.state !== 'night_wolves') {
      return interaction.reply({
        content: 'Action non autorisée maintenant.',
        ephemeral: true
      });
    }

    if (targetPlayer.role === 'wolf') {
      return interaction.reply({
        content: 'Tu ne peux pas attaquer un autre loup.',
        ephemeral: true
      });
    }

    game.night.wolfVotes ??= {};
    game.night.wolfVotes[actor.id] = target.id;

    const counts = {};
    for (const id of Object.values(game.night.wolfVotes)) {
      counts[id] = (counts[id] ?? 0) + 1;
    }

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    game.night.wolfTarget = entries[0]?.[0] ?? null;

    setGame(interaction.guildId, game);

    if (game.wolfChannelId) {
      const wolfChannel = await interaction.guild.channels.fetch(game.wolfChannelId).catch(() => null);
      await wolfChannel?.send(`🐺 Vote des loups : ${mention(actor.id)} → ${mention(target.id)}`).catch(() => {});
    }

    return interaction.reply({
      content: `🐺 Vote enregistré contre ${mention(target.id)}.`,
      ephemeral: true
    });
  }

  if (type === 'guard') {
    if (actor.role !== 'guard' || game.state !== 'night_guard') {
      return interaction.reply({
        content: 'Action non autorisée maintenant.',
        ephemeral: true
      });
    }

    if (game.previousGuardTarget === target.id) {
      return interaction.reply({
        content: 'Tu ne peux pas protéger la même personne deux nuits de suite.',
        ephemeral: true
      });
    }

    game.night.guardTarget = target.id;
    game.previousGuardTarget = target.id;

    setGame(interaction.guildId, game);

    return interaction.reply({
      content: `🛡️ Protection enregistrée sur ${mention(target.id)}.`,
      ephemeral: true
    });
  }

  if (type === 'seer') {
    if (actor.role !== 'seer' || game.state !== 'night_seer') {
      return interaction.reply({
        content: 'Action non autorisée maintenant.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `${mention(target.id)} est **${targetPlayer.role === 'wolf' ? 'Loup-Garou' : 'non Loup-Garou'}**.`,
      ephemeral: true
    });
  }

  if (type === 'raven') {
    if (actor.role !== 'raven' || game.state !== 'night_raven') {
      return interaction.reply({
        content: 'Action non autorisée maintenant.',
        ephemeral: true
      });
    }

    game.ravenNextTarget = target.id;
    setGame(interaction.guildId, game);

    return interaction.reply({
      content: `🪶 Le Corbeau marque ${mention(target.id)} pour le prochain vote.`,
      ephemeral: true
    });
  }

  if (type === 'cupid_1' || type === 'cupid_2') {
    if (actor.role !== 'cupid' || game.state !== 'cupid') {
      return interaction.reply({
        content: 'Action non autorisée maintenant.',
        ephemeral: true
      });
    }

    const index = type === 'cupid_1' ? 0 : 1;
    game.cupidChoices[index] = target.id;

    setGame(interaction.guildId, game);

    return interaction.reply({
      content: `💘 Choix ${index + 1} enregistré : ${mention(target.id)}.`,
      ephemeral: true
    });
  }

  if (type === 'witch_save') {
    if (actor.role !== 'witch' || game.state !== 'night_resolve' || game.witch.healUsed) {
      return interaction.reply({
        content: 'Action non autorisée ou potion déjà utilisée.',
        ephemeral: true
      });
    }

    if (target.id !== game.night.wolfTarget) {
      return interaction.reply({
        content: 'Tu ne peux sauver que la victime des loups.',
        ephemeral: true
      });
    }

    game.night.witchSave = target.id;
    game.witch.healUsed = true;

    setGame(interaction.guildId, game);

    return interaction.reply({
      content: `🧪 Potion de vie utilisée sur ${mention(target.id)}.`,
      ephemeral: true
    });
  }

  if (type === 'witch_kill') {
    if (actor.role !== 'witch' || game.state !== 'night_resolve' || game.witch.killUsed) {
      return interaction.reply({
        content: 'Action non autorisée ou potion déjà utilisée.',
        ephemeral: true
      });
    }

    game.night.witchKill = target.id;
    game.witch.killUsed = true;

    setGame(interaction.guildId, game);

    return interaction.reply({
      content: `🧪 Potion de mort utilisée sur ${mention(target.id)}.`,
      ephemeral: true
    });
  }

  if (type === 'hunter_shoot') {
    if (actor.role !== 'hunter' || game.state !== 'hunter_shot') {
      return interaction.reply({
        content: 'Action non autorisée maintenant.',
        ephemeral: true
      });
    }

    if (game.hunterDeadId && game.hunterDeadId !== actor.id) {
      return interaction.reply({
        content: 'Seul le Chasseur mort peut tirer.',
        ephemeral: true
      });
    }

    if (target.id === actor.id) {
      return interaction.reply({
        content: 'Tu ne peux pas te viser toi-même.',
        ephemeral: true
      });
    }

    targetPlayer.alive = false;
    clearTimer(interaction.guildId);

    const loverDeaths = killLoverIfNeeded(game, target.id);

    setGame(interaction.guildId, game);

    await interaction.reply(
      `${mention(actor.id)} tire sur ${mention(target.id)}. Son rôle était **${roleName(targetPlayer.role)}**.` +
      `${loverDeaths.length ? `\n💘 Par amour, ${loverDeaths.map(mention).join(', ')} meurt aussi.` : ''}`
    );

    if (await checkWin(interaction.guild)) return;

    if (game.hunterDeathPhase === 'night') return resolveNightAfterHunter(interaction.guild);
    return afterDay(interaction.guild);
  }

  return interaction.reply({
    content: 'Action inconnue.',
    ephemeral: true
  });
}

async function skipPhase(interaction, client) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: 'Seuls les modérateurs peuvent passer une phase.',
      ephemeral: true
    });
  }

  const game = getGame(interaction.guildId);

  if (!game) {
    return interaction.reply({
      content: 'Aucune partie en cours.',
      ephemeral: true
    });
  }

  clearTimer(interaction.guildId);

  await interaction.reply('⏭️ Phase passée manuellement.');

  if (game.state === 'lobby') return beginGame(interaction.guild, null, client);

  if (
    [
      'cupid',
      'night_guard',
      'night_wolves',
      'night_seer',
      'night_raven',
      'night_witch',
      'night_resolve'
    ].includes(game.state)
  ) {
    return nextNightPhase(interaction.guild);
  }

  if (game.state === 'day') return startDayVote(interaction.guild);
  if (game.state === 'day_vote') return resolveDayVote(interaction.guild);

  if (game.state === 'hunter_shot') {
    if (game.hunterDeathPhase === 'night') return resolveNightAfterHunter(interaction.guild);
    return afterDay(interaction.guild);
  }

  return interaction.followUp({
    content: 'Impossible de skip cette phase.',
    ephemeral: true
  });
}

async function statusCommand(interaction) {
  const game = getGame(interaction.guildId);

  if (!game) {
    return interaction.reply('Aucune partie en cours.');
  }

  return interaction.reply({
    embeds: [statusEmbed(game)]
  });
}

async function stopCommand(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: 'Seuls les modérateurs peuvent arrêter ou supprimer la partie.',
      ephemeral: true
    });
  }

  const game = getGame(interaction.guildId);

  if (game) {
    await deleteWolfChannel(interaction.guild, game);
  }

  clearTimer(interaction.guildId);
  setGame(interaction.guildId, null);

  return interaction.reply('❌ Partie arrêtée / supprimée.');
}