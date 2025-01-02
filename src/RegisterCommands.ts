import { REST, Routes, Snowflake } from 'discord.js';

export default async function registerCommandsGlobally(
    token: string,
    client_id: Snowflake
) {
    const commands = [
        {
            name: "queue",
            description: "Joins matchmaking queue.",
        },
        {
            name: "leave",
            description: "Leaves matchmaking queue.",
        },
        {
            name: "challenge",
            description: "challenge a foe",
            options: [
                {
                    name: "user",
                    description: "The user you want to challenge.",
                    type: 6,
                    required: true,
                },
                {
                    name: "type",
                    description: "Type of game (e.g., normal).",
                    type: 3,
                    required: true,
                    choices: [
                        { name: "Standard", value: "standard" },
                        { name: "Hyperroll", value: "hyperroll" },
                    ],
                },
            ],
        },
        {
            name: "retract",
            description: "retract a challenge",
            options: [
                {
                    name: "user",
                    description: "The user who challenged you.",
                    type: 6,
                    required: true,
                },
            ],
        },
        {
            name: "accept",
            description: "accept a challenge",
            options: [
                {
                    name: "user",
                    description: "The user who challenged you.",
                    type: 6,
                    required: true,
                },
            ],
        },
        {
            name: "decline",
            description: "decline a challenge",
            options: [
                {
                    name: "user",
                    description: "The user who challenged you.",
                    type: 6,
                    required: true,
                },
            ],
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