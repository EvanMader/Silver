import { REST, Routes, Snowflake } from 'discord.js';

export default async function registerCommandsGlobally(
    token: string,
    client_id: Snowflake
) {
    const commands = [
        {
            name: "create",
            description: "create a lobby",
        },
    ];

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log("Checking for global (/) commands updates...");

        const existingCommands = await rest.get(Routes.applicationCommands(client_id)) as any[];

        const commandsAreDifferent =
            JSON.stringify(existingCommands.map(cmd => ({ name: cmd.name, description: cmd.description }))) !==
            JSON.stringify(commands);

        if (commandsAreDifferent) {
            console.log("Updating global (/) commands...");
            await rest.put(Routes.applicationCommands(client_id), { body: commands });
            console.log("Successfully updated global (/) commands.");
        } else {
            console.log("No changes detected. Skipping global command update.");
        }
    } catch (error) {
        console.error("Error updating global commands:", error);
    }
}