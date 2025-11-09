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
	Interaction,
} from 'discord.js';
import { Game } from './Game';
import { Player } from './Player';
import { Deck, Tier, Pet } from './Deck';

enum DraftType {
	SnakeRotate,
	Snake,
	Rotate,
	RotateCoprime,
	Random,
}

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
	draft: DraftType;
	repeatPets: boolean;
	numberOfBans: number;
	bidding: boolean;

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
		this.timerPerGroup = 7000;
		this.timerBase = 60000;
		this.timeToLook = 15000;
		this.randomizeTiers = true;
		this.allowTalking = false;
		this.draft = DraftType.SnakeRotate;
		this.repeatPets = true;
		this.numberOfBans = 0;
		this.bidding = true;
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
		current.joinLeaveGame().catch(() => null);
		current.lobbyOptions().catch(() => null);
		await current.waitStart().catch(() => null);
		current.startGame().catch(() => null);
		return current;
	}

	private async startGame() {
		try {
			for (const message of this.lobbyMessages) {
				message.delete().catch(() => null);
			}
			this.endGame().catch(() => null);
			if (!this.allowTalking) this.removePlayersWrite().catch(() => null);

			const packs = this.players.reduce((common, player) => {
				return common.filter((num) => player.packs.includes(num));
			}, this.players[0].packs);

			this.deck = new Deck(true, packs);
			this.packs = packs;

			for (let i = 0; i < 6; i++) {
				const tandgrisnerIndex = this.deck.tiers[i].pets.findIndex(
					(p) => p.name === 'Tandgrisner'
			);
				const tandgnostIndex = this.deck.tiers[i].pets.findIndex(
					(p) => p.name === 'Tandgnost'
			);
			
			let tandgrisner = null;
			let tandgnost = null;
			
			if (tandgrisnerIndex !== -1) {
				[tandgrisner] = this.deck.tiers[i].pets.splice(tandgrisnerIndex, 1);
			}
			
			if (tandgnostIndex !== -1) {
				const adjustedIndex = tandgrisnerIndex !== -1 && tandgrisnerIndex < tandgnostIndex ? 
				tandgnostIndex - 1 : tandgnostIndex;
				[tandgnost] = this.deck.tiers[i].pets.splice(adjustedIndex, 1);
			}

			if (tandgrisner && tandgnost) {
				this.deck.tiers[i].pets.push(tandgnost);
			}

			let tandgnostUsed = false;

			for (let j = 0; j < 10 - this.numberOfPetsDraft; j++) {
				let index = Math.floor(Math.random() * this.deck.tiers[i].pets.length);
				let pet = this.deck.tiers[i].pets[index];

				if (pet.name === 'Tandgnost') {
					if (j >= 10 - this.numberOfPetsDraft - 1 && tandgrisner) {
						j--;
						continue;
					}
					tandgnostUsed = true;
					for (const player of this.players) {
						player.deck.tiers[i].pets.push(pet);
						if (tandgrisner) {
							player.deck.tiers[i].pets.push(tandgrisner);
						}
					}
					this.deck.tiers[i].pets.splice(index, 1);
					if (tandgrisner) {
						j++;
					}
					} else {
					for (const player of this.players) {
						player.deck.tiers[i].pets.push(pet);
					}
					this.deck.tiers[i].pets.splice(index, 1);
				}
			}

			if (!tandgnostUsed) {
				if (tandgrisner && !tandgnost) {
					this.deck.tiers[i].pets.push(tandgrisner);
				}
			}

			for (let j = 0; j < 3 - this.numberOfFoodsDraft; j++) {
				let index = Math.floor(Math.random() * this.deck.tiers[i].foods.length);
				
				if (
				i === 4 &&
				this.deck.tiers[i].foods.findIndex((food) => food.name === 'Chocolate') != -1
				) {
				index = this.deck.tiers[i].foods.findIndex(
					(food) => food.name === 'Chocolate'
				);
				}
				
				for (const player of this.players) {
				player.deck.tiers[i].foods.push(this.deck.tiers[i].foods[index]);
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
				} seconds.`,
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

			this.players = this.players.sort(() => Math.random() - 0.5);

			this.constructGroups();

			await new Promise((resolve) =>
				setTimeout(resolve, this.timeToLook)
			);

			for (let i = 0; i < 6; i++) {
				let selected: number[] = [];
				let timer: number =
					this.timerPerGroup * (this.players.length + 2) +
					this.timerBase;
				if (this.bidding) {
					timer += this.timerPerGroup * this.numberOfBans;
				}
				await this.channel.send(`__# TIER ${order[i] + 1}__`);

				if (!this.bidding) {
					for (let j = 0; j < this.numberOfBans; j++) {
						await this.selectGroup(
							this.players[this.getTurn()],
							order[i],
							timer,
							false,
							selected
						).catch(() => null);
						this.turn++;
						timer -= this.timerPerGroup;
					}

					for (let j = 0; j < this.players.length; j++) {
						await this.selectGroup(
							this.players[this.getTurn()],
							order[i],
							timer,
							true,
							selected
						).catch(() => null);
						this.turn++;
						timer -= this.timerPerGroup;
					}
				} else {
					await this.biddingDraft(order[i], timer).catch(() => null);
				}

				switch (this.draft) {
					case DraftType.SnakeRotate:
						this.players = this.players.reverse();
						if (i % 2 == 1)
							this.players.unshift(this.players.pop()!);
						break;

					case DraftType.Snake:
						this.players = this.players.reverse();
						break;

					case DraftType.Rotate:
						this.players.unshift(this.players.pop()!);
						break;

					case DraftType.RotateCoprime:
						const gcd = (a: number, b: number): number =>
							b === 0 ? a : gcd(b, a % b);

						const numPlayers = this.players.length;
						let coprime = 1;
						for (let x = 2; x < numPlayers; x++) {
							if (gcd(x, numPlayers) === 1) {
								coprime = x;
								break;
							}
						}

						this.players = [
							...this.players.slice(-coprime),
							...this.players.slice(0, -coprime),
						];
						break;

					case DraftType.Random:
						for (let i = this.players.length - 1; i > 0; i--) {
							const j = Math.floor(Math.random() * (i + 1));
							[this.players[i], this.players[j]] = [
								this.players[j],
								this.players[i],
							];
						}
						break;

					default:
						break;
				}
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

			if (!this.allowTalking) this.addPlayersWrite().catch(() => null);
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
		try {
			let remainingTime = timerLength;

			const countdown = await this.channel.send({
				content: `<@${player.user.id}> Select one tier ${tier + 1} group to **${pick ? 'pick' : 'ban'}**! You have ${Math.floor(
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

			let interval: NodeJS.Timeout | null = null;

			const updateCountdown = async () => {
				if (remainingTime > 0 && interval !== null) {
					remainingTime -= remainingTime % 5000 === 0 ? 5000 : remainingTime % 5000;
					const nextTimeout = remainingTime >= 5000 ? 5000 : remainingTime;

					await countdown.edit({
						content: `<@${player.user.id}> Select one tier ${tier + 1} group to **${pick ? 'pick' : 'ban'}**! You have ${Math.floor(
							remainingTime / 1000
						)} seconds remaining.`,
					});

					interval = setTimeout(updateCountdown, nextTimeout);
				} else {
					interval = null;
				}
			};

			const firstTimeout = remainingTime % 5000 === 0 ? 5000 : remainingTime % 5000;
			interval = setTimeout(updateCountdown, firstTimeout);

			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('group_select')
				.setPlaceholder('Select a group...')
				.addOptions(
					this.deck.groups[tier]
						.map((group, index) => ({
							label: String.fromCharCode(65 + index),
							value: `${index}`,
						}))
						.filter(o => !selected.includes(Number(o.value)))
				);

			const submitButton = new ButtonBuilder().setCustomId('submit').setLabel('Submit').setStyle(ButtonStyle.Primary);
			const teamButton = new ButtonBuilder().setCustomId('team_button').setLabel('Team').setStyle(ButtonStyle.Success);

			const actionMessage = await this.channel.send({
				content: `**${pick ? 'Pick' : 'Ban'}** ${this.getHammerTime(timerLength + 1000)}:`,
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
					new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton, teamButton),
				],
			});

			await new Promise<void>((resolve, reject) => {
				let selectedValue: string | null = null;

				const collector = actionMessage.createMessageComponentCollector({
					time: timerLength + 1000,
				});

				collector.on('collect', async interaction => {
					try {
						if (interaction.customId === 'team_button') {
							await interaction.deferReply({ ephemeral: true });
							const teamResponse = await this.sendTeam(player);
							await interaction.editReply(teamResponse);
							return;
						}

						if (interaction.user.id !== player.user.id) {
							return interaction.reply({
								content: 'This is not your selection menu!',
								ephemeral: true,
							});
						}

						if (interaction.isStringSelectMenu() && interaction.customId === 'group_select') {
							selectedValue = interaction.values[0];
							return interaction.deferUpdate();
						}

						if (interaction.customId === 'submit') {
							if (!selectedValue) {
								return interaction.reply({
									content: 'Please select a group before submitting.',
									ephemeral: true,
								});
							}
							if (!collector.ended) collector.stop('Success');
						}
					} catch (err) {
						console.error('Interaction error:', err);
					}
				});

				collector.on('end', async (_collected, reason) => {
					clearTimeout(interval!);
					interval = null;
					await actionMessage.delete().catch(() => null);

					if (reason === 'time') {
						if (pick) await this.pickOption(player, tier, -1, selected);
						await this.channel.send('You took too long to respond!');
						return resolve();
					}

					if (reason === 'Success') {
						if (pick) {
							await this.pickOption(player, tier, parseInt(selectedValue!), selected);
						} else {
							await this.banOption(tier, parseInt(selectedValue!), selected);
						}
						return resolve();
					}

					console.log('Selection ended for reason:', reason);
					reject();
				});
			});
		} catch (err) {
			console.error('selectGroup failed:', err);
			await this.channel.send(`<@${player.user.id}> An error occurred. Defaulting selection.`);
			if (pick) await this.pickOption(player, tier, -1, selected);
		}
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

		const timerPerGroupOptions = Array.from({ length: 21 }, (_, i) => ({
			label: `${i}`,
			value: `${i}`,
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

		const timeToLookOptions = Array.from({ length: 25 }, (_, i) => ({
			label: `${i * 5}`,
			value: `${i * 5}`,
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

		const draftTypeOptions = Object.values(DraftType)
			.filter((value) => typeof value === 'string')
			.map((label) => ({
				label,
				value: label,
			}));

		const draftTypeDropdown = createDropdown(
			'draft_type',
			`Draft Type: ${DraftType[this.draft]}`,
			draftTypeOptions
		);

		const repeatPetOptions = [
			{ label: 'True', value: 'true' },
			{ label: 'False', value: 'false' },
		];

		const repeatPetsDropdown = createDropdown(
			'repeat_pets',
			`Repeat Pets: ${this.repeatPets}`,
			repeatPetOptions
		);

		const numberOfBansOptions = Array.from({ length: 6 }, (_, i) => ({
			label: `${i}`,
			value: `${i}`,
		}));

		const numberOfBansDropdown = createDropdown(
			'number_of_bans',
			`Number of bans: ${this.numberOfBans}`,
			numberOfBansOptions
		);

		const biddingOptions = [
			{ label: 'True', value: 'true' },
			{ label: 'False', value: 'false' },
		];

		const biddingDropdown = createDropdown(
			'bidding',
			`Bidding: ${this.bidding}`,
			biddingOptions
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
		let draftTypeRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				draftTypeDropdown
			);
		let repeatPetsRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				repeatPetsDropdown
			);
		let numberOfBansRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				numberOfBansDropdown
			);
		let biddingRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				biddingDropdown
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
			components: [
				randomizeTiersRow,
				allowTalkingRow,
				draftTypeRow,
				repeatPetsRow,
				numberOfBansRow,
			],
		});
		const settingsMessage3 = await this.channel.send({
			components: [biddingRow],
		});
		this.lobbyMessages.push(settingsMessage1);
		this.lobbyMessages.push(settingsMessage2);
		this.lobbyMessages.push(settingsMessage3);

		const collector1 = settingsMessage1.createMessageComponentCollector();
		const collector2 = settingsMessage2.createMessageComponentCollector();
		const collector3 = settingsMessage3.createMessageComponentCollector();

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

					case 'draft_type':
						this.draft =
							interaction.values[0] === 'SnakeRotate'
								? DraftType.SnakeRotate
								: interaction.values[0] === 'Snake'
								? DraftType.Snake
								: interaction.values[0] === 'Rotate'
								? DraftType.Rotate
								: interaction.values[0] === 'RotateCoprime'
								? DraftType.RotateCoprime
								: interaction.values[0] === 'Random'
								? DraftType.Random
								: DraftType.SnakeRotate;

						draftTypeRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'draft_type',
									`Draft Type: ${DraftType[this.draft]}`,
									draftTypeOptions
								)
							);
						break;

					case 'repeat_pets':
						this.repeatPets = interaction.values[0] === 'true';

						repeatPetsRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'repeat_pets',
									`Repeat Pets: ${this.repeatPets}`,
									repeatPetOptions
								)
							);
						break;

					case 'number_of_bans':
						this.numberOfBans = parseInt(interaction.values[0], 10);

						numberOfBansRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'number_of_bans',
									`Number of bans: ${this.numberOfBans}`,
									numberOfBansOptions
								)
							);
						break;
				}

				const updatedRows = [
					randomizeTiersRow,
					allowTalkingRow,
					draftTypeRow,
					repeatPetsRow,
					numberOfBansRow,
				];
				await interaction.message
					.edit({
						components: updatedRows,
					})
					.catch(() => null);
			}
		);

		collector3.on(
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
					case 'bidding':
						this.bidding = interaction.values[0] === 'true';

						biddingRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'bidding',
									`Bidding: ${this.bidding}`,
									biddingOptions
								)
							);
						break;
				}

				const updatedRows = [biddingRow];
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

			let validPets = this.deck.tiers[i].pets;
			let numberOfGroups = this.bidding ? this.players.length + 2 + this.numberOfBans : this.players.length + 2;

			for (let j = 0; j < numberOfGroups; j++) {
				const shuffledPets = [...validPets].sort(
					() => Math.random() - 0.5
				);
				const shuffledFoods = [...this.deck.tiers[i].foods].sort(
					() => Math.random() - 0.5
				);

				const [tandgrisner] = validPets.splice(
					validPets.findIndex((pet) => pet.name === 'Tandgrisner'),
					1
				);
				const selectedPets: Pet[] = [];
				for (const pet of shuffledPets) {
					if (pet.name === 'Tandgnost') {
						if (selectedPets.length == this.numberOfPetsDraft - 1)
							continue;
						selectedPets.push(pet);
						selectedPets.push(tandgrisner);
					} else if (pet.name !== 'Tandgrisner') {
						selectedPets.push(pet);
					}

					if (selectedPets.length >= this.numberOfPetsDraft) {
						break;
					}
				}

				const selectedFoods = shuffledFoods.slice(
					0,
					this.numberOfFoodsDraft
				);
				if (!this.repeatPets) {
					validPets = validPets.filter(
						(pet) =>
							!selectedPets.some(
								(selected) => selected.name === pet.name
							)
					);
				}

				tierGroups.push({ pets: selectedPets, foods: selectedFoods });
			}

			this.deck.groups.push(tierGroups);
		}
	}

	async waitStart() {
		await new Promise((resolve) => setTimeout(resolve, 3000));

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
						if (this.players.length >= 18) {
							await interaction.reply({
								content: 'Lobby is full. 18 Players Max.',
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

	async biddingDraft(tier: number, timer: number) {
		await new Promise<void>(async (resolve) => {
			try {
				let remainingTime = timer;

				const priorityMessage =
					'Priority: ' +
					this.players
						.map((player) => player.user.displayName)
						.join(' => ');

				const countdown = await this.channel.send({
					content:
						`Timer: ${remainingTime / 1000} seconds left.\n` +
						priorityMessage,
					files: [
						{
							attachment: await this.getGroups(
								this.deck.groups[tier],
								[]
							),
						},
					],
				});

				const updateCountdown = async () => {
					if (remainingTime > 0 && interval !== null) {
						remainingTime -=
							remainingTime % 5000 === 0
								? 5000
								: remainingTime % 5000;
						const nextTimeout =
							remainingTime >= 5000 ? 5000 : remainingTime;

						await countdown.edit({
							content:
								`Timer: ${remainingTime / 1000} seconds left.\n` +
								priorityMessage,
						});

						interval = setTimeout(updateCountdown, nextTimeout);
					} else {
						interval = null;
					}
				};

				const firstTimeout =
					remainingTime % 5000 === 0 ? 5000 : remainingTime % 5000;

				let interval: NodeJS.Timeout | null = setTimeout(
					updateCountdown,
					firstTimeout
				);

				const numGroups = this.deck.groups[tier].length;
				const pickRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
				const banRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
				const pickMessages: Message[] = [];
				const banMessages: Message[] = [];

				const selections = new Map<string, Map<string, string>>();
				const submittedUsers = new Set<string>();

				for (let i = 0; i < this.numberOfBans; i++) {
					const banNumber = i + 1;

					const suffix =
						banNumber % 10 === 1 && banNumber % 100 !== 11
							? 'st'
							: banNumber % 10 === 2 && banNumber % 100 !== 12
							? 'nd'
							: banNumber % 10 === 3 && banNumber % 100 !== 13
							? 'rd'
							: 'th';

					const selectMenu = new StringSelectMenuBuilder()
						.setCustomId(`Ban ${banNumber}`)
						.setPlaceholder(`${banNumber}${suffix} Ban`);

					for (let j = 0; j < numGroups; j++) {
						const label = String.fromCharCode(65 + j);
						selectMenu.addOptions({ label, value: label });
					}

					const actionRow =
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
					banRows.push(actionRow);

					if (banRows.length % 5 === 0 || i === this.numberOfBans - 1) {
						const isFirstGroup = banMessages.length === 0;
						banMessages.push(
							await this.channel.send({
								content: isFirstGroup ? '__**Bans**__' : '',
								components: banRows,
							})
						);

						banRows.length = 0;
					}
				}

				for (let i = 0; i < this.players.length + this.numberOfBans; i++) {
					const pickNumber = i + 1;

					const suffix =
						pickNumber % 10 === 1 && pickNumber % 100 !== 11
							? 'st'
							: pickNumber % 10 === 2 && pickNumber % 100 !== 12
							? 'nd'
							: pickNumber % 10 === 3 && pickNumber % 100 !== 13
							? 'rd'
							: 'th';

					const selectMenu = new StringSelectMenuBuilder()
						.setCustomId(`Pick ${pickNumber}`)
						.setPlaceholder(`${pickNumber}${suffix} Pick`);

					for (let j = 0; j < numGroups; j++) {
						const label = String.fromCharCode(65 + j);
						selectMenu.addOptions({ label, value: label });
					}

					const actionRow =
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
					pickRows.push(actionRow);

					if (pickRows.length % 5 === 0 || i === this.players.length + this.numberOfBans - 1) {
						const isFirstGroup = pickMessages.length === 0;
						pickMessages.push(
							await this.channel.send({
								content: isFirstGroup ? '__**Picks**__' : '',
								components: pickRows,
							})
						);

						pickRows.length = 0;
					}
				}

				const submitButton = new ButtonBuilder()
					.setCustomId('submit')
					.setLabel('Submit')
					.setStyle(ButtonStyle.Primary);

				const teamButton = new ButtonBuilder()
					.setCustomId('team_button')
					.setLabel('Team')
					.setStyle(ButtonStyle.Success);

				const buttonRow =
					new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton, teamButton);

				pickMessages.push(
					await this.channel.send({
						content: `${this.getHammerTime(timer + 1000)}`,
						components: [buttonRow],
					})
				);

				const filter = (interaction: Interaction) =>
					(interaction.isStringSelectMenu() && (interaction.customId.startsWith('Pick') || interaction.customId.startsWith('Ban'))) ||
					(interaction.isButton() && interaction.customId === 'submit') ||
					(interaction.isButton() && interaction.customId === 'team_button');

				const collector = this.channel.createMessageComponentCollector({
					filter,
					time: timer + 1000,
				});

				collector.on('collect', async (interaction) => {
					const userId = interaction.user.id;

					const isPlayer = this.players.some(p => p.user.id === userId);
					if (!isPlayer && interaction.isStringSelectMenu()) {
						return interaction.reply({ content: 'You are not a participant!', ephemeral: true });
					}

					if (interaction.isStringSelectMenu()) {
						const dropdownId = interaction.customId;
						const selectedValue = interaction.values[0];

						if (!selections.has(userId)) selections.set(userId, new Map());
						selections.get(userId)!.set(dropdownId, selectedValue);

						return interaction.deferUpdate();
					}

					if (interaction.isButton() && interaction.customId === 'submit') {
						if (submittedUsers.has(userId)) {
							return interaction.reply({ content: 'Already submitted!', ephemeral: true });
						}

						submittedUsers.add(userId);
						const userSelections = selections.get(userId) ?? new Map();

						const formattedSelections = Array.from(userSelections.entries())
							.map(([dropdownId, value]) => `${dropdownId}: ${value}`)
							.join('\n');

						await interaction.reply({
							content: `Submission received:\n${formattedSelections}`,
							ephemeral: true,
						});

						if (submittedUsers.size === this.players.length) collector.stop();
					}

					if (interaction.isButton() && interaction.customId === 'team_button') {
						const player = this.players.find(p => p.user.id === userId);
						await interaction.deferReply({ ephemeral: true });
						const teamResponse = await this.sendTeam(player!);
						await interaction.editReply(teamResponse);
					}
				});

				collector.on('end', async () => {
					for (const m of [...banMessages, ...pickMessages]) m.delete().catch(() => null);
					clearTimeout(interval!);
					interval = null;

					for (const player of this.players) {
						const userId = player.user.id;
						if (!submittedUsers.has(userId)) {
							const randomSelections = new Map<string, string>();
							const availableOptions = new Set(
								Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i))
							);

							for (let i = 0; i < this.players.length; i++) {
								const optionsArray = Array.from(availableOptions);
								const random = optionsArray[Math.floor(Math.random() * optionsArray.length)];
								randomSelections.set(`Pick ${i + 1}`, random);
								availableOptions.delete(random);
							}

							selections.set(userId, randomSelections);
						}
					}

					const assignGroups = await this.assignGroups(this.players, selections);

					for (const [userId, groupNumber] of Array.from(assignGroups)) {
						const player = this.players.find(p => p.user.id === userId);
						if (player) await this.pickOption(player, tier, groupNumber, []);
					}

					resolve();
				});

			} catch (err) {
				console.error('Draft Error:', err);
				resolve();
			}
		});
	}

	private async assignGroups( players: Player[], selections: Map<string, Map<string, string>>): Promise<Map<string, number>> {
		const assignedGroups = new Map<string, number>();

		const banCounts = new Map<number, number>();
		selections.forEach((userSelections) => {
			userSelections.forEach((label, dropdownId) => {
			if (dropdownId.startsWith("Ban")) {
				const groupNumber = label.charCodeAt(0) - 65;
				banCounts.set(groupNumber, (banCounts.get(groupNumber) ?? 0) + 1);
			}
			});
		});

		const bannedGroups = new Set<number>();
		const numberOfBans = this.numberOfBans;

		if (numberOfBans > 0) {
			let sortedBans = Array.from(banCounts.entries())
				.sort((a, b) => b[1] - a[1]);

			let bannedSoFar = 0;
			let i = 0;
			while (bannedSoFar < numberOfBans && i < sortedBans.length) {
				const sameCountGroups: number[] = [sortedBans[i][0]];
				const count = sortedBans[i][1];

				let j = i + 1;
				while (j < sortedBans.length && sortedBans[j][1] === count) {
					sameCountGroups.push(sortedBans[j][0]);
					j++;
				}

				for (const group of sameCountGroups.sort(() => Math.random() - 0.5)) {
					if (bannedSoFar < numberOfBans) {
						bannedGroups.add(group);
						bannedSoFar++;
					}
				}

				i = j;
			}

			const sortedBanCounts = Array.from(banCounts.entries())
				.sort((a, b) => b[1] - a[1]);

			const voteCountLines: string[] = [];
			sortedBanCounts.forEach(([groupNumber, count]) => {
				const letter = String.fromCharCode(65 + groupNumber);
				voteCountLines.push(`${letter}: ${count} vote${count === 1 ? '' : 's'}`);
			});

			const bannedLetters = Array.from(bannedGroups)
				.sort((a,b) => a - b)
				.map(g => String.fromCharCode(65 + g));

			let content = `__**Ban Vote Tally**__\n${voteCountLines.join('\n')}\n\n`;
			if (bannedLetters.length > 0) {
				content += `__**Banned Groups**__: ${bannedLetters.join(', ')}`;
			} else {
				content += `No groups were banned.`;
			}

			await this.channel.send({ content }).catch(() => null);
		}

		const availableGroups = new Set<number>();
		for (let i = 0; i < this.deck.groups.length; i++) {
			if (!bannedGroups.has(i)) {
				availableGroups.add(i);
			}
		}

		for (const player of players) {
			const userId = player.user.id;
			const userSelections = selections.get(userId);

			if (userSelections) {
				const selectionsList = Array.from(userSelections.entries())
					.filter(([dropdownId, _]) => dropdownId.startsWith("Pick"))
					.sort((a, b) => a[0].localeCompare(b[0]));

				for (const [dropdownId, label] of selectionsList) {
					const groupNumber = label.charCodeAt(0) - 65;
					if (availableGroups.has(groupNumber)) {
						assignedGroups.set(userId, groupNumber);
						availableGroups.delete(groupNumber);
					break;
					}
				}
			}

			if (!assignedGroups.has(userId) && availableGroups.size > 0) {
				const remaining = Array.from(availableGroups);
				const randomGroup = remaining[Math.floor(Math.random() * remaining.length)];
				assignedGroups.set(userId, randomGroup);
				availableGroups.delete(randomGroup);
			}
		}

		return assignedGroups;
	}
}