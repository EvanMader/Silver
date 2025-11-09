import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	TextChannel,
} from 'discord.js';
import { safe } from './Silver';

interface RoleButton {
	id: string;
	label: string;
}

export async function sendMessageWithButtons(
	channelId: string,
	client: Client
): Promise<void> {
	const channel = (await client.channels.fetch(channelId)) as TextChannel | null;
	if (!channel) return;

	const packs1: RoleButton[] = [
		{ id: '1321488657487626271', label: 'Turtle Pack' },
		{ id: '1321488707294855259', label: 'Puppy Pack' },
		{ id: '1321488739478012044', label: 'Star Pack' },
		{ id: '1321488865709527060', label: 'Golden Pack' },
		{ id: '1321488902925848617', label: 'Unicorn Pack' },
	];

	const packs2: RoleButton[] = [
		{ id: '1321489583023722548', label: 'Tardigayde Pack' },
		{ id: '1321488944625356841', label: 'Sunfish Pack' },
		{ id: '1395573374935105617', label: 'Danger Pack' },
		{ id: '1433148084573175950', label: 'Vampire Pack' },
	];

	const pingRoles: RoleButton[] = [
		{ id: '1333279745596461056', label: 'Ping4Game' },
	];

	const createActionRow = (roles: RoleButton[]) => {
		const row = new ActionRowBuilder<ButtonBuilder>();
		roles.forEach(role => {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(role.id)
					.setLabel(role.label)
					.setStyle(ButtonStyle.Primary)
			);
		});
		return row;
	};

	// Send packs messages safely
	await safe(
		channel.send({
			content: 'Activate your packs',
			components: [createActionRow(packs1), createActionRow(packs2)],
		}),
		"Send packs message"
	);

	// Send ping roles message safely
	await safe(
		channel.send({
			content: 'Add Roles',
			components: [createActionRow(pingRoles)],
		}),
		"Send ping roles message"
	);
}