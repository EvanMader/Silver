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

export class Game {
	player1: Player;
	player2: Player;
	guild: Guild;
	channel: TextChannel | null;
	client: Client;
	deck: Deck;
	turn: number;

	public constructor(
		player1: User,
		player2: User,
		client: Client,
		guild: Guild
	) {
		this.player1 = new Player(player1);
		this.player2 = new Player(player2);
		this.guild = guild;
		this.channel = null;
		this.client = client;
		this.deck = new Deck(true);
		this.turn = Math.floor(Math.random() * 2);
	}

	public async initialize() {
		await this.createChannel();
		this.startGame();
	}

	private async createChannel() {
		const channel = await this.guild.channels.create({
			parent: '1320478069236039814',
			type: ChannelType.GuildText,
			name: `${this.player1.user.displayName} vs ${this.player2.user.displayName}`,
			permissionOverwrites: [
				{
					id: this.guild.roles.everyone.id,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: this.player1.user.id,
					allow: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: this.player2.user.id,
					allow: [PermissionFlagsBits.ViewChannel],
				},
			],
		});

		this.channel = channel;
	}

	public getTurn() {
		return this.turn % 2;
	}

	private async startGame() {
		let startingPets: string =
			'***Randomly Selected 7 Mutual Pets Per Tier:***\n';
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
			startingPets += `Tier ${i + 1}:\n${this.getNames(
				this.player1.deck.tiers[i].pets
			)}\n`;
		}
		await this.channel?.send(startingPets);

		let startingFood: string =
			'***Randomly Selected 1 Mutual Food Per Tier:***\n';
		for (let i = 0; i < 6; i++) {
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

			startingFood += `Tier ${i + 1}:\n${this.getNames(
				this.player1.deck.tiers[i].foods
			)}\n`;
		}
		await this.channel?.send(startingFood);

		let order: number[] = [0, 1, 2, 3, 4, 5];
		for (let i = order.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[order[i], order[randomIndex]] = [order[randomIndex], order[i]];
		}

		await this.deck.constructGroups();

		for (let i = 0; i < 6; i++) {
			await this.channel?.send(`__**TIER ${order[i] + 1}**__\n`);
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

		await this.channel?.send(
			`<@${
				this.player1.user.id
			}> Pack Code:\n${this.player1.deck.getCode()}\n\n<@${
				this.player2.user.id
			}> Pack Code:\n${this.player2.deck.getCode()}`
		);
	}

	private async banGroup(player: Player, tier: number) {
		await this.channel?.send(
			`<@${player.user.id}> Select one tier ${
				tier + 1
			} group to ban!\nYou have 180 seconds.\nGroups Left:\n${this.getGroups(
				this.deck.groups[tier]
			)}`
		);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				const choice: number = parseInt(message.content.substring(5));
				return (
					message.author.id === player.user.id &&
					message.channel.id === this.channel?.id &&
					message.content.startsWith('!ban ') &&
					!isNaN(choice) &&
					choice >= 0 &&
					choice < this.deck.groups[tier].length
				);
			};

			const collector = this.channel?.createMessageCollector({
				filter,
				time: 180000,
			});

			collector?.on('collect', async (message: Message) => {
				const choice: number = parseInt(message.content.substring(5));
				let grouping: Tier = this.deck.groups[tier].splice(
					choice - 1,
					1
				)[0];

				collector.stop('Success');
				await this.channel?.send(
					`${this.getNames(grouping.pets)} ${this.getNames(
						grouping.foods
					)} has been banned.`
				);
			});

			collector?.on('end', async (collected, reason) => {
				if (reason === 'time') {
					await this.channel?.send('You took too long to respond!');
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
		await this.channel?.send(
			`<@${player.user.id}> Select one tier ${
				tier + 1
			} group to pick!\nYou have 180 seconds.\nGroups Left:\n${this.getGroups(
				this.deck.groups[tier]
			)}`
		);

		await new Promise<void>((resolve, reject) => {
			const filter = (message: Message) => {
				const choice: number = parseInt(message.content.substring(6));
				return (
					message.author.id === player.user.id &&
					message.channel.id === this.channel?.id &&
					message.content.startsWith('!pick ') &&
					!isNaN(choice) &&
					choice >= 0 &&
					choice < this.deck.groups[tier].length
				);
			};

			const collector = this.channel?.createMessageCollector({
				filter,
				time: 180000,
			});

			collector?.on('collect', async (message: Message) => {
				let choice: number = parseInt(message.content.substring(6));
				if (
					isNaN(choice) ||
					choice < 0 ||
					choice >= this.deck.groups[tier].length
				)
					return;
				let grouping: Tier = this.deck.groups[tier].splice(
					choice - 1,
					1
				)[0];

				for (const pet of grouping.pets) {
					player.deck.tiers[tier].pets.push(pet);
				}
				for (const food of grouping.foods) {
					player.deck.tiers[tier].pets.push(food);
				}

				collector.stop('Success');
				await this.channel?.send(
					`${this.getNames(grouping.pets)} ${this.getNames(
						grouping.foods
					)} has been picked.`
				);
			});

			collector?.on('end', async (collected, reason) => {
				if (reason === 'time') {
					await this.channel?.send('You took too long to respond!');
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
