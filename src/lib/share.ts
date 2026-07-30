import type { DayEntry, Profile } from '../types'
import { ageAt, burned, intakeKcal, sleepHours, todayISO } from './derive'

/**
 * Compacte tekstweergave om in een Claude-gesprek te plakken. Bewust plat en kort:
 * één regel per dag, zodat een maand data in een paar honderd woorden past.
 */
export function claudeSummary(days: DayEntry[], profile: Profile): string {
  const scoped = days.slice(-90)
  const lines: string[] = []

  lines.push('# Mijn gezondheidsdata')
  lines.push('')
  lines.push(
    `Leeftijd ${ageAt(profile, todayISO())}, lengte ${profile.heightM.toFixed(2)} m, ` +
      `streefgewicht ${profile.targetWeightKg.toFixed(1)} kg, waterdoel ${profile.waterGoalMl} ml.`,
  )
  lines.push(`Periode: ${scoped[0]?.date ?? '—'} t/m ${scoped[scoped.length - 1]?.date ?? '—'}.`)
  lines.push('')
  lines.push(
    'Kolommen: datum | gewicht kg | vet% | vetmassa kg | watergewicht kg | spiermassa kg | ' +
      'verbrand kcal | gegeten kcal | balans kcal | water ml | slaap uur | context',
  )
  lines.push('')

  for (const d of scoped) {
    const b = d.body
    const out = burned(d)
    const inn = intakeKcal(d)
    const context = [
      d.context.alcohol && 'alcohol',
      d.context.ill && 'ziek',
      d.context.travel && 'reisdag',
      d.context.stress && `stress ${d.context.stress}/5`,
      d.sleep.quality && `slaapkwaliteit ${d.sleep.quality}/5`,
      b.fasted === false && 'niet nuchter gewogen',
    ]
      .filter(Boolean)
      .join(', ')

    const cell = (v: number | undefined, digits = 1) => (v == null ? '-' : v.toFixed(digits))

    lines.push(
      [
        d.date,
        cell(b.weightKg),
        cell(b.bodyFatPct),
        cell(b.fatMassKg),
        cell(b.waterMassKg),
        cell(b.muscleMassKg),
        out || '-',
        inn || '-',
        out && inn ? inn - out : '-',
        d.waterMl ?? '-',
        cell(sleepHours(d)),
        context || '-',
      ].join(' | '),
    )
  }

  const meals = scoped.flatMap((d) => d.meals.map((m) => `${d.date}: ${m.name} (${m.kcal ?? '?'} kcal)`))
  if (meals.length) {
    lines.push('')
    lines.push('## Wat ik at en dronk')
    lines.push(...meals.slice(-120))
  }

  const notes = scoped.filter((d) => d.context.notes)
  if (notes.length) {
    lines.push('')
    lines.push('## Notities')
    lines.push(...notes.map((d) => `${d.date}: ${d.context.notes}`))
  }

  return lines.join('\n')
}
