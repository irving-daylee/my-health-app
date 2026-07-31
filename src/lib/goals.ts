import type { DayEntry, Profile } from '../types'
import {
  burned,
  estimatedBmr,
  intakeKcal,
  sleepHours,
  weighIns,
  weightTrend,
  workoutMinutes,
} from './derive'

const KCAL_PER_KG = 7700
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const round = (n: number, step: number) => Math.round(n / step) * step

export type Suggestion = {
  key: 'calories' | 'water' | 'exercise' | 'strength'
  label: string
  value: number
  unit: string
  current: number
  /** waarom dit getal — altijd tonen, anders is het een getal uit het niets */
  why: string
  /** 'gemeten' weegt zwaarder dan 'geschat': het komt uit je eigen data */
  basis: 'gemeten' | 'geschat'
}

export type SleepNote = { average: number | null; best: number | null; text: string }

/**
 * Je werkelijke dagverbruik, teruggerekend uit wat je at en wat je gewicht deed.
 * Dit is nauwkeuriger dan welke formule dan ook, want het verrekent alles wat
 * een formule niet weet — maar het heeft wel een paar weken data nodig.
 */
function measuredTdee(days: DayEntry[]): number | null {
  const withIntake = days.filter((d) => intakeKcal(d) > 0)
  const trend = weightTrend(days)
  if (withIntake.length < 14 || trend.length < 8) return null

  const first = trend[0]
  const last = trend[trend.length - 1]
  const dagen =
    (new Date(last.date + 'T12:00:00').getTime() - new Date(first.date + 'T12:00:00').getTime()) /
    86_400_000
  if (dagen < 14) return null

  const perDagKg = (last.value - first.value) / dagen
  return Math.round(mean(withIntake.map(intakeKcal)) - perDagKg * KCAL_PER_KG)
}

/** Terugval: wat je horloge de afgelopen dagen aan verbranding rapporteerde. */
function watchTdee(days: DayEntry[]): number | null {
  const withBurn = days.map(burned).filter((b) => b > 0)
  return withBurn.length >= 5 ? Math.round(mean(withBurn)) : null
}

