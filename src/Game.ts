import {
	Client,
	Guild,
	TextChannel,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
	MessageComponentInteraction,
	Interaction,
	Message,
	StringSelectMenuBuilder
} from 'discord.js';
import { Tier, Pet, Food, Deck } from './Deck';
import { Player } from './Player';
import sharp = require('sharp');
import { safe } from './Silver';

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
		channel: TextChannel
	) {
		this.players = players;
		this.guild = guild;
		this.channel = channel;
		this.client = client;
		this.turn = 0;

		const packs = players.reduce((common, player) => {
			return common.filter((num) => player.packs.includes(num));
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

		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeGameButton);

		const closingMessage = await safe(
			this.channel.send({
				content: `Click the button to close the channel when finished:`,
				components: [buttonRow]
			}),
			'Send end game button'
		);
		if (!closingMessage) return;

		const collector = closingMessage.createMessageComponentCollector();

		collector.on('collect', async (interaction: MessageComponentInteraction) => {
			if (
				this.players.some((player) => player.user.id === interaction.user.id) ||
				interaction.guild?.members.cache.get(interaction.user.id)?.permissions.has('1321368228236230666')
			) {
				await safe(this.deleteGame(), 'Delete game');
			} else {
				await safe(
					interaction.reply({
						content: 'You do not have permission to interact with this menu!',
						ephemeral: true
					}),
					'Reply no permission'
				);
			}
		});
	}

	protected async deleteGame() {
		await safe(this.channel.delete(), 'Delete game channel');
	}

	protected async pickOption(player: Player, tier: number, choice: number, selected: number[]) {
		if (choice === -1) {
			const availableChoices = Array.from({ length: this.deck.groups[tier].length }, (_, i) => i).filter(
				(num) => !selected.includes(num)
			);
			choice = availableChoices[Math.floor(Math.random() * availableChoices.length)];
		}

		selected.push(choice);
		const grouping: Tier = this.deck.groups[tier][choice];

		player.deck.tiers[tier].pets.push(...grouping.pets);
		player.deck.tiers[tier].foods.push(...grouping.foods);

		await safe(
			this.channel.send(`${this.getNames(grouping.pets)} ${this.getNames(grouping.foods)} picked by ${player.user.displayName}.`),
			'Send pick message'
		);
	}

	protected async banOption(tier: number, choice: number, selected: number[]) {
		selected.push(choice);
		const grouping: Tier = this.deck.groups[tier][choice];
		await safe(
			this.channel.send(`${this.getNames(grouping.pets)} ${this.getNames(grouping.foods)} has been banned.`),
			'Send ban message'
		);
	}

	protected async sendTeam(player: Player) {
		try {
			const teamImage = await this.getTeam(player.deck.tiers);
			return {
				content: `${player.user.displayName}'s Team:`,
				files: [{ attachment: teamImage }],
				ephemeral: true
			};
		} catch (error) {
			console.error('Error generating team image:', error);
			throw new Error('Failed to generate the team image.');
		}
	}

	protected getNames(array: Pet[] | Food[]): string {
		return `[${array.map((obj) => obj.name).join(', ')}]`;
	}

	private async loadImageSafe(path: string, width: number, height: number): Promise<Buffer> {
		try {
			return await sharp(path)
				.resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
				.toBuffer();
		} catch {
			return await sharp({
				create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
			}).png().toBuffer();
		}
	}

	protected async getTeam(tiers: Tier[]): Promise<Buffer> {
		const overlayWidth = 46;
		const overlayHeight = 46;
		const horizontalSpacing = 3;
		const verticalSpacing = 15;

		const allOverlays: { input: Buffer; top: number; left: number }[] = [];

		for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
			const { pets, foods } = tiers[tierIndex];
			const tierTop = tierIndex * (overlayHeight + verticalSpacing) + verticalSpacing;

			const numberPath = `./data/sprites/numbers/${tierIndex + 1}.png`;
			allOverlays.push({ input: await this.loadImageSafe(numberPath, overlayWidth, overlayHeight), top: tierTop, left: 15 });

			const petBuffers = await Promise.all(
				pets.map(async (pet, idx) => ({
					input: await this.loadImageSafe(`./data/sprites/pets/${pet.name.replace(/[^a-zA-Z0-9]/g, '')}.png`, overlayWidth, overlayHeight),
					top: tierTop,
					left: (idx + 1) * (overlayWidth + horizontalSpacing) + 10
				}))
			);

			const foodBuffers = await Promise.all(
				foods.map(async (food, idx) => ({
					input: await this.loadImageSafe(`./data/sprites/foods/${food.name.replace(/[^a-zA-Z0-9]/g, '')}.png`, overlayWidth, overlayHeight),
					top: tierTop,
					left: (idx + 11) * (overlayWidth + horizontalSpacing) + 32
				}))
			);

			allOverlays.push(...petBuffers, ...foodBuffers);
		}

		return sharp('./data/sprites/PetViewer.png')
			.resize({ width: 800, height: tiers.length * (overlayHeight + verticalSpacing) + verticalSpacing })
			.composite(allOverlays)
			.toBuffer();
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
				skipped++;
				continue;
			}

			const { pets, foods } = tiers[tierIndex];
			const tierTop = (tierIndex - skipped) * (overlayHeight + verticalSpacing) + verticalSpacing;

			const numberPath = `./data/sprites/numbers/${String.fromCharCode(97 + tierIndex)}.png`;
			allOverlays.push({ input: await this.loadImageSafe(numberPath, overlayWidth, overlayHeight), top: tierTop, left: 15 });

			const petBuffers = await Promise.all(
				pets.map(async (pet, idx) => ({
					input: await this.loadImageSafe(`./data/sprites/pets/${pet.name.replace(/[^a-zA-Z0-9]/g, '')}.png`, overlayWidth, overlayHeight),
					top: tierTop,
					left: (idx + 1) * (overlayWidth + horizontalSpacing) + 10
				}))
			);

			const foodBuffers = await Promise.all(
				foods.map(async (food, idx) => ({
					input: await this.loadImageSafe(`./data/sprites/foods/${food.name.replace(/[^a-zA-Z0-9]/g, '')}.png`, overlayWidth, overlayHeight),
					top: tierTop,
					left: (idx + 11) * (overlayWidth + horizontalSpacing) + 32
				}))
			);

			allOverlays.push(...petBuffers, ...foodBuffers);
		}

		return sharp('./data/sprites/PetViewer.png')
			.resize({ width: 800, height: (tiers.length - skipped) * (overlayHeight + verticalSpacing) + verticalSpacing })
			.composite(allOverlays)
			.toBuffer();
	}

	protected async removePlayersWrite() {
		for (const player of this.players) {
			await safe(this.channel.permissionOverwrites.edit(player.user.id, { SendMessages: false, AddReactions: false }), 'Remove player write permissions');
		}
	}

	protected async addPlayersWrite() {
		for (const player of this.players) {
			await safe(this.channel.permissionOverwrites.edit(player.user.id, { SendMessages: true, AddReactions: true }), 'Add player write permissions');
		}
	}

	protected getHammerTime(future: number): string {
		return `<t:${Math.floor((Date.now() + future) / 1000)}:R>`;
	}
}