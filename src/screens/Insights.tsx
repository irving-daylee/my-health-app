import type { DayEntry, Profile } from '../types'
import { Card } from '../components/inputs'
import { generateInsights } from '../lib/insights'
import { sleepNote, suggestGoals, type Suggestion } from '../lib/goals'

export default function Insights({
  days,
  profile,
  onProfile,
}: {
  days: DayEntry[]
  profile: Profile
  onProfile: (p: Profile) => void
}) {
  const sections = generateInsights(days, profile)
  const suggesties = suggestGoals(days, profile).filter((s) => s.value !== s.current)
  const slaap = sleepNote(days)

  const overnemen = (s: Suggestion) => {
    if (s.key === 'calories') onProfile({ ...profile, calorieGoalKcal: s.value })
    if (s.key === 'water') onProfile({ ...profile, waterGoalMl: s.value })
  }

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
      {(suggesties.length > 0 || slaap) && (
        <Card title="Voorgestelde doelen">
          {suggesties.map((s) => (
            <article className="goal-suggestion" key={s.key}>
              <span className="insight-tag">{s.basis}</span>
              <h4>
                {s.label}: {s.value.toLocaleString('nl-NL')} {s.unit}
              </h4>
              <p>{s.why}</p>
              <div className="goal-suggestion-foot">
                <span className="note">
                  Nu {s.current.toLocaleString('nl-NL')} {s.unit}
                </span>
                <button className="btn secondary" onClick={() => overnemen(s)}>
                  Overnemen
                </button>
              </div>
            </article>
          ))}

          {slaap && (
            <article className="goal-suggestion">
              <h4>Slaap</h4>
              <p>{slaap.text}</p>
            </article>
          )}

          <p className="note" style={{ marginTop: 12 }}>
            Voorstellen, geen instellingen — er verandert niets tot je op Overnemen tikt. Dit zijn
            algemene richtlijnen; heb je een medische reden om op je voeding te letten, overleg dan
            met je huisarts of diëtist.
          </p>
        </Card>
      )}

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