export function suggestGoals(days: DayEntry[], profile: Profile) {
  const suggestions: Suggestion[] = []
  const laatste = weighIns(days).slice(-1)[0]?.body.weightKg
  const trend = weightTrend(days)
  const huidig = trend.length ? trend[trend.length - 1].value : laatste

  // ---------- calorie-inname ----------
  const gemeten = measuredTdee(days)
  const horloge = watchTdee(days)
  const bmr = huidig ? estimatedBmr(profile, huidig, days[days.length - 1]?.date ?? '') : null
  const formule = bmr ? Math.round(bmr * 1.45) : null

  const tdee = gemeten ?? horloge ?? formule
  const basis: 'gemeten' | 'geschat' = gemeten ? 'gemeten' : 'geschat'

  if (tdee && huidig) {
    const teGaan = huidig - profile.targetWeightKg
    // Een half pond per week is een tempo dat je volhoudt en dat je spiermassa spaart.
    const gewenstTekort = teGaan > 0.5 ? 550 : 0
    const ondergrens = bmr ?? Math.round(tdee * 0.75)
    const doel = Math.max(round(tdee - gewenstTekort, 50), ondergrens)

    const bron =
      basis === 'gemeten'
        ? `Teruggerekend uit wat je at en wat je gewicht deed: je verbruikt ongeveer ${tdee} kcal per dag.`
        : horloge
          ? `Gebaseerd op wat je horloge rapporteerde: gemiddeld ${tdee} kcal per dag. Dit wordt nauwkeuriger zodra je twee weken je voeding logt.`
          : `Geschat uit je lengte, gewicht en leeftijd: ongeveer ${tdee} kcal per dag. Dit wordt nauwkeuriger zodra je een paar weken logt.`

    const richting =
      gewenstTekort === 0
        ? 'Je zit op of onder je streefgewicht, dus dit is een onderhoudsdoel.'
        : doel === ondergrens
          ? `Een groter tekort zou je onder je basaalverbruik brengen, dus hier ligt de bodem. Verwacht ongeveer ${((tdee - doel) * 7 / KCAL_PER_KG).toFixed(2).replace('.', ',')} kg per week.`
          : 'Met dit tekort verlies je ongeveer 0,5 kg per week — snel genoeg om iets te zien, langzaam genoeg om je spiermassa te sparen.'

    suggestions.push({
      key: 'calories',
      label: 'Caloriedoel',
      value: doel,
      unit: 'kcal',
      current: profile.calorieGoalKcal,
      why: `${bron} ${richting}`,
      basis,
    })
  }

  // ---------- water ----------
  if (huidig) {
    const beweegdagen = days.filter((d) => (d.exerciseMin ?? 0) >= 30).length
    const opslag = beweegdagen / Math.max(days.length, 1) > 0.4 ? 300 : 0
    const doel = round(huidig * 35 + opslag, 100)
    suggestions.push({
      key: 'water',
      label: 'Waterdoel',
      value: doel,
      unit: 'ml',
      current: profile.waterGoalMl,
      why:
        `Ongeveer 35 ml per kilo lichaamsgewicht${opslag ? ', plus 300 ml omdat je vaak 30 minuten of meer beweegt' : ''}. ` +
        'Een richtlijn, geen wet — bij warm weer of zware training mag het meer zijn.',
      basis: 'geschat',
    })
  }

  // ---------- beweegminuten ----------
  const weken = Math.max(days.length / 7, 1)
  const minutenPerWeek = Math.round(
    days.reduce((sum, d) => sum + Math.max(workoutMinutes(d), d.exerciseMin ?? 0), 0) / weken,
  )
  if (days.length >= 7) {
    // De richtlijn is 150 minuten. Haal je dat al, dan is een klein stapje
    // zinvoller dan een rond getal dat ver boven je huidige gewoonte ligt.
    const doel =
      minutenPerWeek < 150 ? 150 : round(Math.min(minutenPerWeek * 1.1, minutenPerWeek + 60), 15)
    suggestions.push({
      key: 'exercise',
      label: 'Beweegdoel',
      value: doel,
      unit: 'min/week',
      current: profile.exerciseGoalWeek,
      why:
        minutenPerWeek < 150
          ? `Je zit nu op ongeveer ${minutenPerWeek} minuten per week. De gangbare richtlijn is 150 minuten matige inspanning; dat is het eerste doel om te halen.`
          : `Je haalt nu ongeveer ${minutenPerWeek} minuten per week, ruim boven de richtlijn van 150. Een stapje erbij is realistischer dan een groot rond getal.`,
      basis: 'gemeten',
    })
  }

  // ---------- krachttraining ----------
  const krachtDagen = days.filter((d) => d.workouts.some((w) => w.type === 'krachttraining')).length
  if (days.length >= 7) {
    const perWeek = Math.round((krachtDagen / weken) * 10) / 10
    const doel = perWeek < 2 ? 2 : Math.min(Math.ceil(perWeek), 4)
    suggestions.push({
      key: 'strength',
      label: 'Krachttraining',
      value: doel,
      unit: 'keer/week',
      current: profile.strengthGoalWeek,
      why:
        perWeek < 2
          ? `Je doet nu ongeveer ${nfLocal(perWeek)} keer per week krachttraining. Twee keer is de gangbare ondergrens om je spiermassa te behouden terwijl je afvalt — dit is de belangrijkste rem op spierverlies.`
          : `Je doet nu ongeveer ${nfLocal(perWeek)} keer per week krachttraining. Dat is voldoende om je spiermassa te beschermen tijdens een tekort.`,
      basis: 'gemeten',
    })
  }

  return suggestions
}

const nfLocal = (n: number) => n.toLocaleString('nl-NL')

export function sleepNote(days: DayEntry[]): SleepNote | null {
  const uren = days.map(sleepHours).filter((h): h is number => h != null)
  if (uren.length < 5) return null

  const gemiddeld = Math.round(mean(uren) * 10) / 10
  const metKwaliteit = days.filter((d) => sleepHours(d) != null && d.sleep.quality != null)

  let best: number | null = null
  if (metKwaliteit.length >= 8) {
    const goed = metKwaliteit.filter((d) => (d.sleep.quality ?? 0) >= 4).map((d) => sleepHours(d)!)
    // Alleen melden als je goede nachten merkbaar afwijken van je gemiddelde —
    // anders staat er twee keer hetzelfde getal en zegt het niets.
    if (goed.length >= 3) {
      const g = Math.round(mean(goed) * 10) / 10
      if (Math.abs(g - gemiddeld) >= 0.3) best = g
    }
  }

  const text = best
    ? `Je slaapt gemiddeld ${gemiddeld.toString().replace('.', ',')} uur. Op de nachten die je zelf een 4 of 5 gaf, sliep je gemiddeld ${best
        .toString()
        .replace('.', ',')} uur — dat is jouw eigen omslagpunt, en een bruikbaarder doel dan de algemene 7 tot 9 uur.`
    : `Je slaapt gemiddeld ${gemiddeld.toString().replace('.', ',')} uur. De algemene richtlijn is 7 tot 9 uur. Vul je slaapkwaliteit vaker in, dan kan ik zien bij welke duur jij je het best voelt.`

  return { average: gemiddeld, best, text }
}
