import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, TextChannel} from 'discord.js';

export async function sendMessageWithButtons(channelId: string, client: Client): Promise<void> {
  const channel = await client.channels.fetch(channelId) as TextChannel;
  if (!channel) return;

  const roles = [
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
    }
  ]
  const roles2 = [
    {
    id: '1321489583023722548',
    label: 'Tardigayde Pack',
    },
    {
    id: '1321488944625356841',
    label: 'Sunfish Pack',
    }
  ]

	const row = new ActionRowBuilder<ButtonBuilder>();
  const row2 = new ActionRowBuilder<ButtonBuilder>();

  roles.forEach((role) => {
    row.components.push(
      new ButtonBuilder().setCustomId(role.id).setLabel(role.label).setStyle(ButtonStyle.Primary)
    )
  })
  roles2.forEach((role) => {
    row2.components.push(
      new ButtonBuilder().setCustomId(role.id).setLabel(role.label).setStyle(ButtonStyle.Primary)
    )
  })

  await channel.send({content: 'Activate your packs.', components: [row, row2]});
}
