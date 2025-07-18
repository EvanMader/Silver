import { Guild, User } from "discord.js";
import { Deck } from "./Deck";

export class Player {
    user: User;
    deck: Deck;
    packs: number[];

    private constructor(user: User) {
        this.user = user;
        this.deck = new Deck(false, []);
        this.packs = [];
    }

    public static async create(user: User, guild: Guild) {
        const player: Player = new Player(user);
		const roles = ['Turtle Pack', 'Puppy Pack', 'Star Pack', 'Golden Pack', 'Unicorn Pack', 'Tardigayde Pack', 'Sunfish Pack', 'Danger Pack'];
        const memeber = await guild.members.fetch(user);
        for (let i: number = 0; i  < roles.length; i++) {
            if (memeber.roles.cache.some((role) => role.name === roles[i])) player.packs.push(i+1);
        }

        return player;
    }
}