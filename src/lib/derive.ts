import type { DayEntry, ISODate, Profile } from '../types'

export const todayISO = (): ISODate => toISO(new Date())

export function toISO(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shiftISO(date: ISODate, days: number): ISODate {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/**
 * De maandag van de week waar deze datum in valt. Weekdoelen lopen van maandag
 * tot en met zondag: op maandagochtend begin je weer op nul, in plaats van dat
 * de trainingen van vorige week meeschuiven in een venster van zeven dagen.
 */
export function weekStart(date: ISODate): ISODate {
  const d = new Date(date + 'T12:00:00')
  // getDay(): zondag = 0, dus zondag telt als de zevende dag van de vorige week.
  const offset = (d.getDay() + 6) % 7
  return shiftISO(date, -offset)
}

/** De dagen van de week (maandag t/m de datum zelf) waar deze dag in valt. */
export function weekDays(days: DayEntry[], date: ISODate): DayEntry[] {
  const start = weekStart(date)
  return days.filter((d) => d.date >= start && d.date <= date)
}

export function formatDate(date: ISODate): string {
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function ageAt(profile: Profile, date: ISODate): number {
  const b = new Date(profile.birthDate + 'T12:00:00')
  const d = new Date(date + 'T12:00:00')
  let age = d.getFullYear() - b.getFullYear()
  const m = d.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--
  return age
}

/** Mifflin-St Jeor. Alleen bruikbaar als geslacht is ingevuld — anders null. */
export function estimatedBmr(profile: Profile, weightKg: number, date: ISODate): number | null {
  if (!profile.sex) return null
  const cm = profile.heightM * 100
  const age = ageAt(profile, date)
  const base = 10 * weightKg + 6.25 * cm - 5 * age
  return Math.round(profile.sex === 'male' ? base + 5 : base - 161)
}

/**
 * Zet een leeftijd terug om naar een geboortedatum, met behoud van dag en
 * maand. Zo blijft je leeftijd vanzelf kloppen zodra je jarig bent, in plaats
 * van te bevriezen op het getal dat je ooit invulde.
 */
export function birthDateForAge(current: ISODate, age: number): ISODate {
  const [, m, d] = current.split('-')
  const nu = new Date()
  const jarigGeweest =
    nu.getMonth() + 1 > Number(m) || (nu.getMonth() + 1 === Number(m) && nu.getDate() >= Number(d))
  const jaar = nu.getFullYear() - age - (jarigGeweest ? 0 : 1)
  return `${jaar}-${m}-${d}`
}

export const bmi = (profile: Profile, weightKg: number) =>
  weightKg / (profile.heightM * profile.heightM)

/** Calorieën van één regel: aantal × kcal per portie. */
export const mealKcal = (m: { qty?: number; kcal?: number }) => (m.kcal ?? 0) * (m.qty ?? 1)

export const intakeKcal = (day: DayEntry) =>
  day.meals.reduce((sum, m) => sum + mealKcal(m), 0)

/** Eiwit telt net als calorieën per portie maal aantal. */
export const intakeProtein = (day: DayEntry) =>
  day.meals.reduce((sum, m) => sum + (m.proteinG ?? 0) * (m.qty ?? 1), 0)

export const burned = (day: DayEntry) => (day.restingKcal ?? 0) + (day.activeKcal ?? 0)

/**
 * Calorieën uit je zelf gelogde trainingen. Bewust NIET opgeteld bij `burned`:
 * je horloge rekent die inspanning al mee in je actieve calorieën, en twee keer
 * tellen maakt je balans onbruikbaar. Dit getal is er om mee te vergelijken —
 * of om over te nemen als je horloge niets heeft geleverd.
 */
export const workoutKcal = (day: DayEntry) =>
  day.workouts.reduce((sum, w) => sum + (w.kcal ?? 0), 0)

export const workoutMinutes = (day: DayEntry) =>
  day.workouts.reduce((sum, w) => sum + (w.minutes ?? 0), 0)

/**
 * Caloriebalans: verbrand − ingenomen. Negatief = tekort (afvallen).
 * Null zolang niet zowel verbranding als voeding bekend is — anders lieg je met een getal.
 */
export function balance(day: DayEntry): number | null {
  const out = burned(day)
  const inn = intakeKcal(day)
  if (out === 0 || inn === 0) return null
  return inn - out
}

export function sleepHours(day: DayEntry): number | undefined {
  if (day.sleep.hours != null) return day.sleep.hours
  const { bedtime, wake } = day.sleep
  if (!bedtime || !wake) return undefined
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wake.split(':').map(Number)
  let mins = wh * 60 + wm - (bh * 60 + bm)
  if (mins <= 0) mins += 24 * 60
  return Math.round((mins / 60) * 10) / 10
}

/** Alleen nuchtere ochtendwegingen tellen mee — avondwegingen vervuilen de trend. */
export const weighIns = (days: DayEntry[]) =>
  days.filter((d) => d.body.weightKg != null && d.body.fasted !== false)

/** 7-daags voortschrijdend gemiddelde over de beschikbare wegingen. */
export function weightTrend(days: DayEntry[]): { date: ISODate; value: number }[] {
  const points = weighIns(days).map((d) => ({ date: d.date, weight: d.body.weightKg! }))
  return points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 6), i + 1)
    const avg = window.reduce((s, w) => s + w.weight, 0) / window.length
    return { date: p.date, value: Math.round(avg * 100) / 100 }
  })
}

