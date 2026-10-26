import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	ComponentType,
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
import { safe, fileIfExists } from './Silver';

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
		const channel = await safe(guild.channels.create({
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
		}), "Create Game Channel");

		if (!channel) throw new Error("Lobby could not be created.");

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
			//
			// Phase 1 — Cleanup + Setup
			//
			for (const message of this.lobbyMessages) {
				await safe(message.delete(), "Delete lobby message");
			}

			await safe(this.endGame(), "End previous game cleanup");

			if (!this.allowTalking) {
				await safe(this.removePlayersWrite(), "Remove write permissions");
			}

			// Determine shared packs across players
			const packs = this.players.reduce((common, player) =>
				common.filter((num) => player.packs.includes(num)),
				this.players[0].packs
			);

			this.deck = new Deck(true, packs);
			this.packs = packs;

			//
			// Phase 2 — Distribute Pets & Foods Per Tier
			//
			for (let tier = 0; tier < 6; tier++) {
				const { pets, foods } = this.deck.tiers[tier];

				const tandgrisnerIndex = pets.findIndex((p) => p.name === "Tandgrisner");
				const tandgnostIndex = pets.findIndex((p) => p.name === "Tandgnost");

				let tandgrisner: any = null;
				let tandgnost: any = null;

				// Pull them out of the pool if present
				if (tandgrisnerIndex !== -1) {
					[tandgrisner] = pets.splice(tandgrisnerIndex, 1);
				}

				if (tandgnostIndex !== -1) {
					const adjusted = tandgrisnerIndex !== -1 && tandgrisnerIndex < tandgnostIndex
						? tandgnostIndex - 1
						: tandgnostIndex;
					[tandgnost] = pets.splice(adjusted, 1);
				}

				if (tandgrisner && tandgnost) {
					pets.push(tandgnost);
				}

				let tandgnostUsed = false;

				// Distribute pets
				for (let j = 0; j < 10 - this.numberOfPetsDraft; j++) {
					const index = Math.floor(Math.random() * pets.length);
					const pet = pets[index];

					// Special tandem rule
					if (pet.name === "Tandgnost") {
						if (j >= (10 - this.numberOfPetsDraft - 1) && tandgrisner) {
							j--;
							continue;
						}

						tandgnostUsed = true;

						for (const player of this.players) {
							player.deck.tiers[tier].pets.push(pet);
							if (tandgrisner) player.deck.tiers[tier].pets.push(tandgrisner);
						}

						pets.splice(index, 1);
						if (tandgrisner) j++;
						continue;
					}

					for (const player of this.players) {
						player.deck.tiers[tier].pets.push(pet);
					}
					pets.splice(index, 1);
				}

				if (!tandgnostUsed && tandgrisner && !tandgnost) {
					pets.push(tandgrisner);
				}

				// Distribute foods
				for (let j = 0; j < 3 - this.numberOfFoodsDraft; j++) {
					let index = Math.floor(Math.random() * foods.length);

					// Force chocolate consistency in tier 5
					if (tier === 4 && foods.some((f) => f.name === "Chocolate")) {
						index = foods.findIndex((f) => f.name === "Chocolate");
					}

					const food = foods[index];
					for (const player of this.players) {
						player.deck.tiers[tier].foods.push(food);
					}

					foods.splice(index, 1);
				}
			}

			//
			// Phase 3 — Announce Draft & Allow Viewing
			//
			const teamImage = await safe(
				this.getTeam(this.players[0].deck.tiers),
				"Get team image"
			);

			await safe(
				this.channel.send({
					content: `__**Randomly Selected ${
						10 - this.numberOfPetsDraft
					} Pets and ${
						3 - this.numberOfFoodsDraft
					} Food Per Tier**__\nDraft begins in ${
						this.timeToLook / 1000
					} seconds.`,
					files: teamImage ? [{ attachment: teamImage }] : []
				}),
				"Send draft start message"
			);

			let order = [0, 1, 2, 3, 4, 5];
			if (this.randomizeTiers) {
				for (let i = order.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[order[i], order[j]] = [order[j], order[i]];
				}
			}

			this.players = this.players.sort(() => Math.random() - 0.5);
			this.constructGroups();

			await new Promise((resolve) => setTimeout(resolve, this.timeToLook));

			//
			// Phase 4 — Draft Loop
			//
			for (let i = 0; i < 6; i++) {
				await safe(this.channel.send(`__# TIER ${order[i] + 1}__`), "Announce tier");

				const totalGroups = this.players.length + 2;
				let timer = this.timerPerGroup * totalGroups + this.timerBase;

				if (this.bidding) timer += this.timerPerGroup * this.numberOfBans;

				const selected: number[] = [];

				if (!this.bidding) {
					// Bans
					for (let b = 0; b < this.numberOfBans; b++) {
						await safe(this.selectGroup(this.players[this.getTurn()], order[i], timer, false, selected), "Ban select");
						this.turn++;
						timer -= this.timerPerGroup;
					}

					// Picks
					for (let p = 0; p < this.players.length; p++) {
						await safe(this.selectGroup(this.players[this.getTurn()], order[i], timer, true, selected), "Pick select");
						this.turn++;
						timer -= this.timerPerGroup;
					}
				} else {
					await safe(this.biddingDraft(order[i], timer), "Bidding draft");
				}

				// Rotate draft order
				switch (this.draft) {
					case DraftType.SnakeRotate:
						this.players = this.players.reverse();
						if (i % 2 === 1) this.players.unshift(this.players.pop()!);
						break;

					case DraftType.Snake:
						this.players = this.players.reverse();
						break;

					case DraftType.Rotate:
						this.players.unshift(this.players.pop()!);
						break;

					case DraftType.RotateCoprime:
						const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
						const n = this.players.length;
						let step = 1;
						for (let x = 2; x < n; x++) {
							if (gcd(x, n) === 1) { step = x; break; }
						}
						this.players = [...this.players.slice(-step), ...this.players.slice(0, -step)];
						break;

					case DraftType.Random:
						this.players = this.players.sort(() => Math.random() - 0.5);
						break;
				}
			}

			//
			// Phase 5 — Send Codes & Cleanup
			//
			for (const player of this.players) {
				const playerImage = await safe(
					this.getTeam(player.deck.tiers),
					"Get player team image"
				);

				await safe(
					this.channel.send({
						content: `<@${player.user.id}> Pack Code:`,
						files: playerImage ? [{ attachment: playerImage }] : []
					}),
					"Send player pack image"
				);

				await safe(
					this.channel.send(player.deck.getCode()),
					"Send deck code string"
				);
			}

			if (!this.allowTalking) {
				await safe(this.addPlayersWrite(), "Restore write permissions");
			}

			await safe(this.endGame(), "Finalize game");

		} catch {
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

			const groupsImage = await safe(
				this.getGroups(this.deck.groups[tier], selected),
				"Get Groups Image"
			);

			const countdown = await safe(
				this.channel.send({
					content: `<@${player.user.id}> Select one tier ${
						tier + 1
					} group to **${pick ? "pick" : "ban"}**! You have ${
						Math.floor(remainingTime / 1000)
					} seconds remaining.`,
					files: fileIfExists(groupsImage),
				}),
				"Send Countdown Message"
			);

			if (!countdown) throw new Error("Countdown Message failed to send.");

			let interval: NodeJS.Timeout | null = null;

			const updateCountdown = async () => {
				if (remainingTime > 0 && interval !== null && countdown) {
					remainingTime -=
						remainingTime % 5000 === 0
							? 5000
							: remainingTime % 5000;

					await safe(
						countdown.edit({
							content: `<@${player.user.id}> Select one tier ${
								tier + 1
							} group to **${pick ? "pick" : "ban"}**! You have ${
								Math.floor(remainingTime / 1000)
							} seconds remaining.`,
						}),
						"Update Countdown"
					);

					interval = setTimeout(
						updateCountdown,
						remainingTime >= 5000 ? 5000 : remainingTime
					);
				} else {
					interval = null;
				}
			};

			const firstTimeout =
				remainingTime % 5000 === 0 ? 5000 : remainingTime % 5000;
			interval = setTimeout(updateCountdown, firstTimeout);

			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId("group_select")
				.setPlaceholder("Select a group...")
				.addOptions(
					this.deck.groups[tier]
						.map((_, idx) => ({
							label: String.fromCharCode(65 + idx),
							value: `${idx}`,
						}))
						.filter(o => !selected.includes(Number(o.value)))
				);

			const submitButton = new ButtonBuilder()
				.setCustomId("submit")
				.setLabel("Submit")
				.setStyle(ButtonStyle.Primary);

			const teamButton = new ButtonBuilder()
				.setCustomId("team_button")
				.setLabel("Team")
				.setStyle(ButtonStyle.Success);

			const actionMessage = await safe(
				this.channel.send({
					content: `**${pick ? "Pick" : "Ban"}** ${this.getHammerTime(
						timerLength + 1000
					)}`,
					components: [
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
						new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton, teamButton),
					],
				}),
				"Send Action Message"
			);

			if (!actionMessage) throw new Error("ActionMessage failed to send.");

			await new Promise<void>(resolve => {
				let selectedValue: string | null = null;

				const collector = actionMessage?.createMessageComponentCollector({
					time: timerLength + 1000,
				});

				collector?.on("collect", async interaction => {
					if (interaction.user.id !== player.user.id) {
						await safe(
							interaction.reply({
								content: "This is not your selection menu!",
								ephemeral: true,
							}),
							"Wrong User Interaction Reply"
						);
						return;
					}

					if (interaction.customId === "team_button") {
						await safe(interaction.deferReply({ ephemeral: true }), "Defer Team Reply");
						const teamResponse = await safe(this.sendTeam(player), "Send Team Data");
						await safe(interaction.editReply(teamResponse ?? ""), "Edit Team Reply");
						return;
					}

					if (interaction.isStringSelectMenu()) {
						selectedValue = interaction.values[0];
						await safe(interaction.deferUpdate(), "Defer Group Select");
						return;
					}

					if (interaction.customId === "submit") {
						if (!selectedValue) {
							await safe(
								interaction.reply({
									content: "Please select a group before submitting.",
									ephemeral: true,
								}),
								"Submit Without Selection"
							);
							return;
						}
						collector.stop("confirmed");
					}
				});

				collector?.on("end", async (_, reason) => {
					clearTimeout(interval!);
					interval = null;

					await safe(actionMessage?.delete(), "Delete Action Message");
					await safe(countdown?.delete(), "Delete Countdown Message");

					if (reason === "confirmed" && selectedValue !== null) {
						if (pick) {
							await safe(this.pickOption(player, tier, parseInt(selectedValue), selected), "Pick Option");
						} else {
							await safe(this.banOption(tier, parseInt(selectedValue), selected), "Ban Option");
						}
						return resolve();
					}

					// Timeout fallback
					await safe(
						this.channel.send(`<@${player.user.id}> You took too long.`),
						"Timeout Warning"
					);
					if (pick) {
						await safe(this.pickOption(player, tier, -1, selected), "Default Pick on Timeout");
					}
					resolve();
				});
			});
		} catch (err) {
			console.error("selectGroup failed:", err);
			await safe(this.channel.send(`<@${player.user.id}> Error occurred. Defaulting.`), "Send SelectGroup Error Notice");
			await safe(this.pickOption(player, tier, -1, selected), "Default Pick On Failure");
		}
	}

	private async lobbyOptions() {
		try {
			const createDropdown = (
				customId: string,
				placeholder: string,
				options: { label: string; value: string }[]
			) => new StringSelectMenuBuilder()
				.setCustomId(customId)
				.setPlaceholder(placeholder)
				.addOptions(options);

			// Dropdown options
			const numberOfPetsDraftOptions = Array.from({ length: 11 }, (_, i) => ({ label: `${i}`, value: `${i}` }));
			const numberOfFoodsDraftOptions = Array.from({ length: 4 }, (_, i) => ({ label: `${i}`, value: `${i}` }));
			const timerPerGroupOptions = Array.from({ length: 21 }, (_, i) => ({ label: `${i}`, value: `${i}` }));
			const timerBaseOptions = Array.from({ length: 19 }, (_, i) => ({ label: `${i * 5}`, value: `${i * 5}` }));
			const timeToLookOptions = Array.from({ length: 25 }, (_, i) => ({ label: `${i * 5}`, value: `${i * 5}` }));
			const randomizeTiersOptions = [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }];
			const allowTalkingOptions = [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }];
			const draftTypeOptions = Object.values(DraftType).filter(v => typeof v === 'string').map(label => ({ label, value: label }));
			const repeatPetOptions = [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }];
			const numberOfBansOptions = Array.from({ length: 6 }, (_, i) => ({ label: `${i}`, value: `${i}` }));
			const biddingOptions = [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }];

			// Initial rows
			let numberOfPetsDraftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('number_of_draft', `Number of pets to draft: ${this.numberOfPetsDraft}`, numberOfPetsDraftOptions)
			);
			let numberOfFoodsDraftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('number_of_food', `Number of food to draft: ${this.numberOfFoodsDraft}`, numberOfFoodsDraftOptions)
			);
			let timerPerGroupRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('timer_per_group', `Timer increment per group (seconds): ${this.timerPerGroup / 1000}`, timerPerGroupOptions)
			);
			let timerBaseRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('timer_base', `Base timer length (seconds): ${this.timerBase / 1000}`, timerBaseOptions)
			);
			let timeToLookRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('time_to_look', `Time to look before draft (seconds): ${this.timeToLook / 1000}`, timeToLookOptions)
			);
			let randomizeTiersRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('randomize_tiers', `Randomize tiers: ${this.randomizeTiers}`, randomizeTiersOptions)
			);
			let allowTalkingRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('allow_talking', `Allow talking: ${this.allowTalking}`, allowTalkingOptions)
			);
			let draftTypeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('draft_type', `Draft Type: ${DraftType[this.draft]}`, draftTypeOptions)
			);
			let repeatPetsRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('repeat_pets', `Repeat Pets: ${this.repeatPets}`, repeatPetOptions)
			);
			let numberOfBansRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('number_of_bans', `Number of bans: ${this.numberOfBans}`, numberOfBansOptions)
			);
			let biddingRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				createDropdown('bidding', `Bidding: ${this.bidding}`, biddingOptions)
			);

			// Send messages
			const settingsMessage1 = await safe(this.channel.send({
				components: [numberOfPetsDraftRow, numberOfFoodsDraftRow, timerPerGroupRow, timerBaseRow, timeToLookRow]
			}), "Send lobby settings message 1");

			const settingsMessage2 = await safe(this.channel.send({
				components: [randomizeTiersRow, allowTalkingRow, draftTypeRow, repeatPetsRow, numberOfBansRow]
			}), "Send lobby settings message 2");

			const settingsMessage3 = await safe(this.channel.send({
				components: [biddingRow]
			}), "Send lobby settings message 3");

			if (!settingsMessage1 || !settingsMessage2 || !settingsMessage3) throw new Error("Settings Message faild to send.");

			this.lobbyMessages.push(settingsMessage1, settingsMessage2, settingsMessage3);

			const collectors = [
				settingsMessage1.createMessageComponentCollector(),
				settingsMessage2.createMessageComponentCollector(),
				settingsMessage3.createMessageComponentCollector()
			];

			// Collector handler
			collectors.forEach((collector, index) => {
				collector.on('collect', async (interaction: MessageComponentInteraction) => {
					if (!interaction.isStringSelectMenu()) return;
					if (interaction.user.id !== this.host.user.id) {
						await safe(interaction.reply({ content: "You don't have permission to change the game settings.", ephemeral: true }), "Unauthorized lobby interaction reply");
						return;
					}
					await safe(interaction.deferUpdate(), "Defer lobby interaction");

					const value = interaction.values[0];

					switch (interaction.customId) {
						case 'number_of_draft':
							this.numberOfPetsDraft = parseInt(value, 10);
							numberOfPetsDraftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('number_of_draft', `Number of pets to draft: ${this.numberOfPetsDraft}`, numberOfPetsDraftOptions)
							);
							break;

						case 'number_of_food':
							this.numberOfFoodsDraft = parseInt(value, 10);
							numberOfFoodsDraftRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('number_of_food', `Number of food to draft: ${this.numberOfFoodsDraft}`, numberOfFoodsDraftOptions)
							);
							break;

						case 'timer_per_group':
							this.timerPerGroup = parseInt(value, 10) * 1000;
							timerPerGroupRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('timer_per_group', `Timer increment per group (seconds): ${this.timerPerGroup / 1000}`, timerPerGroupOptions)
							);
							break;

						case 'timer_base':
							this.timerBase = parseInt(value, 10) * 1000;
							timerBaseRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('timer_base', `Base timer length (seconds): ${this.timerBase / 1000}`, timerBaseOptions)
							);
							break;

						case 'time_to_look':
							this.timeToLook = parseInt(value, 10) * 1000;
							timeToLookRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('time_to_look', `Time to look before draft (seconds): ${this.timeToLook / 1000}`, timeToLookOptions)
							);
							break;

						case 'randomize_tiers':
							this.randomizeTiers = value === 'true';
							randomizeTiersRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('randomize_tiers', `Randomize tiers: ${this.randomizeTiers}`, randomizeTiersOptions)
							);
							break;

						case 'allow_talking':
							this.allowTalking = value === 'true';
							allowTalkingRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('allow_talking', `Allow talking: ${this.allowTalking}`, allowTalkingOptions)
							);
							break;

						case 'draft_type':
							this.draft = DraftType[value as keyof typeof DraftType] ?? DraftType.SnakeRotate;
							draftTypeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('draft_type', `Draft Type: ${DraftType[this.draft]}`, draftTypeOptions)
							);
							break;

						case 'repeat_pets':
							this.repeatPets = value === 'true';
							repeatPetsRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('repeat_pets', `Repeat Pets: ${this.repeatPets}`, repeatPetOptions)
							);
							break;

						case 'number_of_bans':
							this.numberOfBans = parseInt(value, 10);
							numberOfBansRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('number_of_bans', `Number of bans: ${this.numberOfBans}`, numberOfBansOptions)
							);
							break;

						case 'bidding':
							this.bidding = value === 'true';
							biddingRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								createDropdown('bidding', `Bidding: ${this.bidding}`, biddingOptions)
							);
							break;
					}

					// Edit the correct message based on collector
					const updatedRows = index === 0
						? [numberOfPetsDraftRow, numberOfFoodsDraftRow, timerPerGroupRow, timerBaseRow, timeToLookRow]
						: index === 1
						? [randomizeTiersRow, allowTalkingRow, draftTypeRow, repeatPetsRow, numberOfBansRow]
						: [biddingRow];

					await safe(interaction.message.edit({ components: updatedRows }), "Update lobby dropdowns");
				});

				collector.on('end', async (_collected, reason) => {
					console.log(`Lobby settings collector ended for message ${index + 1} with reason: ${reason}`);
					// Disable dropdowns after collector ends
					const message = this.lobbyMessages[index];
					if (!message) return;
					await safe(
						message.edit({
							components: message.components.filter(row => row.type === ComponentType.ActionRow).map(row => {
								return {
									...row.toJSON(),
									components: row.components.map(component => ({ ...component.toJSON(), disabled: true })),
								};
							}),
						}),
						"Disable lobby dropdowns after collector end"
					);
				});
			});
		} catch (err) {
			console.error('lobbyOptions failed:', err);
		}
	}

	private constructGroups() {
		for (let tierIndex = 0; tierIndex < 6; tierIndex++) {
			const tierGroups: Tier[] = [];

			// Make a copy of pets for this tier
			let availablePets = [...this.deck.tiers[tierIndex].pets];
			const tierFoods = [...this.deck.tiers[tierIndex].foods];

			// Determine number of groups for this tier
			const numberOfGroups = this.bidding
				? this.players.length + 2 + this.numberOfBans
				: this.players.length + 2;

			for (let groupIndex = 0; groupIndex < numberOfGroups; groupIndex++) {
				// Shuffle pets and foods
				const shuffledPets = [...availablePets].sort(() => Math.random() - 0.5);
				const shuffledFoods = [...tierFoods].sort(() => Math.random() - 0.5);

				// Find Tandgrisner (if exists) and remove it temporarily
				const tandgrisnerIndex = availablePets.findIndex(p => p.name === 'Tandgrisner');
				const tandgrisner = tandgrisnerIndex !== -1 ? availablePets.splice(tandgrisnerIndex, 1)[0] : null;

				const selectedPets: Pet[] = [];

				for (const pet of shuffledPets) {
					if (pet.name === 'Tandgnost') {
						// Ensure Tandgnost + Tandgrisner logic
						if (selectedPets.length >= this.numberOfPetsDraft - 1 && tandgrisner) continue;
						selectedPets.push(pet);
						if (tandgrisner) selectedPets.push(tandgrisner);
					} else if (pet.name !== 'Tandgrisner') {
						selectedPets.push(pet);
					}

					if (selectedPets.length >= this.numberOfPetsDraft) break;
				}

				// Select foods
				const selectedFoods = shuffledFoods.slice(0, this.numberOfFoodsDraft);

				// Remove selected pets if repeatPets is false
				if (!this.repeatPets) {
					availablePets = availablePets.filter(
						(pet) => !selectedPets.some((selected) => selected.name === pet.name)
					);
				}

				tierGroups.push({ pets: selectedPets, foods: selectedFoods });
			}

			this.deck.groups.push(tierGroups);
		}
	}

	private async waitStart() {
		try {
			await new Promise((resolve) => setTimeout(resolve, 3000));

			const startGameButton = new ButtonBuilder()
				.setCustomId('start_game_button')
				.setLabel('Start Game')
				.setStyle(ButtonStyle.Success);

			const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(startGameButton);

			const startMessage = await safe(
				this.channel.send({ components: [buttonRow] }),
				"Send start game button"
			);

			if (!startMessage) throw new Error("Failed to send startMessage.")

			await new Promise<void>((resolve) => {
				const collector = startMessage.createMessageComponentCollector();

				collector.on('collect', async (interaction: MessageComponentInteraction) => {
					if (interaction.user.id === this.host.user.id) {
						collector.stop('host_pressed');
					} else {
						await safe(
							interaction.reply({
								content: "You don't have permission to access this button.",
								ephemeral: true,
							}),
							"Reply to unauthorized button press"
						);
					}
				});

				collector.on('end', async () => {
					await safe(startMessage.delete(), "Delete start game button message");
					resolve();
				});
			});
		} catch (err) {
			console.error('waitStart failed:', err);
		}
	}

	private async joinLeaveGame() {
		try {
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

			const joinLeaveMessage = await safe(
				this.channel.send({ components: [buttonRow] }),
				"Send join/leave message"
			);

			if (!joinLeaveMessage) {
				console.error("Failed to send joinLeaveMessage.");
				throw new Error("Failed to send joinLeaveMessage.");
			}

			this.lobbyMessages.push(joinLeaveMessage);

			await new Promise<void>((resolve) => {
				const collector = joinLeaveMessage.createMessageComponentCollector();

				collector.on('collect', async (interaction: MessageComponentInteraction) => {
					const userId = interaction.user.id;

					if (interaction.customId === 'join_game_button') {
						if (this.players.some((player) => player.user.id === userId)) {
							await safe(interaction.reply({
								content: 'You are already in the game!',
								ephemeral: true,
							}), "Reply already in game");
							return;
						}

						if (this.players.length >= 18) {
							await safe(interaction.reply({
								content: 'Lobby is full. 18 Players Max.',
								ephemeral: true,
							}), "Reply lobby full");
							return;
						}

						const newPlayer = await safe(Player.create(interaction.user, this.guild), "Create player");
						if (newPlayer) {
							this.players.push(newPlayer);
							await safe(this.channel.permissionOverwrites.edit(interaction.user.id, {
								SendMessages: true,
								AddReactions: true,
							}), "Update join permissions");

							await safe(interaction.reply({
								content: `${interaction.user.displayName} has joined the lobby.`,
							}), "Reply player joined");
						}
					} else if (interaction.customId === 'leave_game_button') {
						const playerIndex = this.players.findIndex((player) => player.user.id === userId);

						if (playerIndex === -1) {
							await safe(interaction.reply({
								content: 'You are not in the game!',
								ephemeral: true,
							}), "Reply not in game");
							return;
						}

						if (userId === this.host.user.id) {
							await safe(interaction.deferReply(), "Defer host leave");
							await safe(this.deleteGame(), "Delete game");
							return;
						}

						this.players.splice(playerIndex, 1);
						await safe(this.channel.permissionOverwrites.edit(interaction.user.id, {
							SendMessages: false,
							AddReactions: false,
						}), "Update leave permissions");

						await safe(interaction.reply({
							content: `${interaction.user.displayName} has left the lobby.`,
						}), "Reply player left");
					}
				});
			});
		} catch (err) {
			console.error("joinLeaveGame failed:", err);
		}
	}

	async biddingDraft(tier: number, timer: number) {
		await new Promise<void>(async (resolve) => {
			let interval: NodeJS.Timeout | null = null;
			try {
				let remainingTime = timer;

				const priorityMessage =
					'Priority: ' + this.players.map(p => p.user.displayName).join(' => ');

				const groupImageBuffer = await safe(
					this.getGroups(this.deck.groups[tier], []),
					"Get group image"
				);

				const countdown = await safe(
					this.channel.send({
						content: `Timer: ${remainingTime / 1000} seconds left.\n${priorityMessage}`,
						files: fileIfExists(groupImageBuffer),
					}),
					"Send countdown message"
				);

				if (!countdown) throw new Error("Failed to send countdown message.");

				const updateCountdown = async () => {
					if (remainingTime > 0 && interval !== null) {
						remainingTime -= remainingTime % 5000 === 0 ? 5000 : remainingTime % 5000;
						const nextTimeout = remainingTime >= 5000 ? 5000 : remainingTime;

						await safe(countdown.edit({
							content: `Timer: ${remainingTime / 1000} seconds left.\n${priorityMessage}`,
						}), "Edit countdown");

						interval = setTimeout(updateCountdown, nextTimeout);
					} else {
						interval = null;
					}
				};

				const firstTimeout = remainingTime % 5000 === 0 ? 5000 : remainingTime % 5000;
				interval = setTimeout(updateCountdown, firstTimeout);

				// Build pick and ban messages
				const numGroups = this.deck.groups[tier].length;
				const pickRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
				const banRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
				const pickMessages: Message[] = [];
				const banMessages: Message[] = [];

				const selections = new Map<string, Map<string, string>>();
				const submittedUsers = new Set<string>();

				// Create ban menus
				for (let i = 0; i < this.numberOfBans; i++) {
					const banNumber = i + 1;
					const suffix = banNumber % 10 === 1 && banNumber % 100 !== 11 ? 'st' :
								banNumber % 10 === 2 && banNumber % 100 !== 12 ? 'nd' :
								banNumber % 10 === 3 && banNumber % 100 !== 13 ? 'rd' : 'th';

					const selectMenu = new StringSelectMenuBuilder()
						.setCustomId(`Ban ${banNumber}`)
						.setPlaceholder(`${banNumber}${suffix} Ban`);

					for (let j = 0; j < numGroups; j++) {
						selectMenu.addOptions({ label: String.fromCharCode(65 + j), value: String.fromCharCode(65 + j) });
					}

					banRows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

					if (banRows.length % 5 === 0 || i === this.numberOfBans - 1) {
						const isFirst = banMessages.length === 0;
						const msg = await safe(this.channel.send({ content: isFirst ? '__**Bans**__' : '', components: banRows }), "Send ban messages");
						if (msg) banMessages.push(msg);
						banRows.length = 0;
					}
				}

				// Create pick menus
				for (let i = 0; i < this.players.length + this.numberOfBans; i++) {
					const pickNumber = i + 1;
					const suffix = pickNumber % 10 === 1 && pickNumber % 100 !== 11 ? 'st' :
								pickNumber % 10 === 2 && pickNumber % 100 !== 12 ? 'nd' :
								pickNumber % 10 === 3 && pickNumber % 100 !== 13 ? 'rd' : 'th';

					const selectMenu = new StringSelectMenuBuilder()
						.setCustomId(`Pick ${pickNumber}`)
						.setPlaceholder(`${pickNumber}${suffix} Pick`);

					for (let j = 0; j < numGroups; j++) {
						selectMenu.addOptions({ label: String.fromCharCode(65 + j), value: String.fromCharCode(65 + j) });
					}

					pickRows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

					if (pickRows.length % 5 === 0 || i === this.players.length + this.numberOfBans - 1) {
						const isFirst = pickMessages.length === 0;
						const msg = await safe(this.channel.send({ content: isFirst ? '__**Picks**__' : '', components: pickRows }), "Send pick messages");
						if (msg) pickMessages.push(msg);
						pickRows.length = 0;
					}
				}

				// Submit and team button
				const submitButton = new ButtonBuilder().setCustomId('submit').setLabel('Submit').setStyle(ButtonStyle.Primary);
				const teamButton = new ButtonBuilder().setCustomId('team_button').setLabel('Team').setStyle(ButtonStyle.Success);
				const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(submitButton, teamButton);

				const submitMsg = await safe(this.channel.send({ content: `${this.getHammerTime(timer + 1000)}`, components: [buttonRow] }), "Send submit buttons");
				if (submitMsg) pickMessages.push(submitMsg);

				// Collector
				const filter = (interaction: Interaction) =>
					(interaction.isStringSelectMenu() && (interaction.customId.startsWith('Pick') || interaction.customId.startsWith('Ban'))) ||
					(interaction.isButton() && ['submit', 'team_button'].includes(interaction.customId));

				const collector = this.channel.createMessageComponentCollector({ filter, time: timer + 1000 });

				collector.on('collect', async (interaction) => {
					const userId = interaction.user.id;
					const isPlayer = this.players.some(p => p.user.id === userId);

					if (!isPlayer) {
						await safe(interaction.reply({ content: 'You are not a participant!', ephemeral: true }), "Not a participant reply");
						return;
					}

					if (interaction.isStringSelectMenu()) {
						const dropdownId = interaction.customId;
						const selectedValue = interaction.values[0];
						if (!selections.has(userId)) selections.set(userId, new Map());
						selections.get(userId)!.set(dropdownId, selectedValue);
						await safe(interaction.deferUpdate(), "Defer dropdown update");
						return;
					}

					if (interaction.isButton() && interaction.customId === 'submit') {
						if (submittedUsers.has(userId)) {
							await safe(interaction.reply({ content: 'Already submitted!', ephemeral: true }), "Already submitted reply");
							return;
						}

						submittedUsers.add(userId);
						const userSelections = selections.get(userId) ?? new Map();
						const formattedSelections = Array.from(userSelections.entries()).map(([id, val]) => `${id}: ${val}`).join('\n');
						await safe(interaction.reply({ content: `Submission received:\n${formattedSelections}`, ephemeral: true }), "Submit reply");

						if (submittedUsers.size === this.players.length) collector.stop();
					}

					if (interaction.isButton() && interaction.customId === 'team_button') {
						const player = this.players.find(p => p.user.id === userId);
						await safe(interaction.deferReply({ ephemeral: true }), "Defer team reply");
						const teamResponse = await safe(this.sendTeam(player!), "Send team image");
						if (teamResponse) await safe(interaction.editReply(teamResponse), "Edit team reply");
					}
				});

				collector.on('end', async () => {
					for (const m of [...banMessages, ...pickMessages]) await safe(m.delete(), "Delete pick/ban messages");
					if (interval) clearTimeout(interval);

					// Randomly fill unsubmitted players
					for (const player of this.players) {
						if (!submittedUsers.has(player.user.id)) {
							const randomSelections = new Map<string, string>();
							const availableOptions = new Set(Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i)));
							for (let i = 0; i < this.players.length; i++) {
								const optionsArray = Array.from(availableOptions);
								const random = optionsArray[Math.floor(Math.random() * optionsArray.length)];
								randomSelections.set(`Pick ${i + 1}`, random);
								availableOptions.delete(random);
							}
							selections.set(player.user.id, randomSelections);
						}
					}

					const assignGroups = await safe(this.assignGroups(this.players, selections, numGroups), "Assign groups");
					if (assignGroups) {
						for (const [userId, groupNumber] of Array.from(assignGroups)) {
							const player = this.players.find(p => p.user.id === userId);
							if (player) await safe(this.pickOption(player, tier, groupNumber, []), "Pick option");
						}
					}

					resolve();
				});
			} catch (err) {
				console.error('Draft Error:', err);
				if (interval) clearTimeout(interval);
				resolve();
			}
		});
	}

	private async assignGroups(
		players: Player[],
		selections: Map<string, Map<string, string>>,
		numberOfGroups: number
	): Promise<Map<string, number>> {
		const assignedGroups = new Map<string, number>();

		// Count the number of bans per group
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

		// Determine which groups are banned based on votes
		if (numberOfBans > 0) {
			const sortedBans = Array.from(banCounts.entries()).sort((a, b) => b[1] - a[1]);
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

			// Send ban tally safely
			const voteCountLines = Array.from(banCounts.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([groupNumber, count]) => `${String.fromCharCode(65 + groupNumber)}: ${count} vote${count === 1 ? '' : 's'}`);

			const bannedLetters = Array.from(bannedGroups).sort((a, b) => a - b).map(g => String.fromCharCode(65 + g));
			let content = `__**Ban Vote Tally**__\n${voteCountLines.join('\n')}\n\n`;
			content += bannedLetters.length > 0 ? `__**Banned Groups**__: ${bannedLetters.join(', ')}` : "No groups were banned.";

			await safe(this.channel.send({ content }), "Send ban tally message");
		}

		// Track available groups
		const availableGroups = new Set<number>();
		for (let i = 0; i < numberOfGroups; i++) {
			if (!bannedGroups.has(i)) availableGroups.add(i);
		}

		// Assign groups to players based on selections or randomly if necessary
		for (const player of players) {
			const userId = player.user.id;
			const userSelections = selections.get(userId);

			if (userSelections) {
				const picks = Array.from(userSelections.entries())
					.filter(([dropdownId]) => dropdownId.startsWith("Pick"))
					.sort((a, b) => Number(a[0].slice(5)) - Number(b[0].slice(5)));

				for (const [_, label] of picks) {
					const groupNumber = label.charCodeAt(0) - 65;
					if (availableGroups.has(groupNumber)) {
						assignedGroups.set(userId, groupNumber);
						availableGroups.delete(groupNumber);
						break;
					}
				}
			}

			// Assign random group if no valid selection was made
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
