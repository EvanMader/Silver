import {
	ChannelType,
	Client,
	Guild,
	Message,
	PermissionFlagsBits,
	TextChannel,
	User,
} from 'discord.js';
import { Tier, Pet, Food, Deck } from './Deck';
import { Player } from './Player';
import { gameList } from './HandleCommands';

export class Game {
	player1: Player;
	player2: Player;
	guild: Guild;
	channel: TextChannel;
	client: Client;
	deck: Deck;
	turn: number;

	private constructor(
		player1: Player,
		player2: Player,
		client: Client,
		guild: Guild,
		channel: TextChannel,
	) {
		this.player1 = player1;
		this.player2 = player2;
		this.guild = guild;
		this.channel = channel;
		this.client = client;
		this.deck = new Deck(true);
		this.turn = Math.floor(Math.random() * 2);
	}

	public static async create(
		user1: User,
		user2: User,
		client: Client,
		guild: Guild
	) {
		const player1 = new Player(user1);
		const player2 = new Player(user2);

		const channel = await guild.channels.create({
			parent: '1320478069236039814',
			type: ChannelType.GuildText,
			name: `${player1.user.displayName} vs ${player2.user.displayName}`,
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: player1.user.id,
					allow: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: player2.user.id,
					allow: [PermissionFlagsBits.ViewChannel],
				},
			],
		});

		const current: Game = new Game(player1, player2, client, guild, channel);
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
		await this.channel.send(`__**Randomly Selected 7 Pets and 1 Food Per Tier**__\n ${this.getGroups(this.player1.deck.tiers)}`);

		let order: number[] = [0, 1, 2, 3, 4, 5];
		for (let i = order.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[order[i], order[randomIndex]] = [order[randomIndex], order[i]];
		}

		this.deck.constructGroups();

		for (let i = 0; i < 6; i++) {
			await this.channel.send(`__**TIER ${order[i] + 1}**__\n`);
			if (this.getTurn()) await this.banGroup(this.player1, order[i]);
			else await this.banGroup(this.player2, order[i]);
			this.turn++;

			if (this.getTurn()) await this.pickGroup(this.player1, order[i]);
			else await this.pickGroup(this.player2, order[i]);
			this.turn++;

			if (this.getTurn()) await this.pickGroup(this.player1, order[i]);
			else await this.pickGroup(this.player2, order[i]);
			this.turn++;
		}

		await this.channel.send(`<@${ this.player1.user.id }> Pack Code:`);
		await this.channel.send(`${ this.player1.deck.getCode() }`);
		await this.channel.send(`<@${ this.player2.user.id }> Pack Code:`);
		await this.channel.send(`${ this.player2.deck.getCode() }`);

		await this.endGame();
		gameList.splice(gameList.findIndex(game => game === this, 1));
	}

	private async endGame() {
		await this.channel.send(`Please send "!end" to close the game.`);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				return (
					message.channel.id === this.channel.id &&
					message.content.startsWith('!end ')
				);
			};

			const collector = this.channel.createMessageCollector();

			collector?.on('collect', async (message: Message) => {
				if (message.content.startsWith("!end")) {
					this.channel.delete()
					resolve();
				}
			});
		});
	}

	private async banGroup(player: Player, tier: number) {
		await this.channel.send(
			`<@${player.user.id}> Select one tier ${
				tier + 1
			} group to ban!\nGroups Left:\n${this.getGroups(
				this.deck.groups[tier]
			)}`
		);

		const timerLength = 60000;
		let remainingTime = timerLength; 
		const countdown = await this.channel.send(`You have ${Math.floor(remainingTime / 1000)} seconds remaining.`);

		const updateCountdown = () => {
			remainingTime -= 5000;
			const remainingSeconds = Math.floor(remainingTime / 1000);

			if (remainingTime >= 0) {
				countdown.edit(`You have ${remainingSeconds} seconds remaining.`).catch();
				interval = setTimeout(updateCountdown, 5000);
			}
		};

		let interval = setTimeout(updateCountdown, 5000);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				const choice: number = parseInt(message.content.substring(5));
				return (
					message.author.id === player.user.id &&
					message.channel.id === this.channel.id &&
					(message.content.startsWith('!ban ') || message.content.startsWith("!team"))
				);
			};

			const collector = this.channel.createMessageCollector({
				filter,
				time: timerLength,
			});

			collector?.on('collect', async (message: Message) => {
				if (message.content.startsWith("!team")) {
					await this.channel.send(`<@${player.user.id}> Current Team:\n${this.getGroups(player.deck.tiers)}`)
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
				countdown.delete();
				if (reason === 'time') {
					await this.channel.send('You took too long to respond!\nNothing was banned.');
					resolve();
				} else if (reason === 'Success') {
					resolve();
				} else {
					console.log('Collector ended due to:', reason);
				}

				reject();
			});
		});
	}

	private async pickGroup(player: Player, tier: number) {
		await this.channel.send(`<@${player.user.id}> Select one tier ${ tier + 1 } group to pick!\nGroups Left:\n${this.getGroups( this.deck.groups[tier])}`);

		const timerLength = 60000;
		let remainingTime = timerLength; 
		const countdown = await this.channel.send(`You have ${Math.floor(remainingTime / 1000)} seconds remaining.`);

		const updateCountdown = () => {
			remainingTime -= 5000;
			const remainingSeconds = Math.floor(remainingTime / 1000);

			if (remainingTime >= 0) {
				countdown.edit(`You have ${remainingSeconds} seconds remaining.`).catch();
				interval = setTimeout(updateCountdown, 5000);
			}
		};

		let interval = setTimeout(updateCountdown, 5000);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				const choice: number = parseInt(message.content.substring(6));
				return (
					message.author.id === player.user.id &&
					message.channel.id === this.channel.id &&
					(message.content.startsWith('!pick ') || message.content.startsWith('!team'))
				);
			};

			const collector = this.channel.createMessageCollector({
				filter,
				time: timerLength,
			});

			collector?.on('collect', async (message: Message) => {
				if (message.content.startsWith("!team")) {
					await this.channel.send(`<@${player.user.id}> Current Team:\n${this.getGroups(player.deck.tiers)}`)
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
				countdown.delete();
				if (reason === 'time') {
					await this.channel.send('You took too long to respond!');
					await this.pickOption(player, tier, 0);
					resolve();
				} else if (reason === 'Success') {
					resolve();
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

	private getGroups(tiers: Tier[]): string {
		let out: string = '';

		let i: number = 0;
		for (const tier of tiers) {
			i++;
			const petNames = tier.pets.map((pet) => pet.name).join(', ');
			const foodNames = tier.foods.map((food) => food.name).join(', ');
			out += `${i}: [${petNames}] [${foodNames}]\n`;
		}

		return out;
	}
}
