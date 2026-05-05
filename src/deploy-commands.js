import 'dotenv/config';
import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('teams')
    .setDescription('Créer des équipes aléatoires')
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Afficher le panel de participation')
    )
    .addSubcommand(sub =>
      sub.setName('generate')
        .setDescription('Générer les équipes')
        .addIntegerOption(option =>
          option.setName('equipes')
            .setDescription('Nombre d’équipes entre 2 et 5')
            .setMinValue(2)
            .setMaxValue(5)
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('joueurs_par_equipe')
            .setDescription('Nombre de joueurs par équipe')
            .setMinValue(1)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('lg')
    .setDescription('Système de jeu Loup-Garou')
    .addSubcommand(sub =>
      sub.setName('config')
        .setDescription('Configure la partie Loup-Garou')
        .addIntegerOption(option =>
          option.setName('min')
            .setDescription('Nombre minimum de joueurs')
            .setMinValue(4)
            .setMaxValue(30)
        )
        .addIntegerOption(option =>
          option.setName('max')
            .setDescription('Nombre maximum de joueurs')
            .setMinValue(4)
            .setMaxValue(30)
        )
        .addIntegerOption(option =>
          option.setName('loups')
            .setDescription('Nombre de loups-garous')
            .setMinValue(1)
            .setMaxValue(8)
        )
        .addBooleanOption(option =>
          option.setName('voyante')
            .setDescription('Activer la Voyante')
        )
        .addBooleanOption(option =>
          option.setName('sorciere')
            .setDescription('Activer la Sorcière')
        )
        .addBooleanOption(option =>
          option.setName('chasseur')
            .setDescription('Activer le Chasseur')
        )
        .addBooleanOption(option =>
          option.setName('salvateur')
            .setDescription('Activer le Salvateur')
        )
        .addBooleanOption(option =>
          option.setName('ancien')
            .setDescription('Activer l’Ancien')
        )
        .addBooleanOption(option =>
          option.setName('corbeau')
            .setDescription('Activer le Corbeau')
        )
        .addBooleanOption(option =>
          option.setName('cupidon')
            .setDescription('Activer Cupidon')
        )
        .addIntegerOption(option =>
          option.setName('lobby_sec')
            .setDescription('Durée du lobby en secondes')
            .setMinValue(20)
            .setMaxValue(600)
        )
        .addIntegerOption(option =>
          option.setName('nuit_sec')
            .setDescription('Durée de chaque phase de nuit')
            .setMinValue(20)
            .setMaxValue(300)
        )
        .addIntegerOption(option =>
          option.setName('jour_sec')
            .setDescription('Durée du débat de jour')
            .setMinValue(30)
            .setMaxValue(900)
        )
        .addIntegerOption(option =>
          option.setName('vote_sec')
            .setDescription('Durée du vote de jour')
            .setMinValue(20)
            .setMaxValue(300)
        )
        .addIntegerOption(option =>
          option.setName('chasseur_sec')
            .setDescription('Temps donné au Chasseur pour tirer')
            .setMinValue(10)
            .setMaxValue(120)
        )
    )
    .addSubcommand(sub =>
      sub.setName('voir-config')
        .setDescription('Affiche la configuration actuelle')
    )
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Lance un lobby Loup-Garou')
    )
    .addSubcommand(sub =>
      sub.setName('join')
        .setDescription('Rejoindre le lobby')
    )
    .addSubcommand(sub =>
      sub.setName('leave')
        .setDescription('Quitter le lobby')
    )
    .addSubcommand(sub =>
      sub.setName('begin')
        .setDescription('Démarrer maintenant la partie')
    )
    .addSubcommand(sub =>
      sub.setName('skip')
        .setDescription('Passer la phase actuelle')
    )
    .addSubcommand(sub =>
      sub.setName('vote')
        .setDescription('Voter contre un joueur pendant le vote du village')
        .addUserOption(option =>
          option.setName('joueur')
            .setDescription('Joueur ciblé')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('action')
        .setDescription('Action spéciale de nuit ou du Chasseur')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type d’action')
            .setRequired(true)
            .addChoices(
              { name: 'Voyante: espionner', value: 'seer' },
              { name: 'Loups: attaquer', value: 'wolf' },
              { name: 'Sorcière: sauver', value: 'witch_save' },
              { name: 'Sorcière: empoisonner', value: 'witch_kill' },
              { name: 'Chasseur: tirer', value: 'hunter_shoot' },
              { name: 'Salvateur: protéger', value: 'guard' },
              { name: 'Corbeau: marquer', value: 'raven' },
              { name: 'Cupidon: amoureux 1', value: 'cupid_1' },
              { name: 'Cupidon: amoureux 2', value: 'cupid_2' }
            )
        )
        .addUserOption(option =>
          option.setName('joueur')
            .setDescription('Joueur ciblé')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Affiche l’état de la partie')
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Arrête la partie en cours')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .toJSON()
];

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('Remplis DISCORD_TOKEN, CLIENT_ID et GUILD_ID dans .env ou Railway Variables.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
);

console.log('Commandes DYNASTY-GAMES installées : /teams et /lg.');