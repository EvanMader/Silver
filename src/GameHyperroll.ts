import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Guild, MessageComponentInteraction, PermissionFlagsBits, StringSelectMenuBuilder, TextChannel } from "discord.js";
import { Game } from "./Game";
import { Player } from "./Player";
import { gameList } from "./HandleCommands";
import { Deck, Tier } from "./Deck";

export class GameHyperroll extends Game {
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
	): Promise<GameHyperroll> {

		const channel = await guild.channels.create({
			parent: '1320478069236039814',
			type: ChannelType.GuildText,
			name: `${players[0].user.displayName} vs ${players[1].user.displayName} normal`,
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

		const current: GameHyperroll = new GameHyperroll(
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

		for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 3; j++) {
                let index = Math.floor(
                    Math.random() * this.deck.tiers[i].foods.length
                );
                if (j === 0 && i === 4 && this.deck.tiers[i].foods.findIndex( (food) => food.name === 'Chocolate') != -1)
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
		}

		await this.channel.send({
			content: '__**Randomly Selected 3 Food Per Tier**__\n Both players will get ',
			files: [
				{
					attachment: await this.getImage(this.player1.deck.tiers),
				},
			],
		});

        await this.channel.send('Both players will get 45 seconds to view the foods before hyperoll begins.');
        await new Promise(resolve => setTimeout(resolve, 45000));

		let timer: number = 45000;
		for (let i = 0; i < 5; i++) {
            try {
                await this.channel.send(`__# ${i} / 5 picks__`);
            } catch (error) { return; }
            
            let selected: boolean = false;
            for (let j = 0; j < 2; j++) {
                for (let k = 0; k < 4; k++) {
                    this.constructGroups(this.deck);
                    try {
                        if (this.getTurn())
                            selected = await this.selectGroup(this.player1, k, timer, true);
                        else
                            selected = await this.selectGroup(this.player2, k, timer, true);
                        if (selected) break;
                    } catch (e) { return; }
                }
                this.turn++;
            }
		}

		await this.channel.send(`<@${this.player1.user.id}> Pack Code:`);
		await this.channel.send(`${this.player1.deck.getCode()}`);
		await this.channel.send(`<@${this.player2.user.id}> Pack Code:`);
		await this.channel.send(`${this.player2.deck.getCode()}`);

		await this.endGame(gameList);
	}

	protected async selectGroup(
		player: Player,
		iteration: number,
		timerLength: number,
		pick: boolean
	): Promise<boolean> {
		let remainingTime = timerLength;
		const countdown = await this.channel.send({
			content: `<@${player.user.id}> You have ${
				3 - iteration
			} rolls remaining! You have ${Math.floor(remainingTime / 1000)} seconds remaining.`,
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
                        content: `<@${player.user.id}> You have ${
                            3 - iteration
                        } rolls remaining! You have ${Math.floor(remainingTime / 1000)} seconds remaining.`,
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

    private constructGroups(deck: Deck) {
        deck.groups = [];
        for (let i = 0; i < 6; i++) {
            let shuffledPets = [...deck.tiers[i].pets].sort(() => Math.random() - 0.5).filter( (pet) => 
				pet.name !== "Snail" &&
				pet.name !== "Penguin"	
			);

            const tierGroups: Tier[] = [];
            const selectedPets = shuffledPets.splice(0, 2);
            tierGroups.push({ pets: selectedPets, foods: []});
            deck.groups.push(tierGroups);
        }
    }
}