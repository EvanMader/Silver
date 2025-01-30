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
	draftBanPets: boolean;

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
		this.timerBase = 25000;
		this.timeToLook = 15000;
		this.randomizeTiers = true;
		this.allowTalking = false;
		this.draft = DraftType.SnakeRotate;
		this.repeatPets = true;
		this.numberOfBans = 0;
		this.bidding = true;
		this.draftBanPets = true;
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
				const [tandgrisner] = this.deck.tiers[i].pets.splice(
					this.deck.tiers[i].pets.findIndex(
						(p) => p.name === 'Tandgrisner'
					),
					1
				);
				let tandgnostUsed = false;
				for (let j = 0; j < 10 - this.numberOfPetsDraft; j++) {
					let index = Math.floor(
						Math.random() * this.deck.tiers[i].pets.length
					);
					let pet = this.deck.tiers[i].pets[index];
					if (pet.name === 'Tandgnost') {
						if (j == 10 - this.numberOfPetsDraft - 1) {
							j--;
							continue;
						}
						tandgnostUsed = true;
						for (const player of this.players) {
							player.deck.tiers[i].pets.push(pet);
						}

						if (tandgrisner) {
							for (const player of this.players) {
								player.deck.tiers[i].pets.push(tandgrisner);
							}
						}

						this.deck.tiers[i].pets.splice(index, 1);
					} else {
						for (const player of this.players) {
							player.deck.tiers[i].pets.push(pet);
						}

						this.deck.tiers[i].pets.splice(index, 1);
					}
				}
				if (!tandgnostUsed && tandgrisner) {
					this.deck.tiers[i].pets.push(tandgrisner);
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
				await this.channel.send(`__# TIER ${order[i] + 1}__`);

				if (!this.bidding) {
					for (let j = 0; j < this.numberOfBans; j++) {
						await this.selectGroup(
							this.players[this.getTurn()],
							order[i],
							timer,
							false,
							selected
						);
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
						);
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
		let remainingTime = timerLength;
		const countdown = await this.channel.send({
			content: `<@${player.user.id}> Select one tier ${
				tier + 1
			} group to **${pick ? 'pick' : 'ban'}**! You have ${Math.floor(
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
			if (remainingTime > 0 && interval !== null) {
				try {
					remainingTime -=
						remainingTime % 5000 === 0
							? 5000
							: remainingTime % 5000;
					const nextTimeout =
						remainingTime >= 5000 ? 5000 : remainingTime;

					countdown.edit({
						content: `<@${player.user.id}> Select one tier ${
							tier + 1
						} group to **${
							pick ? 'pick' : 'ban'
						}**! You have ${Math.floor(
							remainingTime / 1000
						)} seconds remaining.`,
					});

					interval = setTimeout(updateCountdown, nextTimeout);
				} catch {}
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
			content: `**${pick ? 'Pick' : 'Ban'}** ${this.getHammerTime(
				timerLength + 1000
			)}:`,
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

		const numberOfBansOptions = Array.from({ length: 3 }, (_, i) => ({
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

		const draftBanPetsOptions = [
			{ label: 'True', value: 'true' },
			{ label: 'False', value: 'false' },
		];

		const draftBanPetsDropdown = createDropdown(
			'draft_ban_pets',
			`Ban OP pets: ${this.draftBanPets}`,
			draftBanPetsOptions
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
		let draftBanPetsRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				draftBanPetsDropdown
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
			components: [biddingRow, draftBanPetsRow],
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

					case 'draft_ban_pets':
						this.draftBanPets = interaction.values[0] === 'true';

						draftBanPetsRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown(
									'draft_ban_pets',
									`Ban OP pets: ${this.draftBanPets}`,
									draftBanPetsOptions
								)
							);
						break;
				}

				const updatedRows = [biddingRow, draftBanPetsRow];
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

			if (this.draftBanPets) {
				validPets = validPets.filter(
					(pet) =>
						pet.name !== 'Snail' &&
						pet.name !== 'Penguin' &&
						pet.name !== 'Werewolf'
				);
			}

			for (let j = 0; j < this.players.length + 2; j++) {
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
					try {
						remainingTime -=
							remainingTime % 5000 === 0
								? 5000
								: remainingTime % 5000;
						const nextTimeout =
							remainingTime >= 5000 ? 5000 : remainingTime;

						countdown.edit({
							content:
								`Timer: ${
									remainingTime / 1000
								} seconds left.\n` + priorityMessage,
						});

						interval = setTimeout(updateCountdown, nextTimeout);
					} catch {}
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

			const numPlayers = this.players.length;
			const numGroups = this.deck.groups[tier].length;
			const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
			const messages: Message[] = [];

			const selections = new Map<string, Map<string, string>>();
			const submittedUsers = new Set<string>();

			for (let i = 0; i < numPlayers; i++) {
				const selectMenu = new StringSelectMenuBuilder().setCustomId(
					`Option-${i + 1}`
				);

				for (let j = 0; j < numGroups; j++) {
					const label = String.fromCharCode(65 + j);
					selectMenu.addOptions({
						label: label,
						value: label,
					});
				}

				const actionRow =
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						selectMenu
					);
				rows.push(actionRow);

				if (rows.length % 5 === 0 || i === numPlayers - 1) {
					messages.push(
						await this.channel.send({
							content: '',
							components: rows,
						})
					);

					rows.length = 0;
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
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					submitButton,
					teamButton
				);

			messages.push(
				await this.channel.send({
					content: `${this.getHammerTime(timer + 1000)}`,
					components: [buttonRow],
				})
			);

			const filter = (interaction: Interaction) =>
				(interaction.isStringSelectMenu() &&
					interaction.customId.startsWith('Option-')) ||
				(interaction.isButton() && interaction.customId === 'submit') ||
				(interaction.isButton() &&
					interaction.customId === 'team_button');

			const collector = this.channel.createMessageComponentCollector({
				filter,
				time: timer + 1000,
			});

			collector.on('collect', async (interaction) => {
				const userId = interaction.user.id;

				if (interaction.isStringSelectMenu()) {
					const dropdownId = interaction.customId;
					const selectedValue = interaction.values[0];

					if (!selections.has(userId)) {
						selections.set(userId, new Map<string, string>());
					}

					selections.get(userId)!.set(dropdownId, selectedValue);

					await interaction.deferUpdate();
				} else if (
					interaction.isButton() &&
					interaction.customId === 'submit'
				) {
					const isPlayer = this.players.some(
						(player) => player.user.id === userId
					);
					if (!isPlayer) {
						await interaction.reply({
							content: 'You are not a participant in this draft!',
							ephemeral: true,
						});
						return;
					}

					if (submittedUsers.has(userId)) {
						await interaction.reply({
							content:
								'You have already submitted your selections!',
							ephemeral: true,
						});
						return;
					}

					const userSelections = selections.get(userId) ?? new Map();

					submittedUsers.add(userId);

					const formattedSelections = Array.from(
						userSelections.entries()
					)
						.map(([dropdownId, value]) => `${dropdownId}: ${value}`)
						.join('\n');

					await interaction.reply({
						content: `Submission received! Your selections:\n${formattedSelections}`,
						ephemeral: true,
					});

					if (submittedUsers.size === this.players.length) {
						collector.stop();
					}
				} else if (
					interaction.isButton() &&
					interaction.customId === 'team_button'
				) {
					const isPlayer = this.players.some(
						(player) => player.user.id === userId
					);
					if (!isPlayer) {
						await interaction.reply({
							content: 'You are not a participant in this draft!',
							ephemeral: true,
						});
						return;
					}

					const player = this.players.find(
						(player) => player.user.id === userId
					);
					await interaction.deferReply({ ephemeral: true });
					const teamResponse = await this.sendTeam(player!);
					await interaction.editReply(teamResponse);
					return;
				}
			});

			collector.on('end', () => {
				for (const message of messages) {
					message.delete().catch(() => null);
				}
				clearTimeout(interval!);
				interval = null;

				for (const player of this.players) {
					const userId = player.user.id;
					if (!submittedUsers.has(userId)) {
						const randomSelections = new Map<string, string>();
						const availableOptions = new Set(
							Array.from({ length: numGroups }, (_, i) =>
								String.fromCharCode(65 + i)
							)
						);

						for (let i = 0; i < numPlayers; i++) {
							const optionsArray = Array.from(availableOptions);
							const randomOption =
								optionsArray[
									Math.floor(
										Math.random() * optionsArray.length
									)
								];
							randomSelections.set(
								`Option-${i + 1}`,
								randomOption
							);
							availableOptions.delete(randomOption);
						}

						selections.set(userId, randomSelections);
					}
				}

				const assignGroups = this.assignGroups(
					this.players,
					selections
				);

				for (const [userId, groupNumber] of Array.from(assignGroups)) {
					const player = this.players.find(
						(p) => p.user.id === userId
					);

					if (player) {
						this.pickOption(player, tier, groupNumber, []).catch(
							() => null
						);
					}
				}

				resolve();
			});
		});
	}

	private assignGroups(
		players: Player[],
		selections: Map<string, Map<string, string>>
	): Map<string, number> {
		const assignedGroups = new Map<string, number>();

		const availableGroups = new Set<number>();
		for (let i = 0; i < this.deck.groups.length; i++) {
			availableGroups.add(i);
		}

		for (const player of players) {
			const userId = player.user.id;
			const userSelections = selections.get(userId);

			if (userSelections) {
				const selectionsList = Array.from(userSelections.values());
				const filledSelections = selectionsList.filter(
					(value) => value !== undefined
				);

				for (const label of filledSelections) {
					const groupNumber = label.charCodeAt(0) - 65;
					if (availableGroups.has(groupNumber)) {
						assignedGroups.set(userId, groupNumber);
						availableGroups.delete(groupNumber);
						break;
					}
				}
			}

			if (!assignedGroups.has(userId) && availableGroups.size > 0) {
				const randomGroup =
					Array.from(availableGroups)[
						Math.floor(Math.random() * availableGroups.size)
					];
				assignedGroups.set(userId, randomGroup);
				availableGroups.delete(randomGroup);
			}
		}

		return assignedGroups;
	}
}