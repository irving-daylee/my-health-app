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

export const bmi = (profile: Profile, weightKg: number) =>
  weightKg / (profile.heightM * profile.heightM)

export const intakeKcal = (day: DayEntry) =>
  day.meals.reduce((sum, m) => sum + (m.kcal ?? 0), 0)

export const burned = (day: DayEntry) => (day.restingKcal ?? 0) + (day.activeKcal ?? 0)

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
