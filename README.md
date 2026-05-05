# Bot Discord Loup-Garou

Bot Loup-Garou textuel pour Discord, pensé pour débutant.

## Fonctions incluses

- Commandes slash `/lg`
- Salon de jeu configurable
- Lobby avec boutons Rejoindre / Quitter / Démarrer
- Paramètres personnalisables :
  - minimum / maximum de joueurs
  - nombre de loups
  - activation Voyante, Sorcière, Chasseur
  - durées lobby, nuit, jour, vote
- Rôles envoyés en MP
- Phases automatiques :
  - nuit des Loups
  - Voyante
  - Sorcière
  - résolution de nuit
  - débat de jour
  - vote du village
- Conditions de victoire
- Sauvegarde locale dans `data/config.json` et `data/games.json`

## Installation débutant

### 1. Installer Node.js

Installe la version LTS de Node.js.

Vérifie dans un terminal :

```bash
node -v
npm -v
```

### 2. Installer le projet

Dans le dossier du bot :

```bash
npm install
```

### 3. Créer ton bot Discord

Va sur le portail développeur Discord :

1. New Application
2. Onglet Bot
3. Add Bot
4. Copie le token
5. Onglet OAuth2 > URL Generator
6. Coche `bot` et `applications.commands`
7. Permissions conseillées :
   - Send Messages
   - Embed Links
   - Use Slash Commands
   - Read Message History
8. Ouvre le lien généré et invite le bot sur ton serveur

### 4. Configurer `.env`

Copie `.env.example` en `.env`.

Remplis :

```env
DISCORD_TOKEN=ton_token
CLIENT_ID=id_de_l_application
GUILD_ID=id_de_ton_serveur
```

Pour obtenir les IDs, active le mode développeur Discord puis clic droit > Copier l’identifiant.

### 5. Installer les commandes slash

```bash
npm run deploy
```

### 6. Lancer le bot

```bash
npm start
```

## Utilisation dans Discord

Configurer le salon :

```text
/lg config salon:#loup-garou min:4 max:16 loups:2 voyante:true sorciere:true chasseur:true
```

Voir la config :

```text
/lg voir-config
```

Lancer le lobby :

```text
/lg start
```

Rejoindre :

```text
/lg join
```

Démarrer manuellement :

```text
/lg begin
```

Voter :

```text
/lg vote joueur:@pseudo
```

Action de nuit :

```text
/lg action type:Loups: attaquer joueur:@pseudo
/lg action type:Voyante: espionner joueur:@pseudo
/lg action type:Sorcière: sauver joueur:@pseudo
/lg action type:Sorcière: empoisonner joueur:@pseudo
/lg action type:Chasseur: tirer joueur:@pseudo
```

Arrêter :

```text
/lg stop
```

## Important

Ce bot est une base complète mais volontairement simple. Pour une version plus avancée, on peut ajouter ensuite :

- interface avec menus déroulants
- panel de configuration plus joli
- salons privés temporaires pour les loups
- Cupidon, Voleur, Petite Fille, Salvateur, Ancien
- système de maître du jeu
- historique des parties
- classement / statistiques
- base SQLite
- hébergement permanent sur VPS