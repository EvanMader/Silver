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
import { challenges, matchmakingQueue } from './HandleCommands';

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

		const playerIds = new Set(players.map(player => player.user.id));
		for (let i = challenges.length - 1; i >= 0; i--) {
			const challenge = challenges[i];
			if (playerIds.has(challenge.challenger.user.id) || playerIds.has(challenge.challenged.user.id)) {
				clearTimeout(challenge.timeoutId);
				challenges.splice(i, 1);
			}
		}
		
		for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
			if (playerIds.has(matchmakingQueue[i].user.id)) {
			matchmakingQueue.splice(i, 1);
			}
		}
	}

	public getTurn() {
		return this.turn % this.players.length;
	}

	protected async endGame(gameList: Game[]) {
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

				this.deleteGame(gameList);
			});
		})
	}

	protected deleteGame(gameList: Game[]) {
		gameList.splice(gameList.findIndex((game) => game === this, 1));
		this.channel.delete();
	}


	protected async pickOption(player: Player, tier: number, choice: number) {
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

	protected async banOption(player: Player, tier: number, choice: number) {
		let grouping: Tier = this.deck.groups[tier].splice(choice - 1, 1)[0];
		await this.channel.send(
			`${this.getNames(grouping.pets)} ${this.getNames(
				grouping.foods
			)} has been banned.`
		);
	}

	protected async sendTeam(player: Player) {
		this.channel.send({
			content: `${player.user.displayName}'s Team:`,
			files: [{
				attachment: await this.getImage(player.deck.tiers)
			}]
		});
	}

	protected getNames(array: Pet[] | Food[]): string {
		return '[' + array.map((obj) => obj.name).join(', ') + ']';
	}

	protected async getImage(tiers: Tier[]): Promise<Buffer> {
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
