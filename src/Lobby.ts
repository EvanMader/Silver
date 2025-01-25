import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	Guild,
	MessageComponentInteraction,
	Message,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
	TextChannel,
} from 'discord.js';
import { Game } from './Game';
import { Player } from './Player';
import { gameList } from './HandleCommands';
import { Deck, Tier } from './Deck';

export class Lobby extends Game {
	host: Player;
    joinLeaveMessage: Message | null;

	public constructor(
		players: Player[],
		client: Client,
		guild: Guild,
		channel: TextChannel
	) {
		super(players, client, guild, channel);
		this.host = players[0];
        this.joinLeaveMessage = null;
	}

	public static async create(
		host: Player,
		client: Client,
		guild: Guild
	): Promise<Lobby> {
		const channel = await guild.channels.create({
			parent: '1320478069236039814',
			type: ChannelType.GuildText,
			name: `${host.user.displayName}'s lobby`,
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
				{
					id: host.user.id,
					allow: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
			],
		});

		let players: Player[] = [host];

		const current: Lobby = new Lobby(players, client, guild, channel);
		current.joinLeaveGame();
        await current.waitStart();
		current.startGame();
		return current;
	}

	private async startGame() {
        this.joinLeaveMessage?.delete().catch(() => null);
		this.endGame(gameList);

		const packs = this.players.reduce((common, player) => {
			return common.filter(num => player.packs.includes(num));
		}, this.players[0].packs);

		this.deck = new Deck(true, packs);
		this.packs = packs;

		for (let i = 0; i < 6; i++) {
			for (let j = 0; j < 7; j++) {
				let index = Math.floor(
					Math.random() * this.deck.tiers[i].pets.length
				);
				for (const player of this.players) {
					player.deck.tiers[i].pets.push(
						this.deck.tiers[i].pets[index]
					);
				}
				this.deck.tiers[i].pets.splice(index, 1);
			}

			let index = Math.floor(
				Math.random() * this.deck.tiers[i].foods.length
			);
			if (
				i === 4 &&
				this.deck.tiers[i].foods.findIndex(
					(food) => food.name === 'Chocolate'
				) != -1
			)
				index = this.deck.tiers[i].foods.findIndex(
					(food) => food.name === 'Chocolate'
				);
			for (const player of this.players) {
				player.deck.tiers[i].foods.push(
					this.deck.tiers[i].foods[index]
				);
			}
			this.deck.tiers[i].foods.splice(index, 1);
		}
		await this.channel.send({
			content: '__**Randomly Selected 7 Pets and 1 Food Per Tier**__ \n Draft begins in 10 seconds',
			files: [
				{
					attachment: await this.getTeam(this.players[0].deck.tiers),
				},
			],
		});

		let order: number[] = [0, 1, 2, 3, 4, 5];
		for (let i = order.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[order[i], order[randomIndex]] = [order[randomIndex], order[i]];
		}

        this.players = this.players
            .map((player) => ({ player, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ player }) => player);

		this.constructGroups(this.deck);

		await new Promise(resolve => setTimeout(resolve, 10000));

		for (let i = 0; i < 6; i++) {
			let selected: number[] = [];
			let timer: number = 5000 * (this.players.length + 2) + 5000;
			await this.channel.send(`__# TIER ${order[i] + 1}__`);

			for (let j = 0; j < this.players.length; j++) {
				try {
					await this.selectGroup(
						this.players[this.getTurn()],
						order[i],
						timer,
						true,
						selected
					);
					this.turn++;
					timer -= 5000;
				} catch (e) {
					return;
				}
			}

            this.players = this.players.reverse();
            if (i % 2 == 1) this.players.unshift(this.players.pop()!);
		}

		for (const player of this.players) {
			await this.channel.send(`<@${player.user.id}> Pack Code:`);
			await this.channel.send(`${player.deck.getCode()}`);
		}

		await this.endGame(gameList);
	}

