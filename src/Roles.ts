import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	TextChannel,
} from 'discord.js';

export async function sendMessageWithButtons(
	channelId: string,
	client: Client
): Promise<void> {
	const channel = (await client.channels.fetch(channelId)) as TextChannel;
	if (!channel) return;

	const packs = [
		{
			id: '1321488657487626271',
			label: 'Turtle Pack',
		},
		{
			id: '1321488707294855259',
			label: 'Puppy Pack',
		},
		{
			id: '1321488739478012044',
			label: 'Star Pack',
		},
		{
			id: '1321488865709527060',
			label: 'Golden Pack',
		},
		{
			id: '1321488902925848617',
			label: 'Unicorn Pack',
		},
	];
	const packs2 = [
		{
			id: '1321489583023722548',
			label: 'Tardigayde Pack',
		},
		{
			id: '1321488944625356841',
			label: 'Sunfish Pack',
		},
		{
			id: '1395573374935105617',
			label: 'Danger Pack',
		},
		{
			id: '1433148084573175950',
			label: 'Vampire Pack',
		},
	];

	const rowPack = new ActionRowBuilder<ButtonBuilder>();
	const rowPack2 = new ActionRowBuilder<ButtonBuilder>();

	packs.forEach((role) => {
		rowPack.components.push(
			new ButtonBuilder()
				.setCustomId(role.id)
				.setLabel(role.label)
				.setStyle(ButtonStyle.Primary)
		);
	});
	packs2.forEach((role) => {
		rowPack2.components.push(
			new ButtonBuilder()
				.setCustomId(role.id)
				.setLabel(role.label)
				.setStyle(ButtonStyle.Primary)
		);
	});

	await channel.send({
		content: 'Activate your packs',
		components: [rowPack, rowPack2],
	});

	const ping = [
		{
			id: '1333279745596461056',
			label: 'Ping4Game',
		},
	];

	const pingRole = new ActionRowBuilder<ButtonBuilder>();

	ping.forEach((role) => {
		pingRole.components.push(
			new ButtonBuilder()
				.setCustomId(role.id)
				.setLabel(role.label)
				.setStyle(ButtonStyle.Primary)
		);
	});

  await channel.send({
    content: 'Add Roles',
    components: [pingRole]
  })
}
