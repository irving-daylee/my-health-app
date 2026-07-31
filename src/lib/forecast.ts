import type { DayEntry, Profile } from '../types'
import { burned, estimatedBmr, intakeKcal, weighIns, weightTrend } from './derive'

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

  return {
    intake,
    goal,
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
