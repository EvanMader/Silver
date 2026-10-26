import { Client, Events, Guild, GuildMemberRoleManager } from 'discord.js';
import { Game } from './Game';
import { Player } from './Player';
import { Lobby } from './Lobby';
import { safe } from './Silver';
import { SELF_ASSIGNABLE_ROLE_IDS } from './Roles';

export function handleCommands(client: Client) {
	client.on(Events.InteractionCreate, async (interaction) => {
		try {
			if (!interaction.inGuild()) return;
			const guild: Guild = interaction.guild!;

			// Handle button role toggling
			if (interaction.isButton()) {
				if (!interaction.inCachedGuild() || !SELF_ASSIGNABLE_ROLE_IDS.has(interaction.customId)) return;
				const role = guild.roles.cache.get(interaction.customId);
				if (!role || role.managed) return;

				const roleManager: GuildMemberRoleManager = interaction.member
					.roles as GuildMemberRoleManager;

				if (roleManager.cache.has(role.id)) {
					await safe(roleManager.remove(role), `Remove role ${role.name}`);
					await safe(
						interaction.reply({
							content: `The role ${role.name} has been deactivated.`,
							ephemeral: true,
						}),
						'Replied to role removal'
					);
				} else {
					await safe(roleManager.add(role), `Add role ${role.name}`);
					await safe(
						interaction.reply({
							content: `The role ${role.name} has been activated.`,
							ephemeral: true,
						}),
						'Replied to role addition'
					);
				}
				return;
			}

			// Handle slash commands
			if (interaction.isChatInputCommand()) {
				// Limit commands to a specific channel
				if (interaction.channelId !== '1320464242654314557') return;

				const player = await safe(
					Player.create(interaction.user, guild),
					'Create player'
				);
				if (!player) return;

				if (interaction.commandName === 'create') {
					await safe(
						interaction.reply(`${interaction.user.displayName} created a lobby.`),
						'Replied to create command'
					);
					await safe(Lobby.create(player, client, guild), 'Create lobby');
				}
			}
		} catch (e) {
			console.error('Error handling interaction:', e);
		}
	});
}
