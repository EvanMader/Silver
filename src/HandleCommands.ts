import { Client, Events, User } from "discord.js";
import { Game } from "./Game";

const matchmakingQueue: User[] = [];
const gameList: Game[] = [];

export function handleCommands(client: Client) {
	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) return;
        if (!interaction.inGuild()) return;

        if (interaction.channelId === "1320464242654314557") {
            if (interaction.commandName === "queue") {
                if (matchmakingQueue.includes(interaction.user)) {
                    await interaction.reply("You are already in the queue. Cannot join queue.");
                    return;
                }
                if (gameList.find((g) => g.player1.user.equals(interaction.user) || g.player2.user.equals(interaction.user)) !== undefined) {
                    await interaction.reply("You are already in a game. Cannot join queue.");
                    return;
                }

                matchmakingQueue.push(interaction.user);
                await interaction.reply(`Added ${interaction.user.displayName} to the queue.`);
                if (matchmakingQueue.length >= 2) {
                    const game: Game = new Game(matchmakingQueue.shift()!, matchmakingQueue.shift()!, client, interaction.guild!);
                    gameList.push(game);
                    game.initialize();
                }
            }

            if (interaction.commandName === "leave") {
                if (!matchmakingQueue.includes(interaction.user)) {
                    await interaction.reply("You aren't in the queue. Cannot leave queue.");
                    return;
                }

                matchmakingQueue.splice(matchmakingQueue.findIndex((user) => user == interaction.user), 1);
                await interaction.reply(`Removed ${interaction.user.displayName} from the queue.`);
            }
        }
	});
}
