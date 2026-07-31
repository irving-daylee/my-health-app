import { useEffect, useRef, useState } from 'react'
import type { Body, DayEntry, Meal, Profile, Workout, WorkoutType } from '../types'
import { WORKOUT_LABELS } from '../types'
import { allFoods, putFoods } from '../lib/db'
import { learnFromDay, searchFoods, type FoodItem } from '../lib/foods'
import { forecast } from '../lib/forecast'
import { Card, NumberField, Scale, TimeField, Toggle } from '../components/inputs'
import {
  balance,
  bmi,
  burned,
  dayDelta,
  estimatedBmr,
  fmt,
  intakeKcal,
  mealKcal,
  nl,
  signed,
  sleepHours,
  trendDelta,
  weightWarning,
  workoutKcal,
  workoutMinutes,
} from '../lib/derive'

type Props = {
  day: DayEntry
  days: DayEntry[]
  profile: Profile
  onSave: (d: DayEntry) => void
  onFoodsChanged: () => void
}

export default function Today({ day, days, profile, onSave, onFoodsChanged }: Props) {
  const patch = (p: Partial<DayEntry>) => onSave({ ...day, ...p })
  const patchBody = (p: Partial<Body>) => onSave({ ...day, body: { ...day.body, ...p } })

  const intake = intakeKcal(day)
  const bal = balance(day)
  const trend = trendDelta(days, 7)
  const dDelta = dayDelta(days, day.date)
  const toTarget =
    day.body.weightKg != null ? day.body.weightKg - profile.targetWeightKg : null
  const bmr = day.body.weightKg ? estimatedBmr(profile, day.body.weightKg, day.date) : null
  const gewichtWaarschuwing = weightWarning(days, day.date, day.body.weightKg)

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

      <WorkoutCard day={day} days={days} profile={profile} onSave={onSave} />

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
        {gewichtWaarschuwing && (
          <p className="note warn" style={{ marginTop: 10 }}>
            {gewichtWaarschuwing}
          </p>
        )}

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
          <TimeField
            label="Naar bed"
            value={day.sleep.bedtime}
            onChange={(v) => patch({ sleep: { ...day.sleep, bedtime: v } })}
          />
          <TimeField
            label="Opgestaan"
            value={day.sleep.wake}
            onChange={(v) => patch({ sleep: { ...day.sleep, wake: v } })}
          />
          <NumberField
            label="Uren totaal"
            unit="uur"
            step={0.25}
            placeholder="auto"
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

      <FoodCard
        day={day}
        days={days}
        profile={profile}
        onSave={onSave}
        onFoodsChanged={onFoodsChanged}
      />

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

function FoodCard({
  day,
  days,
  profile,
  onSave,
  onFoodsChanged,
}: {
  day: DayEntry
  days: DayEntry[]
  profile: Profile
  onSave: (d: DayEntry) => void
  onFoodsChanged: () => void
}) {
  const [foods, setFoods] = useState<FoodItem[]>([])
  // Welke regel zijn suggesties toont. Deze status hoort hier en niet in het
  // veld zelf: dan kan een herberekening van de lijst hem niet dichttrekken.
  const [openFor, setOpenFor] = useState<string | null>(null)

  useEffect(() => {
    void allFoods().then(setFoods)
  }, [])

  // Opnemen in de lijst gebeurt pas als je het veld verlaat. Een timer op het
  // typen leverde halve woorden op: pauzeer je even midden in een naam, dan
  // stond die tussenstand er als los item in.
  const leer = () => {
    setFoods((known) => {
      const next = learnFromDay(day, known)
      if (next !== known) void putFoods(next).then(onFoodsChanged)
      return next
    })
  }

  // Tweede net onder het verlaten van het veld: blur vuurt niet in elke
  // situatie, en dan zou een item nooit worden opgenomen.
  useEffect(() => {
    const timer = setTimeout(leer, 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  const doel = profile.calorieGoalKcal
  const totaal = intakeKcal(day)
  const pct = doel > 0 ? Math.round((totaal / doel) * 100) : 0
  const setMeals = (meals: Meal[]) => onSave({ ...day, meals })

  const update = (id: string, p: Partial<Meal>) =>
    setMeals(day.meals.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const digits = (v: string) => {
    const cleaned = v.replace(/\D/g, '')
    return cleaned === '' ? undefined : Number(cleaned)
  }

  return (
    <Card title="Eten en drinken">
      {day.meals.length === 0 && <p className="empty">Nog niets gelogd voor deze dag.</p>}

      {day.meals.map((m) => (
        <div className="meal-row" key={m.id}>
          <NameField
            value={m.name}
            foods={foods}
            open={openFor === m.id}
            onOpen={() => setOpenFor(m.id)}
            onClose={() => setOpenFor(null)}
            onChange={(name) => update(m.id, { name })}
            onPick={(item) => update(m.id, { name: item.name, kcal: item.kcal })}
            onSettled={leer}
          />
          <div className="meal-calc">
            <label>
              <span>aantal</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1"
                value={m.qty ?? ''}
                onChange={(e) => update(m.id, { qty: digits(e.target.value) })}
              />
            </label>
            <span className="meal-op">×</span>
            <label>
              <span>kcal per stuk</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={m.kcal ?? ''}
                onChange={(e) => update(m.id, { kcal: digits(e.target.value) })}
              />
            </label>
            <span className="meal-op">=</span>
            <span className="meal-sum">{mealKcal(m).toLocaleString('nl-NL')}</span>
            <button
              className="remove"
              aria-label={`${m.name || 'Item'} verwijderen`}
              onClick={() => setMeals(day.meals.filter((x) => x.id !== m.id))}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {day.meals.length > 0 && (
        <div className="meal-total">
          <span>Totaal</span>
          <strong>{intakeKcal(day).toLocaleString('nl-NL')} kcal</strong>
        </div>
      )}

      {day.meals.length > 0 && (
        <div className="goal">
          <div className="goal-head">
            <span>
              <strong>{totaal}</strong> van {doel} kcal
            </span>
            <span className={pct > 100 ? 'over' : ''}>{pct}%</span>
          </div>
          <div className="goal-bar">
            <div
              className={`goal-fill${pct > 100 ? ' over' : ''}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className="note" style={{ marginTop: 6 }}>
            {pct > 100
              ? `${totaal - doel} kcal boven je doel.`
              : `Nog ${doel - totaal} kcal tot je doel.`}
          </p>
        </div>
      )}

      {totaal > 0 && <Vooruitblik day={day} days={days} profile={profile} />}

      <button
        className="btn block secondary"
        style={{ marginTop: 14 }}
        onClick={() => setMeals([...day.meals, { id: crypto.randomUUID(), name: '' }])}
      >
        Item toevoegen
      </button>
      <p className="note" style={{ marginTop: 10 }}>
        Aantal keer calorieën per stuk. Vier glazen wijn wordt dus 4 × 150. Laat je het aantal leeg,
        dan telt het als 1. Een ruwe schatting is genoeg — consequent te hoog of te laag schatten
        houdt de trend nog steeds kloppend, alleen het absolute getal niet.
      </p>
    </Card>
  )
}


/* ---------------- naamveld met suggesties ---------------- */

function NameField({
  value,
  foods,
  open,
  onOpen,
  onClose,
  onChange,
  onPick,
  onSettled,
}: {
  value: string
  foods: FoodItem[]
  open: boolean
  onOpen: () => void
  onClose: () => void
  onChange: (name: string) => void
  onPick: (item: FoodItem) => void
  onSettled: () => void
}) {
  const wrap = useRef<HTMLDivElement>(null)

  const treffers = value.trim() ? searchFoods(foods, value) : []
  const toon = open && treffers.length > 0

  // De lijst blijft staan tot je kiest, ernaast tikt of Escape drukt. Bewust
  // niet sluiten op blur: op mobiel sluit het toetsenbord dan de lijst mee.
  useEffect(() => {
    if (!toon) return
    const buiten = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', buiten)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', buiten)
      document.removeEventListener('keydown', escape)
    }
  }, [toon, onClose])

  return (
    <div className="name-field" ref={wrap}>
      <input
        className="meal-name"
        value={value}
        placeholder="Wat at of dronk je?"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          onOpen()
        }}
        onFocus={onOpen}
        onBlur={onSettled}
      />
      {toon && (
        <ul className="suggestions">
          {treffers.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => {
                  onPick(f)
                  onClose()
                }}
              >
                <span>{f.name}</span>
                <strong>{f.kcal} kcal</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------------- training ---------------- */

const WORKOUT_TYPES = Object.keys(WORKOUT_LABELS) as WorkoutType[]

function WorkoutCard({
  day,
  days,
  profile,
  onSave,
}: {
  day: DayEntry
  days: DayEntry[]
  profile: Profile
  onSave: (d: DayEntry) => void
}) {
  // deze week = de laatste zeven dagen tot en met vandaag
  const week = days.filter((d) => d.date <= day.date).slice(-7)
  const weekMinuten = week.reduce(
    (sum, d) => sum + Math.max(workoutMinutes(d), d.exerciseMin ?? 0),
    0,
  )
  const weekKracht = week.filter((d) =>
    d.workouts.some((w) => w.type === 'krachttraining'),
  ).length
  const setWorkouts = (workouts: Workout[]) => onSave({ ...day, workouts })
  const update = (id: string, p: Partial<Workout>) =>
    setWorkouts(day.workouts.map((w) => (w.id === id ? { ...w, ...p } : w)))

  const kcal = workoutKcal(day)
  const minuten = workoutMinutes(day)
  const getal = (v: string) => (v === '' ? undefined : Number(v.replace(/\D/g, '')))

  return (
    <Card title="Training">
      {day.workouts.length === 0 && <p className="empty">Nog geen training gelogd.</p>}

      {day.workouts.map((w) => (
        <div className="workout-row" key={w.id}>
          <div className="workout-top">
            <select
              value={w.type}
              onChange={(e) => update(w.id, { type: e.target.value as WorkoutType })}
            >
              {WORKOUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WORKOUT_LABELS[type]}
                </option>
              ))}
            </select>
            <button
              className="remove"
              aria-label="Training verwijderen"
              onClick={() => setWorkouts(day.workouts.filter((x) => x.id !== w.id))}
            >
              ×
            </button>
          </div>
          <div className="workout-fields">
            <label>
              <span>minuten</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="60"
                value={w.minutes ?? ''}
                onChange={(e) => update(w.id, { minutes: getal(e.target.value) })}
              />
            </label>
            <label>
              <span>kcal</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="500"
                value={w.kcal ?? ''}
                onChange={(e) => update(w.id, { kcal: getal(e.target.value) })}
              />
            </label>
          </div>
        </div>
      ))}

      {day.workouts.length > 0 && (
        <>
          <div className="grid" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="k">Totaal</div>
              <div className="v">
                {minuten}
                <small>min</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">Geschat verbrand</div>
              <div className="v">
                {kcal}
                <small>kcal</small>
              </div>
            </div>
          </div>

          <p className="note" style={{ marginTop: 10 }}>
            Deze calorieën tellen <strong>niet</strong> mee in je balans — je horloge rekent deze
            inspanning al mee in je actieve calorieën, en twee keer tellen maakt je balans
            onbruikbaar.
            {day.activeKcal == null && kcal > 0 && ' Heb je geen horlogedata? Neem ze dan over:'}
          </p>

          {day.activeKcal == null && kcal > 0 && (
            <button
              className="btn secondary"
              style={{ marginTop: 8 }}
              onClick={() =>
                onSave({ ...day, activeKcal: kcal, exerciseMin: day.exerciseMin ?? minuten })
              }
            >
              Gebruik {kcal} kcal als actieve calorieën
            </button>
          )}
        </>
      )}

      <div className="grid" style={{ marginTop: day.workouts.length ? 14 : 0 }}>
        <div className="stat">
          <div className="k">Deze week bewogen</div>
          <div className="v">
            {weekMinuten}
            <small>van {profile.exerciseGoalWeek} min</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Krachttraining</div>
          <div className="v">
            {weekKracht}
            <small>van {profile.strengthGoalWeek} keer</small>
          </div>
        </div>
      </div>

      <button
        className="btn block secondary"
        style={{ marginTop: 14 }}
        onClick={() =>
          setWorkouts([...day.workouts, { id: crypto.randomUUID(), type: 'zaalvoetbal' }])
        }
      >
        Training toevoegen
      </button>
    </Card>
  )
}


/* ---------------- vooruitblik ---------------- */

function Vooruitblik({
  day,
  days,
  profile,
}: {
  day: DayEntry
  days: DayEntry[]
  profile: Profile
}) {
  const f = forecast(day, days, profile)
  const kg = (kcal: number) => nl((kcal * 7) / 7700, 2)

  return (
    <div className="forecast">
      <h4>Waar kom je vandaag uit?</h4>

      <ul className="forecast-lines">
        {f.expectedBurn != null && (
          <li>
            <span>Verbranding vandaag</span>
            <strong>
              {f.expectedBurn} kcal
              <em>{f.burnIsMeasured ? 'ingevuld' : 'jouw gemiddelde'}</em>
            </strong>
          </li>
        )}

        {f.balanceIfStopNow != null && (
          <li>
            <span>Als je nu stopt met eten</span>
            <strong className={f.balanceIfStopNow < 0 ? 'good' : 'warn'}>
              {signed(f.balanceIfStopNow, 0)} kcal
              <em>{kg(f.balanceIfStopNow)} kg per week</em>
            </strong>
          </li>
        )}

        {f.balanceIfGoal != null && (
          <li>
            <span>Als je je doel volmaakt</span>
            <strong className={f.balanceIfGoal < 0 ? 'good' : 'warn'}>
              {signed(f.balanceIfGoal, 0)} kcal
              <em>{f.kgPerWeekAtGoal != null ? nl(f.kgPerWeekAtGoal, 2) : '—'} kg per week</em>
            </strong>
          </li>
        )}

        {f.bmr != null && (
          <li>
            <span>Basaalverbruik</span>
            <strong>
              {f.bmr} kcal
              <em>
                {f.intake < f.bmr
                  ? `je zit er ${f.bmr - f.intake} kcal onder`
                  : `je zit er ${f.intake - f.bmr} kcal boven`}
              </em>
            </strong>
          </li>
        )}

        {f.averageIntake != null && (
          <li>
            <span>Je gemiddelde dag</span>
            <strong>
              {f.averageIntake} kcal
              <em>
                {f.intake > f.averageIntake
                  ? `${f.intake - f.averageIntake} meer dan gebruikelijk`
                  : `${f.averageIntake - f.intake} minder tot nu toe`}
              </em>
            </strong>
          </li>
        )}
      </ul>

      {f.expectedBurn == null && (
        <p className="note">
          Zodra je een paar dagen je verbranding hebt ingevuld, reken ik hier vooruit met jouw eigen
          gemiddelde in plaats van met niets.
        </p>
      )}

      {f.belowBmr && (
        <p className="note warn">
          Je caloriedoel ligt onder je basaalverbruik. Dat levert geen sneller resultaat op, wel meer
          kans op spierverlies en slechte energie.
        </p>
      )}
    </div>
  )
}
