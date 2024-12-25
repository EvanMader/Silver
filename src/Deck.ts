import * as fs from 'fs';

export interface Food {
	name: string;
	id: number;
	tier: number;
}

export interface Pet {
	name: string;
	id: number;
	tier: number;
}

export interface Tier {
	pets: Pet[];
	foods: Food[];
}

export class Deck {
	tiers: Tier[];
    groups: Tier[][];

	public constructor(bool: boolean) {
        this.tiers = Array.from({length: 6}, () => ({pets: [], foods: []}));
        this.groups = [];
		if (bool) {
			const petFilePath = './data/Pets.json';
			const foodFilePath = './data/Foods.json';

			const petData: Pet[] = this.parseJsonFile(petFilePath) as Pet[];
			const foodData: Food[] = this.parseJsonFile(foodFilePath) as Food[];

			this.tiers = this.constructTiers(petData, foodData);
		}
	}

	private parseJsonFile(filePath: string): any {
		try {
			const jsonData = fs.readFileSync(filePath, 'utf-8');
			return JSON.parse(jsonData);
		} catch (error: unknown) {
            if (error instanceof Error) console.error(`Failed to parse JSON from ${filePath}: ${error.message}`);
            else console.error(`Unknown error occured while parsing ${filePath}.`)
			return [];
		}
	}

	private constructTiers(petData: Pet[], foodData: Food[]): Tier[] {
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
            let shuffledPets = [...this.tiers[i].pets].sort(() => Math.random() - 0.5).filter((pet) => pet.name !== "Snail");

            const tierGroups: Tier[] = [];
            let numGroups: number = Math.floor(this.tiers[i].pets.length / 3);

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
