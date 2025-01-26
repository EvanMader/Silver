import { Client, Events, Guild, GuildMemberRoleManager } from 'discord.js';
import { Game } from './Game';
import { Player } from './Player';
import { GameStandard } from './GameStandard';
import { Lobby } from './Lobby';

interface Challenge {
	challenger: Player;
	challenged: Player;
	type: string;
	timeoutId: NodeJS.Timeout;
}

export const matchmakingQueue: Player[] = [];
export const gameList: Game[] = [];
export const challenges: Challenge[] = [];

export function handleCommands(client: Client) {
	client.on(Events.InteractionCreate, async (interaction) => {
		try {
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
				if (interaction.channelId === '1320464242654314557') {

					const player: Player = await Player.create(
						interaction.user,
						interaction.guild!
					);

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
									g.players.some(p => p.user.id === player.user.id)
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
							const game: GameStandard = await GameStandard.create(
								[matchmakingQueue.shift()!, matchmakingQueue.shift()!],
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

					if (interaction.commandName == 'challenge') {
						const challenged: Player = await Player.create(
							interaction.options.getUser('user', true),
							interaction.guild!
						);
						const gameType = interaction.options.getString('type', true);

						if (player.user.id === challenged.user.id) {
							await interaction.reply("You can't challenge yourself.");
							return;
						}

						const isPlayerInGame = gameList.some(
							(game) => game.players.some((p) => p.user.id === player.user.id || p.user.id === challenged.user.id)
						);

						if (isPlayerInGame) {
							await interaction.reply("Either you or the challenged player is already in a game.");
							return;
						}

						const existingChallenge = challenges.find(
								(c) => (c.challenger.user.id === player.user.id && c.challenged.user.id === challenged.user.id)
							);
						if (existingChallenge) {
							await interaction.reply("You already have an open challenge to that player.");
							return;
						}

						const timeoutId = setTimeout(() => {
							const index = challenges.findIndex( (c) => c.challenger.user.id === player.user.id && c.challenged.user.id === challenged.user.id);

							if (index !== -1) {
								challenges.splice(index, 1);
								interaction.followUp(`<@${player.user.id}> your challenge to ${challenged.user.displayName} has expired.`);
							}
						}, 5 * 60 * 1000);

						challenges.push({
							challenger: player,
							challenged: challenged,
							type: gameType,
							timeoutId: timeoutId
						})

						interaction.reply(`You challenged <@${challenged.user.id}> to a ${gameType} game.`);
					}

					if (interaction.commandName == 'retract') {
						const challenged: Player = await Player.create(
							interaction.options.getUser('user', true),
							interaction.guild!
						);

						const existingChallenge = challenges.find(
								(c) => (c.challenger.user.id === player.user.id && c.challenged.user.id === challenged.user.id)
							);

						if (!existingChallenge) {
							interaction.reply("You don't have an open challenge to that player.");
							return;
						}

						const index = challenges.findIndex( (c) => c.challenger.user.id === player.user.id && c.challenged.user.id === challenged.user.id);
						challenges.splice(index, 1);

						interaction.reply(`You retracted your challenge to ${challenged.user.displayName}.`);
					}

					if (interaction.commandName == 'accept') {
						const challenger: Player = await Player.create(
							interaction.options.getUser('user', true),
							interaction.guild!
						);

						const existingChallenge = challenges.find(
								(c) => (c.challenger.user.id === challenger.user.id && c.challenged.user.id === player.user.id)
							);

						if (!existingChallenge) {
							interaction.reply("You don't have an open challenge from that player.");
							return;
						}

						const isPlayerInGame = gameList.some(
							(game) => game.players.some((p) => p.user.id === player.user.id || p.user.id === challenger.user.id)
						);

						if (isPlayerInGame) {
							await interaction.reply("Either you or the challenged player is already in a game.");
							return;
						}

						const index = challenges.findIndex( (c) => c.challenger.user.id === challenger.user.id && c.challenged.user.id === player.user.id);
						const chall: Challenge = challenges.splice(index, 1)[0];


						if (chall.type === 'standard') {
							const game: GameStandard = await GameStandard.create([challenger, player], client, guild);
							gameList.push(game);
						}

						interaction.reply(`You accepted the challenge from ${challenger.user.displayName}.`);
					}

					if (interaction.commandName == 'decline') {
						const challenger: Player = await Player.create(
							interaction.options.getUser('user', true),
							interaction.guild!
						);

						const existingChallenge = challenges.find(
								(c) => (c.challenger.user.id === challenger.user.id && c.challenged.user.id === player.user.id)
							);

						if (!existingChallenge) {
							interaction.reply("You don't have an open challenge from that player.");
							return;
						}

						const index = challenges.findIndex( (c) => c.challenger.user.id === challenger.user.id && c.challenged.user.id === player.user.id);
						challenges.splice(index, 1);

						interaction.reply(`You declined the challenge from ${challenger.user.displayName}.`);
					}

					if (interaction.commandName == 'create') {
						await interaction.reply(
							`${interaction.user.displayName} created a lobby.`
						);
						const game: Lobby = await Lobby.create(
							player,
							client,
							guild
						);

						gameList.push(game);
					}
				}
			}
		} catch (e) { return; }
	});
}
