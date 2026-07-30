import type { DayEntry, Profile } from '../types'
import { Card } from '../components/inputs'
import { generateInsights } from '../lib/insights'

export default function Insights({ days, profile }: { days: DayEntry[]; profile: Profile }) {
  const sections = generateInsights(days, profile)

  if (days.length < 3) {
    return (
      <Card title="Inzichten">
        <p className="note">
          Log een paar dagen. Zodra er genoeg meetpunten zijn verschijnen hier vanzelf trends,
          verbanden en doorrekeningen — je hoeft er niets voor aan te zetten.
        </p>
      </Card>
    )
  }

  if (sections.length === 0) {
    return (
      <Card title="Inzichten">
        <p className="note">
          Nog niets te melden. De meeste inzichten hebben minstens vijf gelogde dagen nodig, en de
          verbanden tussen slaap, alcohol en voeding ongeveer acht.
        </p>
      </Card>
    )
  }

  return (
    <>
      {sections.map((sec) => (
        <Card key={sec.title} title={sec.title}>
          {sec.insights.map((ins, i) => (
            <article className={`insight ${ins.tag}`} key={i}>
              <span className="insight-tag">{ins.tagText}</span>
              <h4>{ins.title}</h4>
              <p>{ins.body}</p>
            </article>
          ))}
        </Card>
      ))}
      <p className="note">
        Alles hierboven wordt op je toestel berekend uit je eigen data. Er gaat niets naar buiten en
        er komt geen model aan te pas — het zijn vaste regels over je cijfers.
      </p>
    </>
  )
}
