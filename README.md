# Silver

A Discord bot for Super Auto Pets drafting lobbies, including pack selection, bans, bidding, and team images.

## Setup

Use Node.js 22.12 or newer. Run commands from the repository root so the bot can load `data/`.

```powershell
npm ci
Copy-Item .env.example .env
```

Set `TOKEN` in your local `.env` to your Discord bot token, then configure the server-specific channel, category, and role IDs in `src/HandleCommands.ts`, `src/Lobby.ts`, `src/Game.ts`, and `src/Roles.ts`. These IDs are identifiers, not credentials. `src/Player.ts` also matches pack roles by name.

The client requests the Guilds, Guild Members, and Message Content intents. Enable the privileged intents in your Discord application's bot settings. Grant the bot the channel, message, attachment, and role permissions it needs, and place its role above the self-service pack roles. Avoid granting Administrator.

```powershell
npm run build
npm test
npm start
```

For development, use `npm run dev`. On startup, the bot registers the global `/create` command and removes other global commands belonging to the same application. Use a dedicated Discord application for this bot.

## Secrets and publication

Keep tokens in `.env` or deployment environment variables. `.env` files and logs are ignored; `.env.example` contains only a placeholder. Never upload a copy of `.git`, a recovery bundle, or your local environment file.

If a token has ever been committed, reset it in the Discord Developer Portal and update your local environment. Removing the file from Git history does not revoke the token. See [GitHub's sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Before making a copy public, check the complete branch and tag history for secrets, review commit author email addresses, and run `npm audit`. Verify the provenance and redistribution permissions for the bundled artwork and data before publishing them.

## License and assets

The package metadata declares ISC, but this repository does not yet include a license file. Confirm the intended code license and add its text before inviting reuse. The source and license information for `data/sprites/` and the game data have not been documented here; their redistribution rights must be established separately.