	protected async selectGroup(
		player: Player,
		tier: number,
		timerLength: number,
		pick: boolean,
		selected: number[]
	) {
		let remainingTime = timerLength;
		const countdown = await this.channel.send({
			content: `<@${player.user.id}> Select one tier ${
				tier + 1
			} group to ${pick ? 'pick' : 'ban'}! You have ${Math.floor(
				remainingTime / 1000
			)} seconds remaining.`,
			files: [
				{
					attachment: await this.getGroups(this.deck.groups[tier], selected),
				},
			],
		});

		const updateCountdown = async () => {
			remainingTime -= 5000;

			if (remainingTime >= 0 && interval !== null) {
				try {
					countdown.edit({
						content: `<@${player.user.id}> Select one tier ${
							tier + 1
						} group to **${
							pick ? 'pick' : 'ban'
						}**! You have ${Math.floor(
							remainingTime / 1000
						)} seconds remaining.`,
					});
					interval = setTimeout(updateCountdown, 5000);
				} catch {}
			}
		};

		let interval: NodeJS.Timeout | null = setTimeout(updateCountdown, 5000);

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId('group_select')
			.setPlaceholder('Select a group...')
			.addOptions(
				this.deck.groups[tier]
					.map((group, index) => ({
						label: String.fromCharCode(65 + index),
						value: `${index}`,
					}))
					.filter(option => !selected.includes(Number(option.value)))
			);

		const submitButton = new ButtonBuilder()
			.setCustomId('submit')
			.setLabel('Submit')
			.setStyle(ButtonStyle.Primary);

		const teamButton = new ButtonBuilder()
			.setCustomId('team_button')
			.setLabel('Team')
			.setStyle(ButtonStyle.Success);

		const menuRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				selectMenu
			);
		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			submitButton,
			teamButton,
		);

		const actionMessage = await this.channel.send({
			content: `**${pick ? 'Pick' : 'Ban'}** your group:`,
			components: [menuRow, buttonRow],
		});

		await new Promise<void>((resolve, reject) => {
			let selectedValue: string | null = null;

			const collector = actionMessage.createMessageComponentCollector({
				time: timerLength + 1000,
			});

			collector.on(
				'collect',
				async (interaction: MessageComponentInteraction) => {
					if (interaction.user.id !== player.user.id) {
						await interaction.reply({
							content: 'This is not your selection menu!',
							ephemeral: true,
						});
						return;
					}

					try {
						if (
							interaction.isStringSelectMenu() &&
							interaction.customId === 'group_select'
						) {
							selectedValue = interaction.values[0];
							await interaction
								.deferUpdate()
								.catch((error) => console.log(error));
						} else if (
							interaction.isButton() &&
							interaction.customId === 'submit'
						) {
							if (selectedValue === null) {
								await interaction.reply({
									content:
										'Please select a group before submitting.',
									ephemeral: true,
								});
							} else {
								if (collector.ended) return;
								if (pick)
									await this.pickOption(
										player,
										tier,
										parseInt(selectedValue),
										selected
									);
								else
									await this.banOption(
										player,
										tier,
										parseInt(selectedValue),
										selected
									);
								collector.stop('Success');
							}
						} else if (
							interaction.isButton() &&
							interaction.customId === 'team_button'
						) {
							await this.sendTeam(player);
							await interaction.deferUpdate();
                        }
					} catch (error) {
						console.error('Error handling interaction:', error);
						if (!interaction.replied && !interaction.deferred) {
							await interaction.reply({
								content:
									'An error occurred while processing your interaction.',
								ephemeral: true,
							});
						}
					}
				}
			);

			collector.on('end', async (collected, reason) => {
				clearTimeout(interval!);
				interval = null;
				await actionMessage.delete().catch(() => null);

				if (reason === 'time') {
					if (pick) await this.pickOption(player, tier, -1, selected);
					await this.channel.send('You took too long to respond!');
					resolve();
				} else if (reason === 'Success') {
					resolve();
				} else {
					console.log(
						'Rejected select group for the following reason: ',
						reason
					);
					reject();
				}
			});
		});
	}

	private constructGroups(deck: Deck) {
		for (let i = 0; i < 6; i++) {
			let shuffledPets = [...deck.tiers[i].pets]
				.sort(() => Math.random() - 0.5)
				.filter(
					(pet) => pet.name !== 'Snail' && pet.name !== 'Penguin'
				);

			const tierGroups: Tier[] = [];
			let numGroups: number = Math.floor(shuffledPets.length / 3);

			for (let j = 0; j < numGroups; j++) {
				if (j >= this.players.length + 2) break;
				const shuffledFoods = [...deck.tiers[i].foods].sort(
					() => Math.random() - 0.5
				);
				const selectedPets = shuffledPets.splice(0, 3);
				const selectedFoods = shuffledFoods.splice(0, 2);

				tierGroups.push({ pets: selectedPets, foods: selectedFoods });
			}

			deck.groups.push(tierGroups);
		}
	}

    async waitStart() {
        const startGameButton = new ButtonBuilder()
            .setCustomId('start_game_button')
            .setLabel('Start Game')
            .setStyle(ButtonStyle.Success)

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            startGameButton
        )
        
        let startMessage = await this.channel.send({
            content: `Host click this button to start the game:`,
            components: [buttonRow]
        })


        await new Promise<void>((resolve) => {
            const collector = startMessage.createMessageComponentCollector();

            collector.on(
                'collect',
                async (interaction: MessageComponentInteraction) => {
                    if (interaction.user.id == this.host.user.id) {
                        collector.stop();
                    } else {
                        interaction.reply({
                            content: "You don't have permission to access this button.",
                            ephemeral: true
                        })
                    }
                }
            )

            collector.on(
                'end',
                async () => {
                    await startMessage.delete().catch(() => null);
                    resolve();
                }
            )
        });
    }

    async joinLeaveGame() {
        const joinGameButton = new ButtonBuilder()
            .setCustomId('join_game_button')
            .setLabel('Join Game')
            .setStyle(ButtonStyle.Success);

        const leaveGameButton = new ButtonBuilder()
            .setCustomId('leave_game_button')
            .setLabel('Leave Game')
            .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            joinGameButton,
            leaveGameButton
        );

        this.joinLeaveMessage = await this.channel.send({
            content: `Click the buttons to join or leave the game:`,
            components: [buttonRow],
        });

        await new Promise<void>((resolve, reject) => {
            const collector = this.joinLeaveMessage?.createMessageComponentCollector();

            collector?.on(
                'collect',
                async (interaction: MessageComponentInteraction) => {
                    const userId = interaction.user.id;

                    if (interaction.customId === 'join_game_button') {
                        if (
                            this.players.some(
                                (player) => player.user.id === userId
                            )
                        ) {
                            await interaction.reply({
                                content: 'You are already in the game!',
                                ephemeral: true,
                            });
                            return;
                        }

                        this.players.push(await Player.create(interaction.user, this.guild));
						await this.channel.permissionOverwrites.edit(interaction.user.id, {
							SendMessages: true,
							AddReactions: true,
						});
                        await interaction.reply({
                            content: `${interaction.user.displayName} has joined the lobby.`,
                        });
                    } else if (interaction.customId === 'leave_game_button') {
                        const playerIndex = this.players.findIndex(
                            (player) => player.user.id === userId
                        );

                        if (playerIndex === -1) {
                            await interaction.reply({
                                content: 'You are not in the game!',
                                ephemeral: true,
                            });
                            return;
                        }

                        if (userId === this.host.user.id) {
                            await interaction.deferReply();
                            this.deleteGame(gameList);
                            return;
                        }

                        this.players.splice(playerIndex, 1);
						await this.channel.permissionOverwrites.edit(interaction.user.id, {
							SendMessages: false,
							AddReactions: false,
						});
                        await interaction.reply({
                            content: `${interaction.user.displayName} has left the lobby.`,
                        });
                    }
                }
            );
        });
    }
}