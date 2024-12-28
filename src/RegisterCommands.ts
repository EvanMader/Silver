import { REST, Routes, Snowflake } from 'discord.js';

export default async function registerCommands(token: string, client_id: Snowflake) {
	const commands = [
		{
			name: "queue",
			description: "Joins matchmaking queue.",
		},
        {
            name: "leave",
            description: "Leaves matchmaking queue."
        }
	];

	const rest = new REST({ version: '10' }).setToken(token);

	try {
		console.log("Started refreshing application (/) commands.");

		await rest.put(Routes.applicationCommands(client_id), {
			body: commands,
		});

		console.log("Successfully reloaded application (/) commands.");
	} catch (error) {
		console.error(error);
	}
}
