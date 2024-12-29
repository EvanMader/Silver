import {
	ChannelType,
	Client,
	Guild,
	Message,
	PermissionFlagsBits,
	TextChannel,
	StringSelectMenuBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	MessageComponentInteraction,
	Collector,
} from 'discord.js';
import { Tier, Pet, Food, Deck } from './Deck';
import { Player } from './Player';
import { gameList } from './HandleCommands';
import sharp = require('sharp');

export class Game {
	player1: Player;
	player2: Player;
	guild: Guild;
	channel: TextChannel;
	client: Client;
	deck: Deck;
	turn: number;
	packs: number[];

	private constructor(
		player1: Player,
		player2: Player,
		client: Client,
		guild: Guild,
		channel: TextChannel,
		packs: number[]
	) {
		this.player1 = player1;
		this.player2 = player2;
		this.guild = guild;
		this.channel = channel;
		this.client = client;
		this.deck = new Deck(true, packs);
		this.turn = Math.floor(Math.random() * 2);
		this.packs = packs;
	}

	public static async create(
		player1: Player,
		player2: Player,
		client: Client,
		guild: Guild
	) {
		const channel = await guild.channels.create({
			parent: '1320478069236039814',
			type: ChannelType.GuildText,
			name: `${player1.user.displayName} vs ${player2.user.displayName}`,
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
				{
					id: player1.user.id,
					allow: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
				{
					id: player2.user.id,
					allow: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
			],
		});
		const packs: number[] = player1.packs.filter((num) =>
			player2.packs.includes(num)
		);

		const current: Game = new Game(
			player1,
			player2,
			client,
			guild,
			channel,
			packs
		);
		current.startGame();
		return current;
	}

	public getTurn() {
		return this.turn % 2;
	}

	private async startGame() {
		this.endGame(gameList);

		for (let i = 0; i < 6; i++) {
			for (let j = 0; j < 7; j++) {
				let index = Math.floor(
					Math.random() * this.deck.tiers[i].pets.length
				);
				this.player1.deck.tiers[i].pets.push(
					this.deck.tiers[i].pets[index]
				);
				this.player2.deck.tiers[i].pets.push(
					this.deck.tiers[i].pets[index]
				);
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
			this.player1.deck.tiers[i].foods.push(
				this.deck.tiers[i].foods[index]
			);
			this.player2.deck.tiers[i].foods.push(
				this.deck.tiers[i].foods[index]
			);
			this.deck.tiers[i].foods.splice(index, 1);
		}
		await this.channel.send({
			content: '__**Randomly Selected 7 Pets and 1 Food Per Tier**__',
			files: [
				{
					attachment: await this.getImage(this.player1.deck.tiers),
				},
			],
		});

		let order: number[] = [0, 1, 2, 3, 4, 5];
		for (let i = order.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[order[i], order[randomIndex]] = [order[randomIndex], order[i]];
		}

		this.deck.constructGroups();

		let timer: number = 90000;
		for (let i = 0; i < 6; i++) {
			await this.channel.send(`__# TIER ${order[i] + 1}__`);
			try {
				if (this.getTurn())
					await this.selectGroup(
						this.player1,
						order[i],
						timer,
						false
					);
				else
					await this.selectGroup(
						this.player2,
						order[i],
						timer,
						false
					);
				this.turn++;
			} catch (e) { return; }

			try {
				if (this.getTurn())
					await this.selectGroup(this.player1, order[i], timer, true);
				else
					await this.selectGroup(this.player2, order[i], timer, true);
				this.turn++;
			} catch (e) { return; }

			timer = 60000;

			try {
				if (this.getTurn())
					await this.selectGroup(this.player1, order[i], timer, true);
				else
					await this.selectGroup(this.player2, order[i], timer, true);
				this.turn++;
			} catch (e) { return; }
		}

		await this.channel.send(`<@${this.player1.user.id}> Pack Code:`);
		await this.channel.send(`${this.player1.deck.getCode()}`);
		await this.channel.send(`<@${this.player2.user.id}> Pack Code:`);
		await this.channel.send(`${this.player2.deck.getCode()}`);

		await this.endGame(gameList);
	}

	private async endGame(gameList: Game[]) {
		const closeGameButton = new ButtonBuilder()
			.setCustomId('close_game_button')
			.setLabel('Close Game')
			.setStyle(ButtonStyle.Danger);

		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			closeGameButton
		);

		const closingMessage = await this.channel.send({
			content: `Click the button to close the channel when you are finished:`,
			components: [buttonRow]
		});

		await new Promise<void>((resolve, reject) => {
			const collector = closingMessage.createMessageComponentCollector();

			collector.on('collect', async (interaction: MessageComponentInteraction) => {
				if (interaction.user !== this.player1.user &&
					interaction.user !== this.player2.user &&
					!interaction.guild?.members.cache.get(interaction.user.id)?.permissions.has('1321368228236230666')
				) {
					await interaction.reply({
						content: 'You do not have permission to interact with this menu!',
						ephemeral: true,
					});
					return;
				}

				this.deleteGame(gameList);
			});
		})
	}

	private deleteGame(gameList: Game[]) {
		gameList.splice(gameList.findIndex((game) => game === this, 1));
		this.channel.delete();
	}

	private async selectGroup(
		player: Player,
		tier: number,
		timerLength: number,
		pick: boolean
	) {
		let remainingTime = timerLength;
		const countdown = await this.channel.send({
			content: `<@${player.user.id}> Select one tier ${
				tier + 1
			} group to ${pick ? 'pick' : 'ban'}! You have ${Math.floor(remainingTime / 1000)} seconds remaining.`,
			files: [
				{
					attachment: await this.getImage(this.deck.groups[tier]),
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
						} group to **${pick ? 'pick' : 'ban'}**! You have ${Math.floor(remainingTime / 1000)} seconds remaining.`,
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
				this.deck.groups[tier].map((group, index) => ({
					label: `Group ${index + 1}`,
					value: `${index}`,
				}))
			);

		const submitButton = new ButtonBuilder()
			.setCustomId('submit')
			.setLabel('Submit')
			.setStyle(ButtonStyle.Primary);

		const teamButton = new ButtonBuilder()
			.setCustomId('team_button')
			.setLabel('Team')
			.setStyle(ButtonStyle.Success);

		const oppButton = new ButtonBuilder()
			.setCustomId('opp_button')
			.setLabel('Opps')
			.setStyle(ButtonStyle.Danger);

		const menuRow =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				selectMenu
			);
		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			submitButton,
			teamButton,
			oppButton
		);

		const actionMessage = await this.channel.send({
			content:
				`**${pick ? 'Pick' : 'Ban'}** your group:`,
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
							await interaction.deferUpdate();
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
								if (pick)
									await this.pickOption(
										player,
										tier,
										parseInt(selectedValue) + 1
									);
								else
									await this.banOption(
										player,
										tier,
										parseInt(selectedValue) + 1
									);
								collector.stop('Success');
							}
						} else if (
							interaction.isButton() &&
							interaction.customId === 'team_button'
						) {
							await this.sendTeam(player);
							await interaction.deferUpdate();
						} else if (
							interaction.isButton() &&
							interaction.customId === 'opp_button'
						) {
							if (player.user == this.player1.user) await this.sendTeam(this.player2);
							else await this.sendTeam(this.player1);
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
					if (pick) await this.pickOption(player, tier, 0);
					await this.channel.send('You took too long to respond!');
					resolve();
				} else if (reason === 'Success') {
					resolve();
				} else {
					console.log('Rejected select group for the following reason: ', reason);
					reject();
				}
			});
		});
	}

	private async pickOption(player: Player, tier: number, choice: number) {
		let grouping: Tier = this.deck.groups[tier].splice(choice - 1, 1)[0];

		for (const pet of grouping.pets) {
			player.deck.tiers[tier].pets.push(pet);
		}
		for (const food of grouping.foods) {
			player.deck.tiers[tier].foods.push(food);
		}
		await this.channel.send(
			`${this.getNames(grouping.pets)} ${this.getNames(
				grouping.foods
			)} has been picked.`
		);
	}

	private async banOption(player: Player, tier: number, choice: number) {
		let grouping: Tier = this.deck.groups[tier].splice(choice - 1, 1)[0];
		await this.channel.send(
			`${this.getNames(grouping.pets)} ${this.getNames(
				grouping.foods
			)} has been banned.`
		);
	}

	private async sendTeam(player: Player) {
		this.channel.send({
			content: `${player.user.displayName}'s Team:`,
			files: [{
				attachment: await this.getImage(player.deck.tiers)
			}]
		});
	}

	private getNames(array: Pet[] | Food[]): string {
		return '[' + array.map((obj) => obj.name).join(', ') + ']';
	}

	private async getImage(tiers: Tier[]): Promise<Buffer> {
		const overlayWidth = 46;
		const overlayHeight = 46;
		const horizontalSpacing = 3;
		const verticalSpacing = 15;

		const allOverlays: { input: Buffer; top: number; left: number }[] = [];

		for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
			const { pets, foods } = tiers[tierIndex];

			const tierTop =
				tierIndex * (overlayHeight + verticalSpacing) + verticalSpacing;

			const numberImagePath = `./data/sprites/numbers/${
				tierIndex + 1
			}.png`;
			const numberBuffer = await sharp(numberImagePath)
				.resize(overlayWidth, overlayHeight)
				.toBuffer();

			allOverlays.push({
				input: numberBuffer,
				top: tierTop,
				left: 15,
			});

			const petOverlays = pets.map(async (Pet, petIndex) => {
				const sanitizedPet = Pet.name
					.replace(/[^a-zA-Z0-9]/g, '')
					.replace(/\s+/g, '');
				const imgPath = `./data/sprites/pets/${sanitizedPet}.png`;

				const petLeft =
					(petIndex + 1) * (overlayWidth + horizontalSpacing) + 10;

				return sharp(imgPath)
					.resize(overlayWidth, overlayHeight, { fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0} })
					.toBuffer()
					.then((buffer) => ({
						input: buffer,
						top: tierTop,
						left: petLeft,
					}));
			});

			const foodOverlays = foods.map(async (Food, foodIndex) => {
				const sanitizedFood = Food.name
					.replace(/[^a-zA-Z0-9]/g, '')
					.replace(/\s+/g, '');
				const imgPath = `./data/sprites/foods/${sanitizedFood}.png`;

				const foodLeft =
					(foodIndex + 11) * (overlayWidth + horizontalSpacing) + 32;

				return sharp(imgPath)
					.resize(overlayWidth, overlayHeight, { fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0} })
					.toBuffer()
					.then((buffer) => ({
						input: buffer,
						top: tierTop,
						left: foodLeft,
					}));
			});

			const tierOverlays = [...petOverlays, ...foodOverlays];
			const tierBuffers = await Promise.all(tierOverlays);

			allOverlays.push(...tierBuffers);
		}

		const resultBuffer = await sharp('./data/sprites/PetViewer.png')
			.resize({
				width: 800,
				height:
					tiers.length * (overlayHeight + verticalSpacing) +
					verticalSpacing,
			})
			.composite(allOverlays)
			.toBuffer();

		return resultBuffer;
	}
}
