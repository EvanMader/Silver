import "dotenv/config";
import { Client } from "discord.js";
import registerCommands from "./RegisterCommands";
import { handleCommands } from "./HandleCommands";
import { sendMessageWithButtons } from "./Roles";


const TOKEN = process.env.TOKEN;
if (TOKEN === undefined) {
    console.error("NO TOKEN");
    process.exit(1);
}

const client = new Client({
    intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
});

client.on("ready", (c) => {
    console.log(`${c.user.username} is online.`);
    registerCommands(TOKEN, client.application!.id);
    handleCommands(client);
    //sendMessageWithButtons('1321488575145050122', client);
});

client.login(TOKEN);
