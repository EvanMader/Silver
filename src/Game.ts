import {
	Client,
	Guild,
	TextChannel,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	MessageComponentInteraction,
} from 'discord.js';
import { Tier, Pet, Food, Deck } from './Deck';
import { Player } from './Player';
import sharp = require('sharp');

export class Game {
	players: Player[];
	guild: Guild;
	channel: TextChannel;
	client: Client;
	deck: Deck;
	turn: number;
	packs: number[];

	protected constructor(
		players: Player[],
		client: Client,
		guild: Guild,
		channel: TextChannel,
	) {
		this.players = players;
		this.guild = guild;
		this.channel = channel;
		this.client = client;
		this.turn = 0;

		const packs = players.reduce((common, player) => {
			return common.filter(num => player.packs.includes(num));
		}, players[0].packs);

		this.deck = new Deck(true, packs);
		this.packs = packs;
	}

	public getTurn() {
		return this.turn % this.players.length;
	}

	protected async endGame() {
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
				if (!this.players.some(player => player.user.id === interaction.user.id) &&
					!interaction.guild?.members.cache.get(interaction.user.id)?.permissions.has('1321368228236230666')
				) {
					await interaction.reply({
						content: 'You do not have permission to interact with this menu!',
						ephemeral: true,
					});
					return;
				}

				this.deleteGame();
			});
		})
	}

	protected deleteGame() {
		this.channel.delete();
	}

	protected async pickOption(player: Player, tier: number, choice: number, selected: number[]) {
		if (choice === -1) {
			const availableChoices = Array.from({ length: this.deck.groups[tier].length }, (_, i) => i)
				.filter(num => !selected.includes(num));

			choice = availableChoices[Math.floor(Math.random() * availableChoices.length)];
		}

		selected.push(choice);
		let grouping: Tier = this.deck.groups[tier][choice];

		for (const pet of grouping.pets) {
			player.deck.tiers[tier].pets.push(pet);
		}
		for (const food of grouping.foods) {
			player.deck.tiers[tier].foods.push(food);
		}
		await this.channel.send(
			`${this.getNames(grouping.pets)} ${this.getNames(
				grouping.foods
			)} has been picked by ${player.user.displayName}.`
		);
	}

	protected async banOption(tier: number, choice: number, selected: number[]) {
		selected.push(choice);
		let grouping: Tier = this.deck.groups[tier][choice];
		await this.channel.send(
			`${this.getNames(grouping.pets)} ${this.getNames(
				grouping.foods
			)} has been banned.`
		);
	}

	protected async sendTeam(player: Player) {
		try {
			const teamImage = await this.getTeam(player.deck.tiers);
			return {
				content: `${player.user.displayName}'s Team:`,
				files: [
					{
						attachment: teamImage
					}
				],
				ephemeral: true
			};
		} catch (error) {
			console.error('Error generating team image:', error);
			throw new Error('Failed to generate the team image.');
		}
	}

	protected getNames(array: Pet[] | Food[]): string {
		return '[' + array.map((obj) => obj.name).join(', ') + ']';
	}

	protected async getTeam(tiers: Tier[]): Promise<Buffer> {
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

	protected async getGroups(tiers: Tier[], selected: number[]): Promise<Buffer> {
		const overlayWidth = 46;
		const overlayHeight = 46;
		const horizontalSpacing = 3;
		const verticalSpacing = 15;

		const allOverlays: { input: Buffer; top: number; left: number }[] = [];
		let skipped = 0;

		for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
			if (selected.includes(tierIndex)) {
				skipped += 1;
				continue;
			}
			const { pets, foods } = tiers[tierIndex];

			const tierTop =
				(tierIndex - skipped) * (overlayHeight + verticalSpacing) + verticalSpacing;

			const numberImagePath = `./data/sprites/numbers/${
				String.fromCharCode(97 + tierIndex)
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
					(tiers.length - skipped) * (overlayHeight + verticalSpacing) +
					verticalSpacing,
			})
			.composite(allOverlays)
			.toBuffer();

		return resultBuffer;
	}

	protected async removePlayersWrite() {
		for (const player of this.players) {
			this.channel.permissionOverwrites.edit(player.user.id, {
				SendMessages: false,
				AddReactions: false
			})
		}
	}

	protected async addPlayersWrite() {
		for (const player of this.players) {
			this.channel.permissionOverwrites.edit(player.user.id, {
				SendMessages: true,
				AddReactions: true
			})
		}
	}

	protected getHammerTime(future: number): string {
		return `<t:${Math.floor((Date.now() + future) / 1000)}:R>`
	}
}