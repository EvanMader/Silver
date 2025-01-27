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
import { Deck, Tier } from './Deck';

export class Lobby extends Game {
	host: Player;
	lobbyMessages: Message[];
	numberOfPetsDraft: number;
	numberOfFoodsDraft: number;
	timerPerGroup: number;
	timerBase: number;
	timeToLook: number;
	randomizeTiers: boolean;
	allowTalking: boolean;

	public constructor(
		players: Player[],
		client: Client,
		guild: Guild,
		channel: TextChannel
	) {
		super(players, client, guild, channel);
		this.host = players[0];
		this.lobbyMessages = [];
		this.numberOfPetsDraft = 4;
		this.numberOfFoodsDraft = 2;
		this.timerPerGroup = 5000;
		this.timerBase = 5000;
		this.timeToLook = 10000;
		this.randomizeTiers = true;
		this.allowTalking = false;
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
		current.lobbyOptions();
		await current.waitStart();
		current.startGame();
		return current;
	}

	private async startGame() {
		try {
			for (const message of this.lobbyMessages) {
				message.delete().catch(() => null);
			}
			this.endGame().catch(() => null);
			if (!this.allowTalking) this.removePlayersWrite();

			const packs = this.players.reduce((common, player) => {
				return common.filter((num) => player.packs.includes(num));
			}, this.players[0].packs);

			this.deck = new Deck(true, packs);
			this.packs = packs;

			for (let i = 0; i < 6; i++) {
				for (let j = 0; j < 10 - this.numberOfPetsDraft; j++) {
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

				for (let j = 0; j < 3 - this.numberOfFoodsDraft; j++) {
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
			}
			await this.channel.send({
				content: `__**Randomly Selected ${
					10 - this.numberOfPetsDraft
				} Pets and ${
					3 - this.numberOfFoodsDraft
				} Food Per Tier**__ \nDraft begins in ${
					this.timeToLook / 1000
				} seconds`,
				files: [
					{
						attachment: await this.getTeam(
							this.players[0].deck.tiers
						),
					},
				],
			});

			let order: number[] = [0, 1, 2, 3, 4, 5];
			if (this.randomizeTiers) {
				for (let i = order.length - 1; i > 0; i--) {
					const randomIndex = Math.floor(Math.random() * (i + 1));
					[order[i], order[randomIndex]] = [
						order[randomIndex],
						order[i],
					];
				}
			}

			this.players = this.players
				.map((player) => ({ player, sort: Math.random() }))
				.sort((a, b) => a.sort - b.sort)
				.map(({ player }) => player);

			this.constructGroups();

			await new Promise((resolve) =>
				setTimeout(resolve, this.timeToLook)
			);

			for (let i = 0; i < 6; i++) {
				let selected: number[] = [];
				let timer: number =
					this.timerPerGroup * (this.players.length + 2) +
					this.timerBase;
				await this.channel.send(`__# TIER ${order[i] + 1}__`);

				for (let j = 0; j < this.players.length; j++) {
					await this.selectGroup(
						this.players[this.getTurn()],
						order[i],
						timer,
						true,
						selected
					);
					this.turn++;
					timer -= this.timerPerGroup;
				}

				this.players = this.players.reverse();
				if (i % 2 == 1) this.players.unshift(this.players.pop()!);
			}

			for (const player of this.players) {
				await this.channel.send({
					content: `<@${player.user.id}> Pack Code:`,
					files: [
						{
							attachment: await this.getTeam(player.deck.tiers),
						},
					],
				});
				await this.channel.send(`${player.deck.getCode()}`);
			}

			if (!this.allowTalking) this.addPlayersWrite();
			await this.endGame();
		} catch (e) {
			return;
		}
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
					attachment: await this.getGroups(
						this.deck.groups[tier],
						selected
					),
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
					.filter(
						(option) => !selected.includes(Number(option.value))
					)
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
			teamButton
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
					try {
						if (
							interaction.isButton() &&
							interaction.customId === 'team_button'
						) {
							await interaction.deferReply({ ephemeral: true });
							const teamResponse = await this.sendTeam(player);
							await interaction.editReply(teamResponse);
							return;
						}

						if (interaction.user.id !== player.user.id) {
							await interaction.reply({
								content: 'This is not your selection menu!',
								ephemeral: true,
							});
							return;
						}

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
								collector.stop('Success');
							}
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
					if (pick)
						await this.pickOption(
							player,
							tier,
							parseInt(selectedValue!),
							selected
						);
					else
						await this.banOption(
							tier,
							parseInt(selectedValue!),
							selected
						);
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

	private async lobbyOptions() {
		const createDropdown = (
			customId: string,
			placeholder: string,
			options: { label: string; value: string }[]
		) => {
			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId(customId)
				.setPlaceholder(placeholder)
				.addOptions(options);

			return selectMenu;
		};

		const numberOfPetsDraftOptions = Array.from({ length: 11 }, (_, i) => ({
			label: `${i}`,
			value: `${i}`,
		}));

		const numberOfPetsDraftDropdown = createDropdown(
			'number_of_draft',
			`Number of pets to draft: ${this.numberOfPetsDraft}`,
			numberOfPetsDraftOptions
		);

		const numberOfFoodsDraftOptions = Array.from({ length: 4 }, (_, i) => ({
			label: `${i}`,
			value: `${i}`,
		}));

		const numberOfFoodsDraftDropdown = createDropdown(
			'number_of_food',
			`Number of food to draft: ${this.numberOfFoodsDraft}`,
			numberOfFoodsDraftOptions
		);

		const timerPerGroupOptions = Array.from({ length: 5 }, (_, i) => ({
			label: `${i * 5}`,
			value: `${i * 5}`,
		}));

		const timerPerGroupDropdown = createDropdown(
			'timer_per_group',
			`Timer increment per group (seconds): ${this.timerPerGroup / 1000}`,
			timerPerGroupOptions
		);

		const timerBaseOptions = Array.from({ length: 19 }, (_, i) => ({
			label: `${i * 5}`,
			value: `${i * 5}`,
		}));

		const timerBaseDropdown = createDropdown(
			'timer_base',
			`Base timer length (seconds): ${this.timerBase / 1000}`,
			timerBaseOptions
		);

		const timeToLookOptions = Array.from({ length: 13 }, (_, i) => ({
			label: `${i * 10}`,
			value: `${i * 10}`,
		}));

		const timeToLookDropdown = createDropdown(
			'time_to_look',
			`Time to look before draft (seconds): ${this.timeToLook / 1000}`,
			timeToLookOptions
		);

		const randomizeTiersOptions = [
			{ label: 'True', value: 'true' },
			{ label: 'False', value: 'false' },
		];

		const randomizeTiersDropdown = createDropdown(
			'randomize_tiers',
			`Randomize tiers: ${this.randomizeTiers}`,
			randomizeTiersOptions
		);

		const allowTalkingOptions = [
			{ label: 'True', value: 'true' },
			{ label: 'False', value: 'false' },
		];

		const allowTalkingDropdown = createDropdown(
			'allow_talking',
			`Allow talking: ${this.allowTalking}`,
			allowTalkingOptions
		);

		let numberOfPetsDraftRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				numberOfPetsDraftDropdown
			);
		let numberOfFoodsDraftRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				numberOfFoodsDraftDropdown
			);
		let timerPerGroupRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				timerPerGroupDropdown
			);
		let timerBaseRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				timerBaseDropdown
			);
		let timeToLookRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				timeToLookDropdown
			);
		let randomizeTiersRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				randomizeTiersDropdown
			);
		let allowTalkingRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				allowTalkingDropdown
			);

		const settingsMessage1 = await this.channel.send({
			components: [
				numberOfPetsDraftRow,
				numberOfFoodsDraftRow,
				timerPerGroupRow,
				timerBaseRow,
				timeToLookRow,
			],
		});
		const settingsMessage2 = await this.channel.send({
			components: [randomizeTiersRow, allowTalkingRow],
		});
		this.lobbyMessages.push(settingsMessage1);
		this.lobbyMessages.push(settingsMessage2);

		const collector1 = settingsMessage1.createMessageComponentCollector();
		const collector2 = settingsMessage2.createMessageComponentCollector();

		collector1.on(
			'collect',
			async (interaction: MessageComponentInteraction) => {
				if (!interaction.isStringSelectMenu()) return;
				if (interaction.user != this.host.user) {
					interaction.reply({
						content:
							"You don't have permission to change the game settings.",
						ephemeral: true,
					});
					return;
				}
				await interaction.deferUpdate();

				switch (interaction.customId) {
					case 'number_of_draft':
						this.numberOfPetsDraft = parseInt(
							interaction.values[0],
							10
						);
						numberOfPetsDraftRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'number_of_draft',
									`Number of pets to Draft: ${this.numberOfPetsDraft}`,
									numberOfPetsDraftOptions
								)
							);
						break;

					case 'number_of_food':
						this.numberOfFoodsDraft = parseInt(
							interaction.values[0],
							10
						);
						numberOfFoodsDraftRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'number_of_food',
									`Number of food to draft: ${this.numberOfFoodsDraft}`,
									numberOfFoodsDraftOptions
								)
							);
						break;

					case 'timer_per_group':
						this.timerPerGroup =
							parseInt(interaction.values[0], 10) * 1000;
						timerPerGroupRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'timer_per_group',
									`Timer increment per group (seconds): ${
										this.timerPerGroup / 1000
									}`,
									timerPerGroupOptions
								)
							);
						break;

					case 'timer_base':
						this.timerBase =
							parseInt(interaction.values[0], 10) * 1000;
						timerBaseRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'timer_base',
									`Base timer length (seconds): ${
										this.timerBase / 1000
									}`,
									timerBaseOptions
								)
							);
						break;

					case 'time_to_look':
						this.timeToLook =
							parseInt(interaction.values[0], 10) * 1000;
						timeToLookRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'time_to_look',
									`Time to look before draft (seconds): ${
										this.timeToLook / 1000
									}`,
									timeToLookOptions
								)
							);
						break;
				}

				const updatedRows = [
					numberOfPetsDraftRow,
					numberOfFoodsDraftRow,
					timerPerGroupRow,
					timerBaseRow,
					timeToLookRow,
				];
				await interaction.message
					.edit({
						components: updatedRows,
					})
					.catch(() => null);
			}
		);

		collector2.on(
			'collect',
			async (interaction: MessageComponentInteraction) => {
				if (!interaction.isStringSelectMenu()) return;
				if (interaction.user != this.host.user) {
					interaction.reply({
						content:
							"You don't have permission to change the game settings.",
						ephemeral: true,
					});
					return;
				}
				await interaction.deferUpdate();

				switch (interaction.customId) {
					case 'randomize_tiers':
						this.randomizeTiers = interaction.values[0] === 'true';
						randomizeTiersRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'randomize_tiers',
									`Randomize tiers: ${this.randomizeTiers}`,
									randomizeTiersOptions
								)
							);
						break;

					case 'allow_talking':
						this.allowTalking = interaction.values[0] === 'true';
						allowTalkingRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'allow_talking',
									`Allow talking: ${this.allowTalking}`,
									allowTalkingOptions
								)
							);
						break;
				}

				const updatedRows = [randomizeTiersRow, allowTalkingRow];
				await interaction.message
					.edit({
						components: updatedRows,
					})
					.catch(() => null);
			}
		);
	}

	private constructGroups() {
		for (let i = 0; i < 6; i++) {
			const tierGroups: Tier[] = [];

			const validPets = this.deck.tiers[i].pets.filter(
				(pet) =>
					pet.name !== 'Snail' &&
					pet.name !== 'Penguin' &&
					pet.name !== 'Werewolf'
			);

			for (let j = 0; j < this.players.length + 2; j++) {
				const shuffledPets = [...validPets].sort(
					() => Math.random() - 0.5
				);
				const shuffledFoods = [...this.deck.tiers[i].foods].sort(
					() => Math.random() - 0.5
				);

				const selectedPets = shuffledPets.slice(0, this.numberOfPetsDraft);
				const selectedFoods = shuffledFoods.slice(0, this.numberOfFoodsDraft);

				tierGroups.push({ pets: selectedPets, foods: selectedFoods });
			}

			this.deck.groups.push(tierGroups);
		}
	}

	async waitStart() {
		await new Promise((resolve) =>
				setTimeout(resolve, 3000)
			);

		const startGameButton = new ButtonBuilder()
			.setCustomId('start_game_button')
			.setLabel('Start Game')
			.setStyle(ButtonStyle.Success);

		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			startGameButton
		);

		let startMessage = await this.channel.send({
			components: [buttonRow],
		});

		await new Promise<void>((resolve) => {
			const collector = startMessage.createMessageComponentCollector();

			collector.on(
				'collect',
				async (interaction: MessageComponentInteraction) => {
					if (interaction.user.id == this.host.user.id) {
						collector.stop();
					} else {
						interaction.reply({
							content:
								"You don't have permission to access this button.",
							ephemeral: true,
						});
					}
				}
			);

			collector.on('end', async () => {
				await startMessage.delete().catch(() => null);
				resolve();
			});
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

		const joinLeaveMessage: Message = await this.channel.send({
			components: [buttonRow],
		});

		this.lobbyMessages.push(joinLeaveMessage);

		await new Promise<void>((resolve, reject) => {
			const collector =
				joinLeaveMessage?.createMessageComponentCollector();

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

						this.players.push(
							await Player.create(interaction.user, this.guild)
						);
						await this.channel.permissionOverwrites.edit(
							interaction.user.id,
							{
								SendMessages: true,
								AddReactions: true,
							}
						);
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
							this.deleteGame();
							return;
						}

						this.players.splice(playerIndex, 1);
						await this.channel.permissionOverwrites.edit(
							interaction.user.id,
							{
								SendMessages: false,
								AddReactions: false,
							}
						);
						await interaction.reply({
							content: `${interaction.user.displayName} has left the lobby.`,
						});
					}
				}
			);
		});
	}
}
