import { User } from "discord.js";
import { Deck } from "./Deck";

export class Player {
    user: User;
    deck: Deck;

    public constructor(user: User) {
        this.user = user;
        this.deck = new Deck(false);
    }
}