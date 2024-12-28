import {
	ChannelType,
	Client,
	Guild,
	Message,
	PermissionFlagsBits,
	TextChannel,
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
					deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
				},
				{
					id: player1.user.id,
					allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
				},
				{
					id: player2.user.id,
					allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
				},
			],
		});
		const packs: number[] = player1.packs.filter((num) => player2.packs.includes(num));

		const current: Game = new Game(player1, player2, client, guild, channel, packs);
		current.startGame();
		return current;
	}

	public getTurn() {
		return this.turn % 2;
	}

	private async startGame() {
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

			let index = Math.floor( Math.random() * this.deck.tiers[i].foods.length);
			if ( i === 4 && this.deck.tiers[i].foods.findIndex( (food) => food.name === 'Chocolate') != -1) 
				index = this.deck.tiers[i].foods.findIndex( (food) => food.name === 'Chocolate');
			this.player1.deck.tiers[i].foods.push( this.deck.tiers[i].foods[index]);
			this.player2.deck.tiers[i].foods.push( this.deck.tiers[i].foods[index]);
			this.deck.tiers[i].foods.splice(index, 1);
		}
		await this.channel.send({ 
			content: '__**Randomly Selected 7 Pets and 1 Food Per Tier**__',
			files: [{
				attachment: await this.getImage(this.player1.deck.tiers),
			}]
		});

		let order: number[] = [0, 1, 2, 3, 4, 5];
		for (let i = order.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[order[i], order[randomIndex]] = [order[randomIndex], order[i]];
		}

		this.deck.constructGroups();

		let timer: number = 90000;
		for (let i = 0; i < 6; i++) {
			await this.channel.send(`# TIER ${order[i] + 1}`);
			try {
				if (this.getTurn()) await this.banGroup(this.player1, order[i], timer);
				else await this.banGroup(this.player2, order[i], timer);
				this.turn++;
			} catch (e) {
				this.deleteGame(gameList);
				return;
			}

			try {
				if (this.getTurn()) await this.pickGroup(this.player1, order[i], timer);
				else await this.pickGroup(this.player2, order[i], timer);
				this.turn++;
			} catch (e) {
				this.deleteGame(gameList);
				return;
			}

			timer = 60000;

			try {
				if (this.getTurn()) await this.pickGroup(this.player1, order[i], timer);
				else await this.pickGroup(this.player2, order[i], timer);
				this.turn++;
			} catch (e) {
				this.deleteGame(gameList);
				return;
			}
		}

		await this.channel.send(`<@${ this.player1.user.id }> Pack Code:`);
		await this.channel.send(`${ this.player1.deck.getCode() }`);
		await this.channel.send(`<@${ this.player2.user.id }> Pack Code:`);
		await this.channel.send(`${ this.player2.deck.getCode() }`);

		await this.endGame(gameList);
	}

	private async endGame(gameList: Game[]) {
		await this.channel.send(`Please send "!end" to close the game.`);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				return (
					message.channel.id === this.channel.id &&
					message.content.startsWith('!end')
				);
			};

			const collector = this.channel.createMessageCollector({ filter });

			collector?.on('collect', async (message: Message) => {
				this.deleteGame(gameList);
				resolve();
			});
		});
	}

	private deleteGame(gameList: Game[]) {
		gameList.splice(gameList.findIndex(game => game === this, 1));
		this.channel.delete()
	}

	private async banGroup(player: Player, tier: number, timerLength: number) {
		await this.channel.send({
			content: `<@${player.user.id}> Select one tier ${tier + 1} group to **ban**!`,
			files:[{
				attachment: await this.getImage(this.deck.groups[tier]),
			}]
		});

		let remainingTime = timerLength; 
		const countdown = await this.channel.send(`You have ${Math.floor(remainingTime / 1000)} seconds remaining.`);

		const updateCountdown = async () => {
			remainingTime -= 5000;
			const remainingSeconds = Math.floor(remainingTime / 1000);

			if (remainingTime >= 0 && countdown !== null) {
				try {
					await countdown.edit(`You have ${remainingSeconds} seconds remaining.`);
					interval = setTimeout(updateCountdown, 5000);
				} catch {}
			}
		};

		let interval = setTimeout(updateCountdown, 5000);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				return (
					message.author.id === player.user.id &&
					message.channel.id === this.channel.id
				);
			};

			const collector = this.channel.createMessageCollector({
				filter,
				time: timerLength + 1000,
			});

			collector?.on('collect', async (message: Message) => {
				if (message.content.startsWith('!end')) collector.stop('end');
				if (message.content.startsWith("!team")) {
					await this.channel.send({
						content: `<@${player.user.id}> Current Team:`,
						files: [{
							attachment: await this.getImage(player.deck.tiers),
						}]
					});
				}

				let choice: number = parseInt(message.content.substring(5));
				if (message.content.startsWith("!ban ") && !isNaN(choice) && choice >= 0 && choice <= this.deck.groups[tier].length) {
					if (choice === 0) choice = Math.floor(Math.random() * this.deck.groups[tier].length + 1)
					let grouping: Tier = this.deck.groups[tier].splice(choice - 1, 1)[0];
					await this.channel.send( `${this.getNames(grouping.pets)} ${this.getNames( grouping.foods)} has been banned.`);

					collector.stop('Success');
				}
			});

			collector?.on('end', async (collected, reason) => {
				clearTimeout(interval);
				await countdown.delete();
				if (reason === 'time') {
					await this.channel.send('You took too long to respond!\nNothing was banned.');
					resolve();
				} else if (reason === 'Success') {
					resolve();
				} else if (reason == 'end') {
					reject();
				} else {
					console.log('Collector ended due to:', reason);
				}

				reject();
			});
		});
	}

	private async pickGroup(player: Player, tier: number, timerLength: number) {
		await this.channel.send({
			content: `<@${player.user.id}> Select one tier ${tier + 1} group to **pick**!`,
			files:[{
				attachment: await this.getImage(this.deck.groups[tier]),
			}]
		});

		let remainingTime = timerLength; 
		const countdown = await this.channel.send(`You have ${Math.floor(remainingTime / 1000)} seconds remaining.`);

		const updateCountdown = async () => {
			remainingTime -= 5000;
			const remainingSeconds = Math.floor(remainingTime / 1000);

			if (remainingTime >= 0 && countdown !== null) {
				try {
					await countdown.edit(`You have ${remainingSeconds} seconds remaining.`);
					interval = setTimeout(updateCountdown, 5000);
				} catch {}
			}
		};

		let interval = setTimeout(updateCountdown, 5000);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				return (
					message.author.id === player.user.id &&
					message.channel.id === this.channel.id
				);
			};

			const collector = this.channel.createMessageCollector({
				filter,
				time: timerLength + 1000,
			});

			collector?.on('collect', async (message: Message) => {
				if (message.content.startsWith('!end')) collector.stop('end');
				if (message.content.startsWith("!team")) {
					await this.channel.send({
						content: `<@${player.user.id}> Current Team:`,
						files: [{
							attachment: await this.getImage(player.deck.tiers),
						}]
					});
				}

				let choice: number = parseInt(message.content.substring(6));
				if (message.content.startsWith("!pick ") && !isNaN(choice) && choice >= 0 && choice <= this.deck.groups[tier].length) {
					if (choice === 0) choice = Math.floor(Math.random() * this.deck.groups[tier].length + 1)

					await this.pickOption(player, tier, choice);
					collector.stop('Success');
				}
			});

			collector?.on('end', async (collected, reason) => {
				clearTimeout(interval);
				await countdown.delete();
				if (reason === 'time') {
					await this.channel.send('You took too long to respond!');
					await this.pickOption(player, tier, 0);
					resolve();
				} else if (reason === 'Success') {
					resolve();
				} else if (reason == 'end') {
					reject();
				} else {
					console.log('Collector ended due to:', reason);
				}

				reject();
			});
		});
	}

	private async pickOption(player: Player, tier: number, choice: number) {
		let grouping: Tier = this.deck.groups[tier].splice( choice - 1, 1)[0];

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

	private getNames(array: Pet[] | Food[]): string {
		return '[' + array.map((obj) => obj.name).join(', ') + ']';
	}

	private async getImage(tiers: Tier[]): Promise<Buffer> {
		const overlayWidth = 42;
		const overlayHeight = 42;
		const horizontalSpacing = 5;
		const verticalSpacing = 10;

		const allOverlays: { input: Buffer; top: number; left: number }[] = [];

		for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
			const { pets, foods } = tiers[tierIndex];

			const tierTop = tierIndex * (overlayHeight + verticalSpacing) + verticalSpacing;

			const numberImagePath = `./data/sprites/numbers/${tierIndex + 1}.png`;
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

				const petLeft = (petIndex + 1) * (overlayWidth + horizontalSpacing) + 20;

				return sharp(imgPath)
					.resize(overlayWidth, overlayHeight)
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

				const foodLeft = (foodIndex + 12) * (overlayWidth + horizontalSpacing);

				return sharp(imgPath)
					.resize(overlayWidth, overlayHeight)
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
			.resize({ width: 800, height: tiers.length * (overlayHeight + verticalSpacing) + verticalSpacing })
			.composite(allOverlays)
			.toBuffer();

		return resultBuffer;
	}
}
