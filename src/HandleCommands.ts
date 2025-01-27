import { Client, Events, Guild, GuildMemberRoleManager } from 'discord.js';
import { Game } from './Game';
import { Player } from './Player';
import { Lobby } from './Lobby';

export function handleCommands(client: Client) {
	client.on(Events.InteractionCreate, async (interaction) => {
		try {
			if (!interaction.inGuild()) return;
			const guild: Guild = interaction.guild!;

			if (interaction.isButton()) {
				const role = guild.roles.cache.get(interaction.customId);
				if (!role) return;
				const roleManager: GuildMemberRoleManager = interaction.member
					.roles as GuildMemberRoleManager;
				const hasRole = roleManager.cache.has(role.id);

				if (hasRole) {
					await roleManager.remove(role);
					await interaction.reply({
						content: `The role ${role} has been deactivated.`,
						ephemeral: true,
					});
				} else {
					await roleManager.add(role);
					await interaction.reply({
						content: `The role ${role} has been activated.`,
						ephemeral: true,
					});
				}
				return;
			}

			if (interaction.isChatInputCommand()) {
				if (interaction.channelId === '1320464242654314557') {

					const player: Player = await Player.create(
						interaction.user,
						interaction.guild!
					);

					if (interaction.commandName == 'create') {
						await interaction.reply(
							`${interaction.user.displayName} created a lobby.`
						);
						await Lobby.create( player, client, guild);
					}
				}
			}
		} catch (e) { return; }
	});
}
