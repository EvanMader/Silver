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

        for (const command of existingCommands) {
            if (!commands.find(newCmd => newCmd.name === command.name)) {
                console.log(`Deleting command: ${command.name}`);
                await rest.delete(Routes.applicationCommand(client_id, command.id));
            }
        }

        console.log("Updating global (/) commands...");
        await rest.put(Routes.applicationCommands(client_id), { body: commands });
        console.log("Successfully updated global (/) commands.");
    } catch (error) {
        console.error("Error updating global commands:", error);
    }
}