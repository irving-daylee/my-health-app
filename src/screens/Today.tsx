import { useEffect, useRef, useState } from 'react'
import type { Body, DayEntry, Meal, Profile, Workout, WorkoutType } from '../types'
import { WORKOUT_LABELS } from '../types'
import { allFoods, putFoods } from '../lib/db'
import { learnFromDay, searchFoods, type FoodItem } from '../lib/foods'
import { forecast } from '../lib/forecast'
import { predictNextWeight } from '../lib/predict'
import { Card, NumberField, Scale, TimeField, Toggle } from '../components/inputs'
import {
  balance,
  burned,
  dagdeel,
  DAGDEEL_LABELS,
  type Dagdeel,
  dayDelta,
  derivedBody,
  estimatedBmr,
  fmt,
  formatDate,
  intakeKcal,
  intakeProtein,
  mealKcal,
  minutesOfDay,
  nowTime,
  nl,
  signed,
  sleepHours,
  todayISO,
  trendDelta,
  weekDays,
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
  onDelete: () => void
}

export default function Today({ day, days, profile, onSave, onFoodsChanged, onDelete }: Props) {
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
  const afgeleid = derivedBody(day.body, profile)

  return (
    <>
      <section className="hero">
        <div className="label">Gewicht</div>
        <div className="value">
          {day.body.weightKg != null ? nl(day.body.weightKg, 2) : '—'}
          <small>kg</small>
        </div>
        <div className="meta">
          <div>
            7-daagse trend
            <strong>{signed(trend, 2, 'kg')}</strong>
          </div>
          <div>
            t.o.v. vorige weging
            <strong>{signed(dDelta, 2, 'kg')}</strong>
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
            label="Lichaamsvet"
            unit="%"
            step={0.1}
            value={day.body.bodyFatPct}
            onChange={(v) => patchBody({ bodyFatPct: v })}
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
            label="Eiwit"
            unit="%"
            step={0.1}
            value={day.body.proteinPct}
            onChange={(v) => patchBody({ proteinPct: v })}
          />
          <NumberField
            label="Watergewicht"
            unit="kg"
            step={0.1}
            value={day.body.waterMassKg}
            onChange={(v) => patchBody({ waterMassKg: v })}
          />
          <NumberField
            label="Lichaamswater"
            unit="%"
            step={0.1}
            value={day.body.waterPct}
            onChange={(v) => patchBody({ waterPct: v })}
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
        {afgeleid && (
          <>
            <div className="grid" style={{ marginTop: 12 }}>
              <div className="stat">
                <div className="k">BMI</div>
                <div className="v">{nl(afgeleid.bmi, 1)}</div>
              </div>
              {afgeleid.vetvrij != null && (
                <div className="stat">
                  <div className="k">Vetvrije massa</div>
                  <div className="v">
                    {nl(afgeleid.vetvrij, 1)}
                    <small>kg</small>
                  </div>
                </div>
              )}
              {afgeleid.ffmi != null && (
                <div className="stat">
                  <div className="k">FFMI</div>
                  <div className="v">{nl(afgeleid.ffmi, 1)}</div>
                </div>
              )}
              {afgeleid.eiwit.kg != null && (
                <div className="stat">
                  <div className="k">Eiwitmassa</div>
                  <div className="v">
                    {nl(afgeleid.eiwit.kg, 1)}
                    <small>kg</small>
                  </div>
                </div>
              )}
              {afgeleid.vet.afgeleid && afgeleid.vet.kg != null && afgeleid.vet.pct != null && (
                <div className="stat">
                  <div className="k">Vet {day.body.fatMassKg == null ? '(kg)' : '(%)'}</div>
                  <div className="v">
                    {day.body.fatMassKg == null ? nl(afgeleid.vet.kg, 1) : nl(afgeleid.vet.pct, 1)}
                    <small>{day.body.fatMassKg == null ? 'kg' : '%'}</small>
                  </div>
                </div>
              )}
              {afgeleid.vocht.afgeleid && afgeleid.vocht.kg != null && afgeleid.vocht.pct != null && (
                <div className="stat">
                  <div className="k">
                    Lichaamswater {day.body.waterMassKg == null ? '(kg)' : '(%)'}
                  </div>
                  <div className="v">
                    {day.body.waterMassKg == null
                      ? nl(afgeleid.vocht.kg, 1)
                      : nl(afgeleid.vocht.pct, 1)}
                    <small>{day.body.waterMassKg == null ? 'kg' : '%'}</small>
                  </div>
                </div>
              )}
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              Deze waarden rekent de app zelf uit; je hoeft alleen over te typen wat Fitdays je
              toont. FFMI is je vetvrije massa gedeeld door je lengte in het kwadraat — BMI zonder
              het vet mee te tellen, en daarmee het getal dat laat zien of je spiermassa vasthoudt.
            </p>
          </>
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
          <button
            className="btn secondary"
            onClick={() => patch({ waterMl: (day.waterMl ?? 0) + 550 })}
          >
            +550 ml
          </button>
          <WaterAdd onAdd={(n) => patch({ waterMl: (day.waterMl ?? 0) + n })} />
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
        </div>
        <div style={{ marginTop: 12 }}>
          <Scale
            label="Kwaliteit (1 slecht — 5 uitstekend)"
            value={day.sleep.quality}
            onChange={(v) => patch({ sleep: { ...day.sleep, quality: v as 1 | 2 | 3 | 4 | 5 } })}
          />
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Slaapduur: {fmt(sleepHours(day) ?? null, 1, 'uur')} — berekend uit je bedtijd en het
          tijdstip waarop je opstond. Bedtijd en opstaan invullen geeft je
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
          <Toggle
            label="Voetbal"
            on={!!day.context.football}
            onChange={(v) => patch({ context: { ...day.context, football: v } })}
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

      <Card title="Deze dag">
        <p className="note" style={{ marginBottom: 12 }}>
          Verwijdert alles wat je op {formatDate(day.date)} hebt ingevuld, ook op je andere
          apparaten. Dit is niet terug te draaien.
        </p>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Alles van ${formatDate(day.date)} verwijderen?`)) onDelete()
          }}
        >
          Dag wissen
        </button>
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
  const [sortering, setSortering] = useState<SortKey>('tijd')
  const [deel, setDeel] = useState<Dagdeel | 'alles'>('alles')

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
  const eiwit = Math.round(intakeProtein(day))
  const pct = doel > 0 ? Math.round((totaal / doel) * 100) : 0
  const setMeals = (meals: Meal[]) => onSave({ ...day, meals })

  const update = (id: string, p: Partial<Meal>) =>
    setMeals(day.meals.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const digits = (v: string) => {
    const cleaned = v.replace(/\D/g, '')
    return cleaned === '' ? undefined : Number(cleaned)
  }

  // Per dagdeel tellen we vooraf, zodat de knoppen meteen laten zien waar je
  // calorieën zitten — dat is de vraag achter het filteren.
  const perDeel = (['ochtend', 'middag', 'avond'] as Dagdeel[]).map((d) => {
    const items = day.meals.filter((m) => dagdeel(m.time) === d)
    return { deel: d, items, kcal: items.reduce((s, m) => s + mealKcal(m), 0) }
  })
  const zonderTijd = day.meals.filter((m) => dagdeel(m.time) === null)
  const getoond = deel === 'alles' ? day.meals : day.meals.filter((m) => dagdeel(m.time) === deel)

  return (
    <Card title="Eten en drinken">
      {day.meals.length === 0 && <p className="empty">Nog niets gelogd voor deze dag.</p>}

      {day.meals.length > 1 && (
        <>
          <div className="deel-row">
            <button
              type="button"
              className="chip"
              aria-pressed={deel === 'alles'}
              onClick={() => setDeel('alles')}
            >
              Alles <em>{day.meals.length}</em>
            </button>
            {perDeel
              .filter((d) => d.items.length > 0)
              .map((d) => (
                <button
                  key={d.deel}
                  type="button"
                  className="chip"
                  aria-pressed={deel === d.deel}
                  onClick={() => setDeel(deel === d.deel ? 'alles' : d.deel)}
                >
                  {DAGDEEL_LABELS[d.deel]} <em>{d.kcal.toLocaleString('nl-NL')} kcal</em>
                </button>
              ))}
          </div>

          <div className="sort-row">
            <label htmlFor="meal-sort">Sorteren op</label>
            <select
              id="meal-sort"
              value={sortering}
              onChange={(e) => setSortering(e.target.value as SortKey)}
            >
              <option value="tijd">Tijd</option>
              <option value="aantal">Aantal</option>
              <option value="kcal">Kcal per stuk</option>
              <option value="totaal">Kcal totaal</option>
            </select>
          </div>
        </>
      )}

      {deel !== 'alles' && zonderTijd.length > 0 && (
        <p className="note" style={{ marginBottom: 10 }}>
          {zonderTijd.length} {zonderTijd.length === 1 ? 'item heeft' : 'items hebben'} geen tijd en
          valt daardoor buiten dit filter. Vul de tijd in om het mee te laten tellen.
        </p>
      )}

      {sorteer(getoond, sortering).map((m) => (
        <div className="meal-row" key={m.id}>
          <NameField
            value={m.name}
            foods={foods}
            open={openFor === m.id}
            onOpen={() => setOpenFor(m.id)}
            onClose={() => setOpenFor(null)}
            onChange={(name) => update(m.id, { name })}
            onPick={(item) =>
              update(m.id, { name: item.name, kcal: item.kcal, proteinG: item.proteinG })
            }
            onSettled={leer}
          />
          <div className="meal-calc">
            <label className="meal-time">
              <span>tijd</span>
              <TimeCell
                value={m.time}
                onChange={(time) => update(m.id, { time })}
                onSettled={leer}
              />
            </label>
            <label className="meal-qty">
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
            <label className="meal-kcal">
              <span>kcal</span>
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

      {deel !== 'alles' && (
        <div className="meal-total subtotal">
          <span>{DAGDEEL_LABELS[deel]}</span>
          <strong>{getoond.reduce((s, m) => s + mealKcal(m), 0).toLocaleString('nl-NL')} kcal</strong>
        </div>
      )}

      {day.meals.length > 0 && (
        <div className="meal-total">
          <span>Totaal</span>
          <strong>
            {intakeKcal(day).toLocaleString('nl-NL')} kcal
            {eiwit > 0 && <em>{eiwit} g eiwit</em>}
          </strong>
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
        onClick={() =>
          setMeals([
            ...day.meals,
            {
              id: crypto.randomUUID(),
              name: '',
              // Op een dag uit het verleden zegt 'nu' niets, dus dan leeg laten.
              time: day.date === todayISO() ? nowTime() : undefined,
            },
          ])
        }
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
  // deze week = vanaf maandag tot en met de dag die je bekijkt
  const week = weekDays(days, day.date)
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
        {f.projectedIntake != null && (
          <li>
            <span>Op dit tempo eet je vandaag</span>
            <strong className={f.projectedIntake > f.goal ? 'warn' : 'good'}>
              ~{f.projectedIntake.toLocaleString('nl-NL')} kcal
              <em>
                normaal heb je nu {Math.round((f.shareSoFar ?? 0) * 100)}% van je dag binnen
              </em>
            </strong>
          </li>
        )}

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

      {f.projectedIntake != null &&
        f.averageIntake != null &&
        f.projectedIntake < f.averageIntake * 0.6 && (
          <p className="note warn">
            Deze schatting ligt ver onder je gebruikelijke dag. Waarschijnlijk staat er nog iets niet
            in — reken er pas op als je alles hebt gelogd.
          </p>
        )}

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

      <MorgenVerwachting day={day} days={days} />
    </div>
  )
}

/**
 * De weging van morgenochtend. Bewust een band en geen enkel getal: één dag
 * verschil op de weegschaal is voor het grootste deel vocht, en dat laat zich
 * niet op honderd gram voorspellen.
 */
function MorgenVerwachting({ day, days }: { day: DayEntry; days: DayEntry[] }) {
  const p = predictNextWeight(days, day.date)
  if (!p) return null

  return (
    <>
      <h4 style={{ marginTop: 18 }}>Morgenochtend op de weegschaal</h4>
      <ul className="forecast-lines">
        <li>
          <span>Verwacht</span>
          <strong>
            {nl(p.expected, 1)} kg
            <em>
              meestal tussen {nl(p.low, 1)} en {nl(p.high, 1)} kg
            </em>
          </strong>
        </li>
        <li>
          <span>Je niveau nu</span>
          <strong>
            {nl(p.level, 1)} kg
            <em>je wegingen zonder de dagruis</em>
          </strong>
        </li>
        {p.carryPart != null && Math.abs(p.carryPart) >= 0.05 && (
          <li>
            <span>Blijft hangen van vandaag</span>
            <strong className={p.carryPart > 0 ? 'warn' : 'good'}>
              {signed(p.carryPart, 2, 'kg')}
              <em>{Math.round(p.carryShare * 100)}% van je afwijking van vanochtend</em>
            </strong>
          </li>
        )}
        {p.effects.map((e) => (
          <li key={e.key}>
            <span>{e.label} vandaag</span>
            <strong className={e.kg > 0 ? 'warn' : 'good'}>
              {signed(e.kg, 2, 'kg')}
              <em>bij jou gemeten over {e.days} keer</em>
            </strong>
          </li>
        ))}

        {p.balancePart != null && (
          <li>
            <span>Door vandaag</span>
            <strong className={p.balancePart < 0 ? 'good' : 'warn'}>
              {signed(p.balancePart, 2, 'kg')}
              <em>
                {p.balancePart < 0 ? 'minder' : 'meer'} gegeten dan je gemiddelde dag
              </em>
            </strong>
          </li>
        )}
      </ul>
      <p className="note">
        De band is ± {nl(p.noise, 1)} kg: zo ver zat deze voorspelling er in het verleden bij jou
        naast, gemeten over {p.basis} wegingen. Zout, een zware training of een laat avondmaal
        verschuiven je vocht makkelijk meer dan het vet van een hele dag. Je trend van{' '}
        {signed(p.trendPerWeek, 2, 'kg')} per week zit hier bewust niet in — over één dag is die te
        klein om te meten, en meerekenen maakte de voorspelling aantoonbaar slechter.
      </p>
    </>
  )
}


/**
 * Tijdinvoer binnen een regel: 8, 800 en 08:00 leveren allemaal 08:00 op. Tijdens
 * het typen blijft staan wat je intikt; pas als je het veld verlaat wordt het
 * netjes gezet.
 */
function TimeCell({
  value,
  onChange,
  onSettled,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  onSettled: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const normaliseer = (raw: string): string | undefined => {
    const c = raw.replace(/\D/g, '')
    if (!c) return undefined
    const uur = c.length <= 2 ? Number(c) : Number(c.slice(0, c.length - 2))
    const min = c.length <= 2 ? 0 : Number(c.slice(-2))
    if (uur > 23 || min > 59) return undefined
    return `${String(uur).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="--:--"
      value={draft ?? value ?? ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d:]/g, '')
        setDraft(raw)
        onChange(normaliseer(raw))
      }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        setDraft(null)
        onSettled()
      }}
    />
  )
}


