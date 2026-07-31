export type ISODate = string // YYYY-MM-DD

export type Meal = {
  id: string
  name: string
  /** aantal porties; leeg telt als 1 */
  qty?: number
  /** geschatte calorieën per portie — een ruwe inschatting is genoeg voor de trend */
  kcal?: number
}

export type Sleep = {
  bedtime?: string // HH:MM
  wake?: string // HH:MM
  hours?: number
  quality?: 1 | 2 | 3 | 4 | 5
}

export type Body = {
  weightKg?: number
  bodyFatPct?: number
  waterPct?: number
  waterMassKg?: number
  fatMassKg?: number
  muscleMassKg?: number
  boneMassKg?: number
  visceralFat?: number
  /** nuchter gewogen (ochtend, voor het eten) — bepaalt of de weging meetelt in de trend */
  fasted?: boolean
}

export type Context = {
  alcohol?: boolean
  ill?: boolean
  travel?: boolean
  stress?: 1 | 2 | 3 | 4 | 5
  notes?: string
}

export type DayEntry = {
  date: ISODate
  restingKcal?: number
  activeKcal?: number
  exerciseMin?: number
  standHours?: number
  waterMl?: number
  sleep: Sleep
  body: Body
  meals: Meal[]
  context: Context
  updatedAt: number
}

export type Sex = 'male' | 'female'

export type Profile = {
  birthDate: ISODate
  heightM: number
  targetWeightKg: number
  waterGoalMl: number
  /** nodig voor de BMR-schatting; blijft leeg tot je 'm zelf invult */
  sex?: Sex
}

export type Settings = {
  /** locale opslag van de PIN-hash */
  pinHash?: string
  biometricCredentialId?: string
}

export const emptyDay = (date: ISODate): DayEntry => ({
  date,
  sleep: {},
  body: {},
  meals: [],
  context: {},
  updatedAt: Date.now(),
})

export const defaultProfile: Profile = {
  birthDate: '1991-07-15',
  heightM: 1.74,
  targetWeightKg: 74.0,
  waterGoalMl: 2500,
}

export const defaultSettings: Settings = {}
