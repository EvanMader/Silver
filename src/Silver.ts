import 'dotenv/config';
import { Client } from 'discord.js';
import registerCommandsOnGuild from './RegisterCommands';
import { handleCommands } from './HandleCommands';
import { sendMessageWithButtons } from './Roles';
import * as fs from 'fs';
import { Food, Pet } from './Deck';

const TOKEN = process.env.TOKEN;
if (TOKEN === undefined) {
	console.error('NO TOKEN');
	process.exit(1);
}

const client = new Client({
	intents: ['Guilds', 'GuildMessages', 'GuildMembers', 'MessageContent'],
});

client.on('ready', async (c) => {
	console.log(`${c.user.username} is online.`);
	registerCommandsOnGuild(TOKEN, client.application!.id);
	handleCommands(client);
	//sendMessageWithButtons('1321488575145050122', client);
});

client.login(TOKEN);

export const pets: Pet[] = parseJsonFile('./data/Pets.json');
export const foods: Food[] = parseJsonFile('./data/Foods.json');

export function parseJsonFile(filePath: string): any {
	try {
		const jsonData = fs.readFileSync(filePath, 'utf-8');
		return JSON.parse(jsonData);
	} catch (error: unknown) {
		if (error instanceof Error)
			console.error(
				`Failed to parse JSON from ${filePath}: ${error.message}`
			);
		else console.error(`Unknown error occured while parsing ${filePath}.`);
		return [];
	}
}

export async function safe<T>(promise: Promise<T>, label: string): Promise<T | null> {
	try {
		return await promise;
	} catch (err) {
		console.warn(`Safe async error in ${label}:`, err);
		return null;
	}
}

export function fileIfExists(buf: Buffer | null) {
	return buf ? [{ attachment: buf }] : [];
}