export function trendDelta(days: DayEntry[], span = 7): number | null {
  const t = weightTrend(days)
  if (t.length < 2) return null
  const last = t[t.length - 1]
  const prev = t[Math.max(0, t.length - 1 - span)]
  if (last.date === prev.date) return null
  return Math.round((last.value - prev.value) * 100) / 100
}

/** Verschil met de vorige weging (dagcontrast) — ruis, maar wel wat je op de weegschaal ziet. */
export function dayDelta(days: DayEntry[], date: ISODate): number | null {
  const points = weighIns(days)
  const idx = points.findIndex((d) => d.date === date)
  if (idx < 1) return null
  return Math.round((points[idx].body.weightKg! - points[idx - 1].body.weightKg!) * 100) / 100
}

/** Nederlandse notatie: komma als decimaalteken. */
export const nl = (n: number, digits = 1) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmt = (n: number | null | undefined, digits = 0, unit = '') =>
  n == null || Number.isNaN(n) ? '—' : `${nl(n, digits)}${unit ? ' ' + unit : ''}`

export const signed = (n: number | null | undefined, digits = 1, unit = '') =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${nl(n, digits)}${unit ? ' ' + unit : ''}`

/**
 * Een typefout in je gewicht (787 in plaats van 78,7) verpest je trend en je
 * voorgestelde caloriedoel, en valt niet meteen op. Dit waarschuwt zonder tegen
 * te houden — soms klopt een grote sprong gewoon.
 */
export function weightWarning(
  days: DayEntry[],
  date: ISODate,
  weightKg: number | undefined,
): string | null {
  if (weightKg == null) return null
  if (weightKg < 30 || weightKg > 300) {
    return 'Dat lijkt geen gewicht in kilo\'s. Controleer of je de komma goed hebt gezet.'
  }

  const eerder = weighIns(days).filter((d) => d.date < date)
  const vorige = eerder[eerder.length - 1]
  if (!vorige?.body.weightKg) return null

  const verschil = weightKg - vorige.body.weightKg
  const dagen = Math.max(
    1,
    Math.round(
      (new Date(date + 'T12:00:00').getTime() -
        new Date(vorige.date + 'T12:00:00').getTime()) /
        86_400_000,
    ),
  )
  // Ruim twee kilo per dag verschil is fysiologisch vrijwel onmogelijk.
  if (Math.abs(verschil) > 2 * dagen) {
    return `${signed(verschil, 1, 'kg')} ten opzichte van je vorige weging (${nl(
      vorige.body.weightKg,
      1,
    )} kg op ${vorige.date}). Klopt dat, of staat de komma verkeerd?`
  }
  return null
}

/** Minuten sinds middernacht; 'HH:MM' -> getal, ongeldig -> null. */
export function minutesOfDay(time: string | undefined): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  const u = Number(m[1])
  const min = Number(m[2])
  return u > 23 || min > 59 ? null : u * 60 + min
}

export type Dagdeel = 'ochtend' | 'middag' | 'avond'

export const DAGDEEL_LABELS: Record<Dagdeel, string> = {
  ochtend: 'Ochtend',
  middag: 'Middag',
  avond: 'Avond',
}

/**
 * Het dagdeel volgt uit het tijdstip dat je al invult — een apart labelveld zou
 * je hetzelfde twee keer laten opgeven. Zonder tijd is er dus ook geen dagdeel.
 *
 * De avond loopt door tot vier uur 's nachts: een biertje om half een hoort bij
 * de avond ervoor, niet bij de ochtend erna.
 */
export function dagdeel(time: string | undefined): Dagdeel | null {
  const m = minutesOfDay(time)
  if (m == null) return null
  if (m >= 4 * 60 && m < 12 * 60) return 'ochtend'
  if (m < 17 * 60 + 30 && m >= 12 * 60) return 'middag'
  return 'avond'
}

/** Het laatste tijdstip waarop je die dag iets at of dronk. */
export function lastMealMinutes(day: DayEntry): number | null {
  const tijden = day.meals.map((m) => minutesOfDay(m.time)).filter((x): x is number => x != null)
  return tijden.length ? Math.max(...tijden) : null
}

export const nowTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Alles wat uit je weegschaalgegevens af te leiden is. Een percentage en de
 * bijbehorende massa zijn twee kanten van dezelfde meting, dus als je er één
 * invult kennen we de ander ook — zo hoef je alleen over te typen wat Fitdays
 * je toont.
 */
export function derivedBody(body: DayEntry['body'], profile: Profile) {
  const w = body.weightKg
  if (w == null || w <= 0) return null

  const paar = (pct: number | undefined, kg: number | undefined) => ({
    pct: pct ?? (kg != null ? (kg / w) * 100 : undefined),
    kg: kg ?? (pct != null ? (w * pct) / 100 : undefined),
    afgeleid: pct == null || kg == null,
  })

  const vet = paar(body.bodyFatPct, body.fatMassKg)
  const vocht = paar(body.waterPct, body.waterMassKg)
  const eiwit = paar(body.proteinPct, undefined)

  const vetvrij = vet.kg != null ? w - vet.kg : undefined
  // Vetvrije massa afgezet tegen je lengte, net als BMI maar dan zonder het vet
  // mee te tellen. Dit is het getal dat laat zien of je spiermassa vasthoudt.
  const ffmi = vetvrij != null ? vetvrij / (profile.heightM * profile.heightM) : undefined

  return { vet, vocht, eiwit, vetvrij, ffmi, bmi: bmi(profile, w) }
}
