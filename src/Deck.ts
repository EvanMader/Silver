import { foods, pets } from './Silver';

export interface Food {
	name: string;
	id: number;
	tier: number;
	packs: number[];
}

export interface Pet {
	name: string;
	id: number;
	tier: number;
	packs: number[];
}

export interface Tier {
	pets: Pet[];
	foods: Food[];
}

export class Deck {
	tiers: Tier[];
    groups: Tier[][];

	public constructor(bool: boolean, packs: number[]) {
        this.tiers = Array.from({length: 6}, () => ({pets: [], foods: []}));
        this.groups = [];
		if (bool) {
			this.tiers = this.constructTiers(packs);
		}
	}

	private constructTiers(packs: number[]): Tier[] {
		let petData = pets.filter(pet => pet.packs?.some(pack => packs.includes(pack)));
		let foodData = foods.filter(food => food.packs?.some(pack => packs.includes(pack)));

		const tiers: Tier[] = [];

		for (let i: number = 1; i <= 6; i++) {
			const tierFoods = foodData.filter((food) => food.tier === i);
			const tierPets = petData.filter((pet) => pet.tier === i);
			tiers.push({ pets: tierPets, foods: tierFoods });
		}

		return tiers;
	}

    public getCode(): string {
        const output = {
			Title: 'Silver',
			Minion: 36,
			Minions: this.tiers.flatMap((tier) =>
				tier.pets.map((pet) => pet.id)
			),
			Spells: this.tiers.flatMap((tier) =>
				tier.foods.map((food) => food.id)
			),
		};
        return JSON.stringify(output);
    }
}
