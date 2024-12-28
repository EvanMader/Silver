import { Client, Events, Guild, GuildMemberRoleManager } from 'discord.js';
import { Game } from './Game';
import { Player } from './Player';

const matchmakingQueue: Player[] = [];
export const gameList: Game[] = [];

export function handleCommands(client: Client) {
	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.inGuild()) return;
		const guild: Guild = interaction.guild!;

		if (interaction.isButton()) {
			const role = guild.roles.cache.get(interaction.customId);
			if (!role) return;
			const roleManager: GuildMemberRoleManager = interaction.member
				.roles as GuildMemberRoleManager;
			const hasRole = roleManager.cache.has(role.id);

			if (hasRole) {
				await roleManager.remove(role);
				await interaction.reply({
					content: `The pack ${role} has been deactivated.`,
					ephemeral: true,
				});
			} else {
				await roleManager.add(role);
				await interaction.reply({
					content: `The pack ${role} has been activated.`,
					ephemeral: true,
				});
			}
			return;
		}

		if (interaction.isChatInputCommand()) {
			const player: Player = await Player.create(
				interaction.user,
				interaction.guild!
			);

			if (interaction.channelId === '1320464242654314557') {
				if (interaction.commandName === 'queue') {
					if (matchmakingQueue.some((p) => player.user === p.user)) {
						await interaction.reply(
							'You are already in the queue. Cannot join queue.'
						);
						return;
					}
					if (
						gameList.find(
							(g) =>
								g.player1.user.equals(player.user) ||
								g.player2.user.equals(player.user)
						) !== undefined
					) {
						await interaction.reply(
							'You are already in a game. Cannot join queue.'
						);
						return;
					}

					if (player.packs.length < 2) {
						await interaction.reply(
							'You must have at least two packs activated. Cannot join queue.'
						);
						return;
					}

					matchmakingQueue.push(player);
					await interaction.reply(
						`Added ${interaction.user.displayName} to the queue.`
					);
					if (matchmakingQueue.length >= 2) {
						const game: Game = await Game.create(
							matchmakingQueue.shift()!,
							matchmakingQueue.shift()!,
							client,
							guild
						);
						gameList.push(game);
					}
				}

				if (interaction.commandName === 'leave') {
					if (!matchmakingQueue.some((p) => player.user === p.user)) {
						await interaction.reply(
							"You aren't in the queue. Cannot leave queue."
						);
						return;
					}

					matchmakingQueue.splice(
						matchmakingQueue.findIndex(
							(current) => current.user === player.user
						),
						1
					);
					await interaction.reply(
						`Removed ${interaction.user.displayName} from the queue.`
					);
				}
			}
		}
	});
}
