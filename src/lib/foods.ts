import type { DayEntry } from '../types'

export type FoodItem = {
  /** genormaliseerde naam — de sleutel waarop we herkennen en samenvoegen */
  key: string
  name: string
  kcal: number
  /** eiwit in gram per portie; leeg betekent onbekend, niet nul */
  proteinG?: number
  /** hoe vaak gekozen; bepaalt de volgorde van de suggesties */
  uses: number
  lastUsed: number
}

export const foodKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Startlijst met vaste items. Alle waarden zijn schattingen voor een normale
 * Nederlandse portie — pas ze gerust aan, want de app onthoudt jouw versie
 * zodra je een item met een ander getal opslaat.
 */
const SEED: [string, number, number][] = [
  // dranken
  ['Water', 0, 0],
  ['Glas rode wijn (150 ml)', 130, 0],
  ['Red Bull (blikje 250 ml)', 115, 1],
  ['Red Bull sugarfree (blikje 250 ml)', 8, 0],
  ['Dubbele espresso met scheutje melk', 15, 1],
  ['Stëlz hard iced tea (blikje 250 ml)', 70, 0],
  ['Stëlz iced tea 0.0 (blikje 250 ml)', 8, 0],
  ['Vitamin Well Reload (fles 500 ml)', 85, 0],
  ['Bier (glas 250 ml)', 100, 1],
  ['Blond bier (glas 250 ml)', 155, 1],
  ['Frisdrank zero (glas 250 ml)', 2, 0],

  // bolletje: circa 150 kcal brood plus 5 gram boter
  ['Bolletje met boter en kaas', 260, 12],
  ['Bolletje met boter en kipfilet', 225, 13],
  ['Bolletje met boter en ham', 225, 12],
  ['Bolletje met boter en worst', 250, 11],
  ['Bolletje met chocopasta', 275, 7],
  ['Bolletje met pindakaas', 285, 11],
  ['Bolletje met gebakken ei', 280, 13],
  ['Tosti van bolletje', 330, 17],
  ['Kaascroissant', 300, 9],
  ['Belegd pistolet carpaccio', 500, 26],

  // sneetje brood: circa 90 kcal brood plus 5 gram boter
  ['Sneetje met boter en kaas', 200, 9],
  ['Sneetje met boter en kipfilet', 165, 10],
  ['Sneetje met boter en ham', 165, 9],
  ['Sneetje met chocopasta', 215, 5],
  ['Sneetje met pindakaas', 225, 8],
  ['Sneetje met gebakken ei', 220, 10],
  ['Tosti (2 sneetjes)', 340, 19],

  // avondeten
  ['Avondeten kip, groente en aardappelen', 600, 45],
  ['Avondeten kipschnitzel, groente en aardappelen', 750, 45],
  ['Avondeten kip, rijst en groente', 650, 45],
  ['Avondeten pasta met kip', 700, 42],

  // snacks
  ['Handje chips', 150, 2],
  ['Handje snoep', 130, 1],
  ['Reepje chocola', 110, 2],
  ['Rijstwafel', 35, 1],
  ['Rijstwafel met kaas', 105, 6],
  ['Cracker', 25, 1],
  ['Cracker met kaas', 95, 6],
]

export const seedFoods = (): FoodItem[] =>
  SEED.map(([name, kcal, proteinG]) => ({
    key: foodKey(name),
    name,
    kcal,
    proteinG,
    uses: 0,
    lastUsed: 0,
  }))

/**
 * Items uit een dag opnemen in de lijst. Alleen regels met een naam én
 * calorieën: een halfingevulde regel is geen bruikbaar item.
 */
export function learnFromDay(day: DayEntry, known: FoodItem[]): FoodItem[] {
  const byKey = new Map(known.map((f) => [f.key, f]))
  let changed = false

  for (const meal of day.meals) {
    const name = meal.name?.trim()
    // Namen van een of twee tekens zijn zo goed als altijd een tussenstand van
    // iets langers, geen item dat je wilt terugzien.
    if (!name || name.length < 3 || !meal.kcal || meal.kcal <= 0) continue

    const key = foodKey(name)
    const existing = byKey.get(key)
    byKey.set(key, {
      key,
      name,
      // je laatste invoer wint — dat is jouw portie, niet mijn schatting
      kcal: meal.kcal,
      // eiwit alleen overschrijven als je het echt hebt ingevuld
      proteinG: meal.proteinG ?? existing?.proteinG,
      uses: (existing?.uses ?? 0) + 1,
      lastUsed: Date.now(),
    })
    changed = true
  }

  return changed ? [...byKey.values()] : known
}

/** Zoekt op woorddelen, zodat "kaas bol" ook "Bolletje met boter en kaas" vindt. */
export function searchFoods(foods: FoodItem[], query: string, limit = 6): FoodItem[] {
  const termen = foodKey(query).split(' ').filter(Boolean)
  const gescoord = foods
    .map((f) => {
      const naam = f.key
      if (!termen.every((t) => naam.includes(t))) return null
      // een treffer aan het begin van de naam is bijna altijd wat je bedoelt
      const kop = naam.startsWith(termen[0]) ? 1000 : 0
      return { food: f, score: kop + f.uses * 10 - naam.length / 100 }
    })
    .filter((x): x is { food: FoodItem; score: number } => x !== null)

  return gescoord
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.food)
}

/** Samenvoegen tussen apparaten: het laatst gebruikte item wint. */
export function mergeFoods(local: FoodItem[], remote: FoodItem[]): FoodItem[] {
  const byKey = new Map(local.map((f) => [f.key, f]))
  for (const f of remote) {
    const mine = byKey.get(f.key)
    if (!mine || f.lastUsed > mine.lastUsed) {
      byKey.set(f.key, { ...f, uses: Math.max(f.uses, mine?.uses ?? 0) })
    }
  }
  return [...byKey.values()]
}
