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

    public constructGroups() {
        for (let i = 0; i < 6; i++) {
            let shuffledPets = [...this.tiers[i].pets].sort(() => Math.random() - 0.5).filter( (pet) => 
				pet.name !== "Snail" &&
				pet.name !== "Penguin"	
			);

            const tierGroups: Tier[] = [];
            let numGroups: number = Math.floor(shuffledPets.length / 3);

            for (let j = 0; j < numGroups; j++) {
                if (j >= 7) break;
                const shuffledFoods = [...this.tiers[i].foods].sort(() => Math.random() - 0.5);
                const selectedPets = shuffledPets.splice(0, 3);
                const selectedFoods = shuffledFoods.splice(0, 2);

                tierGroups.push({ pets: selectedPets, foods: selectedFoods });
            }

            this.groups.push(tierGroups);
        }
    }

    public getCode(): string {
        const output = {
			Title: 'Silver',
			Minion: 36,
			Minions: this.tiers.map((tier) =>
				tier.pets.map((pet) => pet.id)
			).flat(),
			Spells: this.tiers.map((tier) =>
				tier.foods.map((food) => food.id)
			).flat(),
		};
        return JSON.stringify(output);
    }
}
