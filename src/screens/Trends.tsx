import { useMemo, useState } from 'react'
import type { DayEntry, Profile } from '../types'
import { Card } from '../components/inputs'
import { balance, burned, signed, sleepHours, trendDelta, weighIns, weightTrend } from '../lib/derive'

const RANGES = [
  { label: '30 dagen', days: 30 },
  { label: '90 dagen', days: 90 },
  { label: 'Alles', days: 100000 },
]

export default function Trends({ days, profile }: { days: DayEntry[]; profile: Profile }) {
  const [range, setRange] = useState(30)

  const scoped = useMemo(() => days.slice(-range), [days, range])
  const raw = weighIns(scoped).map((d) => ({ date: d.date, value: d.body.weightKg! }))
  const trend = weightTrend(scoped)

  const balances = scoped.map(balance).filter((b): b is number => b != null)
  const avgBalance = balances.length
    ? Math.round(balances.reduce((s, b) => s + b, 0) / balances.length)
    : null

  const sleeps = scoped.map(sleepHours).filter((h): h is number => h != null)
  const avgSleep = sleeps.length ? sleeps.reduce((s, h) => s + h, 0) / sleeps.length : null

  const burns = scoped.map(burned).filter((b) => b > 0)
  const avgBurn = burns.length ? Math.round(burns.reduce((s, b) => s + b, 0) / burns.length) : null

  const waters = scoped.map((d) => d.waterMl).filter((w): w is number => w != null)
  const avgWater = waters.length ? Math.round(waters.reduce((s, w) => s + w, 0) / waters.length) : null

  const fatMasses = weighIns(scoped)
    .filter((d) => d.body.fatMassKg != null)
    .map((d) => ({ date: d.date, value: d.body.fatMassKg! }))
  const leanMasses = weighIns(scoped)
    .filter((d) => d.body.fatMassKg != null && d.body.weightKg != null)
    .map((d) => ({ date: d.date, value: d.body.weightKg! - d.body.fatMassKg! }))

  return (
    <>
      <div className="checkline">
        {RANGES.map((r) => (
          <button
            key={r.days}
            className="chip"
            aria-pressed={range === r.days}
            onClick={() => setRange(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card title="Gewicht">
        {trend.length < 2 ? (
          <p className="empty">Log minimaal twee nuchtere wegingen om een trend te zien.</p>
        ) : (
          <>
            <LineChart
              series={[
                { points: raw, color: 'var(--grey-400)', width: 1.5, dots: true },
                { points: trend, color: 'var(--navy)', width: 2.5 },
              ]}
              reference={profile.targetWeightKg}
              unit="kg"
            />
            <div className="legend">
              <span className="trend">7-daags gemiddelde</span>
              <span className="raw">losse wegingen</span>
              <span className="target">streefgewicht</span>
            </div>
            <div className="grid" style={{ marginTop: 14 }}>
              <div className="stat">
                <div className="k">Trend 7 dagen</div>
                <div className="v">{signed(trendDelta(days, 7), 2, 'kg')}</div>
              </div>
              <div className="stat">
                <div className="k">Trend 30 dagen</div>
                <div className="v">{signed(trendDelta(days, 30), 2, 'kg')}</div>
              </div>
              <div className="stat">
                <div className="k">Tot streefgewicht</div>
                <div className="v">
                  {signed(trend[trend.length - 1].value - profile.targetWeightKg, 1, 'kg')}
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="Vetmassa vs. vetvrije massa">
        {fatMasses.length < 2 ? (
          <p className="empty">
            Nog te weinig metingen. Dit is de grafiek die er echt toe doet: gewicht verliezen zonder
            spiermassa te verliezen.
          </p>
        ) : (
          <>
            <LineChart
              series={[
                { points: fatMasses, color: 'var(--bad)', width: 2.5 },
                { points: leanMasses, color: 'var(--good)', width: 2.5 },
              ]}
              unit="kg"
            />
            <div className="legend">
              <span style={{ color: 'var(--bad)' }}>vetmassa</span>
              <span style={{ color: 'var(--good)' }}>vetvrije massa</span>
            </div>
          </>
        )}
      </Card>

      <Card title="Gemiddelden over deze periode">
        <div className="grid">
          <div className="stat">
            <div className="k">Caloriebalans</div>
            <div className="v">
              {avgBalance == null ? '—' : signed(avgBalance, 0)}
              <small>kcal/dag</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Slaap</div>
            <div className="v">
              {avgSleep == null ? '—' : avgSleep.toFixed(1)}
              <small>uur</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Verbrand</div>
            <div className="v">
              {avgBurn ?? '—'}
              <small>kcal/dag</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Water</div>
            <div className="v">
              {avgWater ?? '—'}
              <small>ml/dag</small>
            </div>
          </div>
        </div>
        <p className="note" style={{ marginTop: 12 }}>
          Gemiddelden tellen alleen dagen mee waarop je dat onderdeel hebt gelogd — een lege dag
          trekt het cijfer niet omlaag.
        </p>
      </Card>
    </>
  )
}

type Series = {
  points: { date: string; value: number }[]
  color: string
  width: number
  dots?: boolean
}

function LineChart({
  series,
  reference,
  unit,
}: {
  series: Series[]
  reference?: number
  unit: string
}) {
  const W = 600
  const H = 220
  const pad = { top: 14, right: 46, bottom: 22, left: 10 }

  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null

  const dates = [...new Set(all.map((p) => p.date))].sort()
  const values = all.map((p) => p.value).concat(reference != null ? [reference] : [])
  let min = Math.min(...values)
  let max = Math.max(...values)
  const span = max - min || 1
  min -= span * 0.12
  max += span * 0.12

  const x = (date: string) =>
    pad.left +
    (dates.length === 1 ? 0.5 : dates.indexOf(date) / (dates.length - 1)) *
      (W - pad.left - pad.right)
  const y = (v: number) =>
    pad.top + (1 - (v - min) / (max - min)) * (H - pad.top - pad.bottom)

  const path = (pts: { date: string; value: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const ticks = [max, (max + min) / 2, min]

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafiek">
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--grey-200)"
            strokeWidth={1}
          />
          <text x={W - pad.right + 6} y={y(t) + 4} fontSize={11} fill="var(--grey-600)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}

      {reference != null && (
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={y(reference)}
          y2={y(reference)}
          stroke="var(--good)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}

      {series.map((s, i) => (
        <g key={i}>
          <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />
          {s.dots &&
            s.points.map((p) => (
              <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={2.5} fill={s.color} />
            ))}
        </g>
      ))}

      <text x={pad.left} y={H - 4} fontSize={11} fill="var(--grey-600)">
        {dates[0]}
      </text>
      <text x={W - pad.right} y={H - 4} fontSize={11} fill="var(--grey-600)" textAnchor="end">
        {dates[dates.length - 1]} ({unit})
      </text>
    </svg>
  )
}
