import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

import {
  handleLGCommand,
  handleLGButtons
} from './games/werewolfGame.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* ========================
   🎨 STYLE GLOBAL
======================== */

export const COLORS = {
  main: 0x8B5CF6,
  success: 0x22C55E,
  error: 0xEF4444,
  warning: 0xF59E0B
};

export function embed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'DYNASTY-GAMES' })
    .setTimestamp();
}

/* ========================
   🔐 ADMIN CHECK
======================== */

export function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/* ========================
   🚀 READY
======================== */

client.once('ready', () => {
  console.log(`🔥 Bot connecté en tant que ${client.user.tag}`);
});

/* ========================
   🎮 INTERACTIONS
======================== */

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'lg') {
        return await handleLGCommand(interaction, client);
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('lg_')) {
        return await handleLGButtons(interaction, client);
      }

      return;
    }
  } catch (err) {
    console.error('Erreur interactionCreate:', err);

    const msg = {
      content: '❌ Erreur interne du bot. Regarde les logs Railway.',
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

/* ========================
   ⚠️ ERREURS
======================== */

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

/* ========================
   🔑 LOGIN
======================== */

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);