import type { DayEntry, Profile } from '../types'
import {
  burned,
  estimatedBmr,
  intakeKcal,
  mealKcal,
  minutesOfDay,
  todayISO,
  weighIns,
  weightTrend,
} from './derive'

const KCAL_PER_KG = 7700
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

export type Forecast = {
  /** wat je vandaag tot nu toe hebt gegeten */
  intake: number
  goal: number
  bmr: number | null
  /** verbranding: gemeten als je die al hebt ingevuld, anders je eigen gemiddelde */
  expectedBurn: number | null
  burnIsMeasured: boolean
  /** balans als je vandaag niets meer eet */
  balanceIfStopNow: number | null
  /** balans als je precies je doel volmaakt */
  balanceIfGoal: number | null
  /** kg per week bij dit tempo, uitgaande van de doel-variant */
  kgPerWeekAtGoal: number | null
  /** je gemiddelde inname over de gelogde dagen, om vandaag tegen af te zetten */
  averageIntake: number | null
  belowBmr: boolean
  /** verwachte dagtotaal op basis van jouw eigen eetritme, of null als dat nog niet te zeggen is */
  projectedIntake: number | null
  /** aandeel van een gemiddelde dag dat je op dit uur normaal al binnen hebt */
  shareSoFar: number | null
}

/**
 * Hoeveel procent van je dag je normaal gesproken op dit uur al gegeten hebt.
 * Alleen dagen met tijdstippen tellen mee; met minder dan vijf zulke dagen is
 * het patroon te dun om iets op te baseren.
 */
function typicalShareByNow(days: DayEntry[], minutesNow: number): number | null {
  const aandelen: number[] = []

  for (const d of days) {
    const totaal = intakeKcal(d)
    if (totaal <= 0) continue
    const getimed = d.meals.filter((m) => minutesOfDay(m.time) != null)
    if (getimed.length < 2) continue

    const totNu = getimed
      .filter((m) => minutesOfDay(m.time)! <= minutesNow)
      .reduce((sum, m) => sum + mealKcal(m), 0)
    aandelen.push(totNu / totaal)
  }

  if (aandelen.length < 5) return null
  const gemiddeld = aandelen.reduce((s, a) => s + a, 0) / aandelen.length
  // Te vroeg op de dag is het aandeel zo klein dat delen erdoor onzin oplevert.
  return gemiddeld >= 0.15 ? gemiddeld : null
}

/**
 * Een vooruitblik halverwege de dag. Bewust twee scenario's in plaats van één
 * voorspelling: hoeveel je vanavond nog eet weet niemand, dus geven we de
 * boven- en ondergrens en laten we jou kiezen waar je uitkomt.
 */
export function forecast(today: DayEntry, days: DayEntry[], profile: Profile): Forecast {
  const intake = intakeKcal(today)
  const goal = profile.calorieGoalKcal

  const laatsteWeging = weighIns(days).slice(-1)[0]?.body.weightKg
  const trend = weightTrend(days)
  const gewicht = trend.length ? trend[trend.length - 1].value : laatsteWeging
  const bmr = gewicht ? estimatedBmr(profile, gewicht, today.date) : null

  const vandaagVerbrand = burned(today)
  const historie = days
    .filter((d) => d.date !== today.date)
    .map(burned)
    .filter((b) => b > 0)
  const gemiddeldVerbrand = historie.length >= 3 ? Math.round(mean(historie)) : null

  const expectedBurn = vandaagVerbrand > 0 ? vandaagVerbrand : gemiddeldVerbrand
  const burnIsMeasured = vandaagVerbrand > 0

  const innames = days
    .filter((d) => d.date !== today.date)
    .map(intakeKcal)
    .filter((k) => k > 0)
  const averageIntake = innames.length >= 3 ? Math.round(mean(innames)) : null

  const balanceIfStopNow = expectedBurn == null ? null : intake - expectedBurn
  const balanceIfGoal = expectedBurn == null ? null : Math.max(intake, goal) - expectedBurn
  const kgPerWeekAtGoal =
    balanceIfGoal == null ? null : Math.round(((balanceIfGoal * 7) / KCAL_PER_KG) * 100) / 100

  // Alleen zinvol voor vandaag: bij een dag uit het verleden is 'nu' betekenisloos.
  const isVandaag = today.date === todayISO()
  const nu = new Date()
  const minutenNu = nu.getHours() * 60 + nu.getMinutes()
  const shareSoFar = isVandaag
    ? typicalShareByNow(
        days.filter((d) => d.date !== today.date),
        minutenNu,
      )
    : null
  const projectedIntake =
    shareSoFar != null && intake > 0 ? Math.round(intake / shareSoFar) : null

  return {
    intake,
    goal,
    projectedIntake,
    shareSoFar,
    bmr,
    expectedBurn,
    burnIsMeasured,
    balanceIfStopNow,
    balanceIfGoal,
    kgPerWeekAtGoal,
    averageIntake,
    // Onder je basaalverbruik eten is geen sneller resultaat maar een groter
    // risico op spierverlies; dat hoort een waarschuwing te zijn, geen prestatie.
    belowBmr: bmr != null && intake > 0 && goal < bmr,
  }
}
