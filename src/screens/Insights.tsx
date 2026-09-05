import type { DayEntry, Profile } from '../types'
import { Card } from '../components/inputs'
import { generateInsights } from '../lib/insights'
import { sleepNote, suggestGoals, type Suggestion } from '../lib/goals'
import {
  aanbevelingen,
  conclusie,
  gemiddeldLichaam,
  peilingen,
  vergelijkWegingen,
  wegingenInVenster,
} from '../lib/composition'
import { formatDate, nl, signed, weighIns } from '../lib/derive'

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

  // Waar je staat is een niveauvraag, geen dagvraag. Daarom op het gemiddelde
  // van de laatste zeven dagen: één ochtend schommelt te hard om een oordeel
  // aan op te hangen.
  const laatsteWeging = weighIns(days).slice(-1)[0]
  const gemiddeld = laatsteWeging ? gemiddeldLichaam(days, laatsteWeging.date) : null
  const wegingen = laatsteWeging ? wegingenInVenster(days, laatsteWeging.date) : 0
  const peiling =
    gemiddeld && wegingen >= 3 ? peilingen(gemiddeld, profile, laatsteWeging.date) : []
  const adviezen = gemiddeld && peiling.length ? aanbevelingen(peiling, gemiddeld, profile) : []

  const vergelijking = laatsteWeging ? vergelijkWegingen(days, laatsteWeging.date) : null
  const vorigeDag = vergelijking && days.find((d) => d.date === vergelijking.vorige)
  const duiding = vergelijking ? conclusie(vergelijking, vorigeDag ?? undefined) : null

  const overnemen = (s: Suggestion) => {
    if (s.key === 'calories') onProfile({ ...profile, calorieGoalKcal: s.value })
    if (s.key === 'water') onProfile({ ...profile, waterGoalMl: s.value })
    if (s.key === 'exercise') onProfile({ ...profile, exerciseGoalWeek: s.value })
    if (s.key === 'strength') onProfile({ ...profile, strengthGoalWeek: s.value })
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

      {(vergelijking || peiling.length > 0) && (
        <Card title="Lichaamssamenstelling">
          {vergelijking && duiding && (
            <>
              <h4 className="blok-titel">
                {vergelijking.dagenErtussen === 1
                  ? 'Vanochtend tegenover gisterochtend'
                  : `Vanochtend tegenover ${formatDate(vergelijking.vorige)}`}
              </h4>

              {vergelijking.regels.map((r) => (
                <div className={`verschil${r.opvallend ? ' opvallend' : ''}`} key={r.key}>
                  <span className="naam">{r.label}</span>
                  <span className={`sprong ${r.delta > 0 ? 'op' : r.delta < 0 ? 'neer' : 'vlak'}`}>
                    {signed(r.delta, r.decimalen)}
                  </span>
                  <span className="waarden">
                    {nl(r.toen, r.decimalen)} → <strong>{nl(r.nu, r.decimalen)}</strong>
                    {r.unit && ` ${r.unit}`}
                    {/* Alleen als contrast: springt er niets uit, dan zegt de
                        conclusie eronder dat al in één zin. */}
                    {!r.opvallend && vergelijking.uitschieters.length > 0 && (
                      <em>binnen je normale schommeling</em>
                    )}
                  </span>
                </div>
              ))}

              <div className={`duiding ${duiding.toon}`}>
                <strong>{duiding.kop}</strong>
                <p>{duiding.tekst}</p>
              </div>
            </>
          )}

          {peiling.length > 0 && (
            <>
              <h4 className="blok-titel">Waar sta je</h4>
              <p className="note" style={{ marginBottom: 10 }}>
                Op het gemiddelde van je laatste zeven dagen ({wegingen} wegingen), niet op de
                meting van vanochtend.
              </p>
              <div className="peilingen">
                {peiling.map((p) => (
                  <div className={`peiling ${p.oordeel}`} key={p.label}>
                    <div className="peiling-kop">
                      <span className="naam">{p.label}</span>
                      <span className="waarde">{p.waarde}</span>
                    </div>
                    <div className="peiling-oordeel">
                      {p.oordeel === 'goed'
                        ? 'Binnen bereik'
                        : p.oordeel === 'grens'
                          ? 'Tegen de grens'
                          : p.oordeel === 'hoog'
                            ? 'Te hoog'
                            : 'Te laag'}
                      <em>bereik {p.bereik}</em>
                    </div>
                    <p>{p.uitleg}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {adviezen.length > 0 && (
            <>
              <h4 className="blok-titel">Wat ik zou doen</h4>
              <ul className="adviezen">
                {adviezen.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}

          <p className="note" style={{ marginTop: 14 }}>
            De bereiken zijn algemene referenties voor volwassen mannen, geen medisch oordeel en
            niet de drempels van je eigen weegschaal. Een bio-impedantiemeting zit er bovendien
            makkelijk een paar procent naast — stuur op de richting over weken, niet op een losse
            waarde.
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
