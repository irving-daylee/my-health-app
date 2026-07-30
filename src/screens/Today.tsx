import type { Body, DayEntry, Meal, Profile } from '../types'
import { Card, NumberField, Scale, TextField, Toggle } from '../components/inputs'
import {
  balance,
  bmi,
  burned,
  dayDelta,
  estimatedBmr,
  fmt,
  nl,
  intakeKcal,
  signed,
  sleepHours,
  trendDelta,
} from '../lib/derive'

type Props = {
  day: DayEntry
  days: DayEntry[]
  profile: Profile
  onSave: (d: DayEntry) => void
}

export default function Today({ day, days, profile, onSave }: Props) {
  const patch = (p: Partial<DayEntry>) => onSave({ ...day, ...p })
  const patchBody = (p: Partial<Body>) => onSave({ ...day, body: { ...day.body, ...p } })

  const intake = intakeKcal(day)
  const bal = balance(day)
  const trend = trendDelta(days, 7)
  const dDelta = dayDelta(days, day.date)
  const toTarget =
    day.body.weightKg != null ? day.body.weightKg - profile.targetWeightKg : null
  const bmr = day.body.weightKg ? estimatedBmr(profile, day.body.weightKg, day.date) : null

  return (
    <>
      <section className="hero">
        <div className="label">Gewicht</div>
        <div className="value">
          {day.body.weightKg != null ? nl(day.body.weightKg, 1) : '—'}
          <small>kg</small>
        </div>
        <div className="meta">
          <div>
            7-daagse trend
            <strong>{signed(trend, 2, 'kg')}</strong>
          </div>
          <div>
            t.o.v. vorige weging
            <strong>{signed(dDelta, 1, 'kg')}</strong>
          </div>
          <div>
            tot streefgewicht
            <strong>{signed(toTarget, 1, 'kg')}</strong>
          </div>
        </div>
      </section>

      <Card title="Energie">
        <div className="fields">
          <NumberField
            label="Rustcalorieën"
            unit="kcal"
            value={day.restingKcal}
            onChange={(v) => patch({ restingKcal: v })}
          />
          <NumberField
            label="Actieve calorieën"
            unit="kcal"
            value={day.activeKcal}
            onChange={(v) => patch({ activeKcal: v })}
          />
          <NumberField
            label="Beweegminuten"
            unit="min"
            value={day.exerciseMin}
            onChange={(v) => patch({ exerciseMin: v })}
          />
          <NumberField
            label="Sta-uren"
            unit="uur"
            value={day.standHours}
            onChange={(v) => patch({ standHours: v })}
          />
        </div>
        <div className="grid" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="k">Verbrand</div>
            <div className="v">
              {fmt(burned(day) || null)}
              <small>kcal</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Gegeten</div>
            <div className="v">
              {fmt(intake || null)}
              <small>kcal</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Balans</div>
            <div className={`v ${bal == null ? '' : bal < 0 ? 'good' : ''}`}>
              {bal == null ? '—' : signed(bal, 0)}
              <small>kcal</small>
            </div>
          </div>
        </div>
        {bal == null && (
          <p className="note" style={{ marginTop: 10 }}>
            De balans verschijnt zodra zowel je verbranding als je voeding voor deze dag bekend is.
          </p>
        )}
        {bmr != null && (
          <p className="note" style={{ marginTop: 10 }}>
            Geschat basaalverbruik op basis van je profiel: {bmr} kcal. Gebruik dit als sanity check
            op de rustcalorieën uit je horloge, niet als vervanging.
          </p>
        )}
      </Card>

      <Card title="Lichaamssamenstelling">
        <div className="fields">
          <NumberField
            label="Gewicht"
            unit="kg"
            step={0.1}
            value={day.body.weightKg}
            onChange={(v) => patchBody({ weightKg: v })}
          />
          <NumberField
            label="Vetpercentage"
            unit="%"
            step={0.1}
            value={day.body.bodyFatPct}
            onChange={(v) => patchBody({ bodyFatPct: v })}
          />
          <NumberField
            label="Vochtpercentage"
            unit="%"
            step={0.1}
            value={day.body.waterPct}
            onChange={(v) => patchBody({ waterPct: v })}
          />
          <NumberField
            label="Watergewicht"
            unit="kg"
            step={0.1}
            value={day.body.waterMassKg}
            onChange={(v) => patchBody({ waterMassKg: v })}
          />
          <NumberField
            label="Vetmassa"
            unit="kg"
            step={0.1}
            value={day.body.fatMassKg}
            onChange={(v) => patchBody({ fatMassKg: v })}
          />
          <NumberField
            label="Spiermassa"
            unit="kg"
            step={0.1}
            value={day.body.muscleMassKg}
            onChange={(v) => patchBody({ muscleMassKg: v })}
          />
          <NumberField
            label="Botmassa"
            unit="kg"
            step={0.1}
            value={day.body.boneMassKg}
            onChange={(v) => patchBody({ boneMassKg: v })}
          />
          <NumberField
            label="Visceraal vet"
            step={0.1}
            value={day.body.visceralFat}
            onChange={(v) => patchBody({ visceralFat: v })}
          />
        </div>
        <div className="checkline" style={{ marginTop: 12 }}>
          <Toggle
            label="Nuchter gewogen (ochtend)"
            on={day.body.fasted !== false}
            onChange={(v) => patchBody({ fasted: v })}
          />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Alleen nuchtere ochtendwegingen tellen mee in de trend. Zet dit uit bij een avondweging —
          die vervuilt je gemiddelde.
        </p>
        {day.body.weightKg != null && (
          <div className="grid" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="k">BMI</div>
              <div className="v">{nl(bmi(profile, day.body.weightKg), 1)}</div>
            </div>
            {day.body.fatMassKg != null && (
              <div className="stat">
                <div className="k">Vetvrije massa</div>
                <div className="v">
                  {nl(day.body.weightKg - day.body.fatMassKg, 1)}
                  <small>kg</small>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Water">
        <div className="fields">
          <NumberField
            label="Gedronken"
            unit="ml"
            step={50}
            value={day.waterMl}
            onChange={(v) => patch({ waterMl: v })}
          />
          <div className="field">
            <label>Doel</label>
            <input value={`${profile.waterGoalMl} ml`} readOnly />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {[250, 500, 750].map((n) => (
            <button
              key={n}
              className="btn secondary"
              onClick={() => patch({ waterMl: (day.waterMl ?? 0) + n })}
            >
              +{n} ml
            </button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          {day.waterMl != null
            ? `${Math.round((day.waterMl / profile.waterGoalMl) * 100)}% van je doel.`
            : 'Nog niets gelogd.'}
        </p>
      </Card>

      <Card title="Slaap">
        <div className="fields">
          <TextField
            label="Naar bed"
            type="time"
            value={day.sleep.bedtime}
            onChange={(v) => patch({ sleep: { ...day.sleep, bedtime: v } })}
          />
          <TextField
            label="Opgestaan"
            type="time"
            value={day.sleep.wake}
            onChange={(v) => patch({ sleep: { ...day.sleep, wake: v } })}
          />
          <NumberField
            label="Uren (overschrijft)"
            unit="uur"
            step={0.25}
            value={day.sleep.hours}
            onChange={(v) => patch({ sleep: { ...day.sleep, hours: v } })}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Scale
            label="Kwaliteit (1 slecht — 5 uitstekend)"
            value={day.sleep.quality}
            onChange={(v) => patch({ sleep: { ...day.sleep, quality: v as 1 | 2 | 3 | 4 | 5 } })}
          />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Berekend: {fmt(sleepHours(day) ?? null, 1, 'uur')}. Bedtijd en opstaan invullen geeft je
          ook je regelmaat — die hangt sterker samen met gewicht dan de duur alleen.
        </p>
      </Card>

      <FoodCard day={day} onSave={onSave} />

      <Card title="Context">
        <div className="checkline">
          <Toggle
            label="Alcohol"
            on={!!day.context.alcohol}
            onChange={(v) => patch({ context: { ...day.context, alcohol: v } })}
          />
          <Toggle
            label="Ziek"
            on={!!day.context.ill}
            onChange={(v) => patch({ context: { ...day.context, ill: v } })}
          />
          <Toggle
            label="Reisdag"
            on={!!day.context.travel}
            onChange={(v) => patch({ context: { ...day.context, travel: v } })}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Scale
            label="Stress (1 laag — 5 hoog)"
            value={day.context.stress}
            onChange={(v) => patch({ context: { ...day.context, stress: v as 1 | 2 | 3 | 4 | 5 } })}
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Notities</label>
          <textarea
            value={day.context.notes ?? ''}
            placeholder="Wat viel op vandaag?"
            onChange={(e) =>
              patch({ context: { ...day.context, notes: e.target.value || undefined } })
            }
          />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Context verklaart uitschieters achteraf. Alcohol en een reisdag zie je twee dagen later
          nog terug op de weegschaal — zonder deze vinkjes lijkt dat een onverklaarbare piek.
        </p>
      </Card>
    </>
  )
}


/* ---------------- eten en drinken ---------------- */

function FoodCard({ day, onSave }: { day: DayEntry; onSave: (d: DayEntry) => void }) {
  const setMeals = (meals: Meal[]) => onSave({ ...day, meals })

  const update = (id: string, p: Partial<Meal>) =>
    setMeals(day.meals.map((m) => (m.id === id ? { ...m, ...p } : m)))

  return (
    <Card title="Eten en drinken">
      {day.meals.length === 0 && <p className="empty">Nog niets gelogd voor deze dag.</p>}

      {day.meals.map((m) => (
        <div className="meal-top" key={m.id}>
          <input
            className="meal-name"
            value={m.name}
            placeholder="Wat at of dronk je?"
            onChange={(e) => update(m.id, { name: e.target.value })}
          />
          <input
            className="meal-kcal"
            type="text"
            inputMode="numeric"
            placeholder="kcal"
            value={m.kcal ?? ''}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              update(m.id, { kcal: digits === '' ? undefined : Number(digits) })
            }}
          />
          <button
            className="remove"
            aria-label={`${m.name || 'Item'} verwijderen`}
            onClick={() => setMeals(day.meals.filter((x) => x.id !== m.id))}
          >
            ×
          </button>
        </div>
      ))}

      {day.meals.length > 0 && (
        <div className="stat" style={{ marginTop: 12 }}>
          <div className="k">Totaal</div>
          <div className="v">
            {Math.round(intakeKcal(day))}
            <small>kcal</small>
          </div>
        </div>
      )}

      <button
        className="btn block secondary"
        style={{ marginTop: 12 }}
        onClick={() => setMeals([...day.meals, { id: crypto.randomUUID(), name: '' }])}
      >
        Item toevoegen
      </button>
      <p className="note" style={{ marginTop: 10 }}>
        Een ruwe schatting is genoeg. Consequent te hoog of te laag schatten is geen probleem — de
        trend klopt dan nog steeds, alleen het absolute getal niet.
      </p>
    </Card>
  )
}