/** Eigen hoeveelheid water optellen, naast de vaste knop. */
function WaterAdd({ onAdd }: { onAdd: (ml: number) => void }) {
  const [waarde, setWaarde] = useState('')
  const ml = Number(waarde.replace(/\D/g, ''))

  return (
    <span className="water-add">
      <input
        type="text"
        inputMode="numeric"
        placeholder="ml"
        value={waarde}
        onChange={(e) => setWaarde(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ml > 0) {
            onAdd(ml)
            setWaarde('')
          }
        }}
      />
      <button
        className="btn secondary"
        disabled={!ml}
        onClick={() => {
          onAdd(ml)
          setWaarde('')
        }}
      >
        Optellen
      </button>
    </span>
  )
}


/* ---------------- sorteren van je items ---------------- */

type SortKey = 'tijd' | 'aantal' | 'kcal' | 'totaal'

/**
 * Alleen de weergave verandert; de opgeslagen volgorde blijft zoals je hem
 * invoerde. Regels zonder tijdstip zakken naar onderen, want die horen nergens
 * in je dag thuis.
 */
function sorteer(meals: Meal[], key: SortKey): Meal[] {
  const kopie = [...meals]
  if (key === 'tijd') {
    // Na middernacht hoort achteraan, niet vooraan: een biertje om kwart voor
    // een sluit je dag af. Dezelfde grens als bij het dagdeel.
    const opDagvolgorde = (m: Meal) => {
      const t = minutesOfDay(m.time)
      return t == null ? null : t < 4 * 60 ? t + 24 * 60 : t
    }
    return kopie.sort((a, b) => {
      const ta = opDagvolgorde(a)
      const tb = opDagvolgorde(b)
      if (ta == null && tb == null) return 0
      if (ta == null) return 1
      if (tb == null) return -1
      return ta - tb
    })
  }
  // bij getallen het grootste eerst: daar kijk je naar als je sorteert
  const waarde = (m: Meal) =>
    key === 'aantal' ? (m.qty ?? 1) : key === 'kcal' ? (m.kcal ?? 0) : mealKcal(m)
  return kopie.sort((a, b) => waarde(b) - waarde(a))
}
