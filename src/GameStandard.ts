import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Guild, MessageComponentInteraction, PermissionFlagsBits, StringSelectMenuBuilder, TextChannel } from "discord.js";
import { Game } from "./Game";
import { Player } from "./Player";
import { gameList } from "./HandleCommands";
import { Deck, Tier } from "./Deck";

export class GameStandard extends Game {
    player1: Player;
    player2: Player;

	public constructor(
        players: Player[],
		client: Client,
		guild: Guild,
		channel: TextChannel,
	) {
        super(players, client, guild, channel)
		this.player1 = players[0];
		this.player2 = players[1];
	}

	public static async create(
        players: Player[],
		client: Client,
		guild: Guild
	): Promise<GameStandard> {

		const channel = await guild.channels.create({
			parent: '1320478069236039814',
			type: ChannelType.GuildText,
			name: `${players[0].user.displayName} vs ${players[1].user.displayName} standard`,
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
				{
					id: players[0].user.id,
					allow: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
				{
					id: players[1].user.id,
					allow: [
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AddReactions,
					],
				},
			],
		});

		const current: GameStandard = new GameStandard(
            players,
			client,
			guild,
			channel,
		);
		current.startGame();
		return current;
	}

	private async startGame() {
		this.endGame(gameList);

		this.turn = Math.floor(Math.random() * this.players.length);

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
					attachment: await this.getTeam(this.player1.deck.tiers),
				},
			],
		});

		let order: number[] = [0, 1, 2, 3, 4, 5];
		for (let i = order.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[order[i], order[randomIndex]] = [order[randomIndex], order[i]];
		}

		this.constructGroups(this.deck);

		let timer: number = 90000;
		for (let i = 0; i < 6; i++) {
			let selected: number[] = [];
			await this.channel.send(`__# TIER ${order[i] + 1}__`);
			try {
				if (this.getTurn())
					await this.selectGroup(
						this.player1,
						order[i],
						timer,
						false,
						selected
					);
				else
					await this.selectGroup(
						this.player2,
						order[i],
						timer,
						false,
						selected
					);
				this.turn++;
			} catch (e) { return; }

			try {
				if (this.getTurn())
					await this.selectGroup(this.player1, order[i], timer, true, selected);
				else
					await this.selectGroup(this.player2, order[i], timer, true, selected);
				this.turn++;
			} catch (e) { return; }

			timer = 60000;

			try {
				if (this.getTurn())
					await this.selectGroup(this.player1, order[i], timer, true, selected);
				else
					await this.selectGroup(this.player2, order[i], timer, true, selected);
				this.turn++;
			} catch (e) { return; }
		}

		await this.channel.send(`<@${this.player1.user.id}> Pack Code:`);
		await this.channel.send(`${this.player1.deck.getCode()}`);
		await this.channel.send(`<@${this.player2.user.id}> Pack Code:`);
		await this.channel.send(`${this.player2.deck.getCode()}`);

		await this.endGame(gameList);
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
			} group to ${pick ? 'pick' : 'ban'}! You have ${Math.floor(remainingTime / 1000)} seconds remaining.`,
			files: [
				{
					attachment: await this.getGroups(this.deck.groups[tier], selected),
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
				this.deck.groups[tier]
					.map((group, index) => ({
						label: String.fromCharCode(65 + index),
						value: `${index}`,
					}))
					.filter(option => !selected.includes(Number(option.value)))
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
							await interaction.deferUpdate().catch((error) => console.log(error));
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
							player,
							tier,
							parseInt(selectedValue!),
							selected
						);
					resolve();
				} else {
					console.log('Rejected select group for the following reason: ', reason);
					reject();
				}
			});
		});
	}

    private constructGroups(deck: Deck) {
        for (let i = 0; i < 6; i++) {
            let shuffledPets = [...deck.tiers[i].pets].sort(() => Math.random() - 0.5).filter( (pet) => 
				pet.name !== "Snail" &&
				pet.name !== "Penguin"	
			);

            const tierGroups: Tier[] = [];
            let numGroups: number = Math.floor(shuffledPets.length / 3);

            for (let j = 0; j < numGroups; j++) {
                if (j >= 7) break;
                const shuffledFoods = [...deck.tiers[i].foods].sort(() => Math.random() - 0.5);
                const selectedPets = shuffledPets.splice(0, 3);
                const selectedFoods = shuffledFoods.splice(0, 2);

                tierGroups.push({ pets: selectedPets, foods: selectedFoods });
            }

            deck.groups.push(tierGroups);
        }
    }
}