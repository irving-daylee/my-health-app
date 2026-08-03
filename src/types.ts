export type ISODate = string // YYYY-MM-DD

export type Meal = {
  id: string
  name: string
  /** aantal porties; leeg telt als 1 */
  qty?: number
  /** geschatte calorieën per portie — een ruwe inschatting is genoeg voor de trend */
  kcal?: number
  /** eiwit in gram per portie; komt meestal uit je itemlijst */
  proteinG?: number
  /** HH:MM — automatisch gezet bij toevoegen op de dag zelf, aanpasbaar */
  time?: string
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
  /** eiwitpercentage uit de weegschaal — deel van je lichaamsgewicht, geen voeding */
  proteinPct?: number
  fatMassKg?: number
  muscleMassKg?: number
  boneMassKg?: number
  visceralFat?: number
  /** nuchter gewogen (ochtend, voor het eten) — bepaalt of de weging meetelt in de trend */
  fasted?: boolean
}

export type WorkoutType =
  | 'zaalvoetbal'
  | 'training'
  | 'krachttraining'
  | 'wandelen'
  | 'fietsen'
  | 'anders'

export type Workout = {
  id: string
  type: WorkoutType
  minutes?: number
  /** eigen schatting; telt niet automatisch mee in de balans, zie derive.ts */
  kcal?: number
  note?: string
}

export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  zaalvoetbal: 'Zaalvoetbal',
  training: 'Zaalvoetbaltraining',
  krachttraining: 'Krachttraining',
  wandelen: 'Wandelen',
  fietsen: 'Fietsen',
  anders: 'Anders',
}

export type Context = {
  alcohol?: boolean
  ill?: boolean
  travel?: boolean
  football?: boolean
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
  workouts: Workout[]
  context: Context
  updatedAt: number
}

export type Sex = 'male' | 'female'

export type Profile = {
  updatedAt?: number
  birthDate: ISODate
  heightM: number
  targetWeightKg: number
  waterGoalMl: number
  /** dagelijks caloriedoel voor de voortgangsbalk bij eten en drinken */
  calorieGoalKcal: number
  /** beweegminuten per week */
  exerciseGoalWeek: number
  /** krachttrainingen per week */
  strengthGoalWeek: number
  /** nodig voor de BMR-schatting; blijft leeg tot je 'm zelf invult */
  sex?: Sex
}

export type Settings = {
  /** locale opslag van de PIN-hash */
  pinHash?: string
  biometricCredentialId?: string
}

/**
 * Firebase slaat geen lege objecten of arrays op: een dag waarop alleen water
 * is ingevuld komt terug zonder `body`, `sleep`, `meals` en `context`. Alles wat
 * van buiten komt moet daarom hierlangs, anders klapt de eerste `day.body.x`
 * eruit.
 */
export const normalizeDay = (raw: Partial<DayEntry> & { date: ISODate }): DayEntry => ({
  ...raw,
  date: raw.date,
  sleep: raw.sleep ?? {},
  body: raw.body ?? {},
  meals: Array.isArray(raw.meals) ? raw.meals : raw.meals ? Object.values(raw.meals) : [],
  workouts: Array.isArray(raw.workouts)
    ? raw.workouts
    : raw.workouts
      ? Object.values(raw.workouts)
      : [],
  context: raw.context ?? {},
  updatedAt: raw.updatedAt ?? 0,
})

export const emptyDay = (date: ISODate): DayEntry => ({
  date,
  sleep: {},
  body: {},
  meals: [],
  workouts: [],
  context: {},
  updatedAt: Date.now(),
})

export const defaultProfile: Profile = {
  birthDate: '1991-07-15',
  heightM: 1.74,
  targetWeightKg: 74.0,
  waterGoalMl: 2500,
  calorieGoalKcal: 2000,
  exerciseGoalWeek: 150,
  strengthGoalWeek: 2,
}

export const defaultSettings: Settings = {}
