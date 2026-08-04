import { useState, type ReactNode } from 'react'

/** "74,6" en "74.6" leveren allebei 74.6 op; onvolledige invoer geeft null. */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(',', '.')
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Een `type="number"`-veld weigert de komma op een Nederlands toetsenbord: zodra
 * je die typt wordt de waarde leeg. Daarom een tekstveld met een decimaal
 * toetsenbord, dat tijdens het typen de ruwe tekst vasthoudt en pas bij het
 * verlaten opschoont.
 */
export function NumberField(props: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  step?: number
  unit?: string
  placeholder?: string
  /** vaste hoeveelheid decimalen in de weergave; tijdens typen blijft je invoer staan */
  decimals?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const shown =
    draft ??
    (props.value == null
      ? ''
      : props.decimals != null
        ? props.value.toLocaleString('nl-NL', {
            minimumFractionDigits: props.decimals,
            maximumFractionDigits: props.decimals,
          })
        : String(props.value).replace('.', ','))

  const handle = (raw: string) => {
    // cijfers, één scheidingsteken, optioneel minteken vooraan
    const filtered = raw
      .replace(/[^\d.,-]/g, '')
      .replace(/(?!^)-/g, '')
      .replace(/([.,])(?=.*[.,])/g, '')
    setDraft(filtered)

    if (filtered.trim() === '') {
      props.onChange(undefined)
      return
    }
    const parsed = parseDecimal(filtered)
    if (parsed != null) props.onChange(parsed)
  }

  return (
    <div className="field">
      <label>
        {props.label}
        {props.unit ? ` (${props.unit})` : ''}
      </label>
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        placeholder={props.placeholder}
        value={shown}
        onChange={(e) => handle(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

export function TextField(props: {
  label: string
  value: string | undefined
  onChange: (v: string | undefined) => void
  type?: string
  placeholder?: string
  /** eigen volle regel — voor datum- en tijdvelden, die per browser anders breed zijn */
  wide?: boolean
}) {
  return (
    <div className={`field${props.wide ? ' wide' : ''}`}>
      <label>{props.label}</label>
      <input
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </div>
  )
}

/**
 * Tijd als gewoon tekstveld. De native tijdkiezer heeft per browser een eigen
 * minimumbreedte en laat zich niet altijd leegmaken; dit veld doet allebei wel.
 * Invoer mag los: 7, 23:15, 2315 en 23.15 worden allemaal HH:MM.
 */
export function TimeField(props: {
  label: string
  value: string | undefined
  onChange: (v: string | undefined) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const normaliseer = (raw: string): string | undefined => {
    const cijfers = raw.replace(/\D/g, '')
    if (cijfers.length === 0) return undefined
    let u: number
    let m = 0
    if (cijfers.length <= 2) u = Number(cijfers)
    else {
      u = Number(cijfers.slice(0, cijfers.length - 2))
      m = Number(cijfers.slice(-2))
    }
    if (u > 23 || m > 59) return undefined
    return `${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        placeholder="23:15"
        value={draft ?? props.value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d:.]/g, '')
          setDraft(raw)
          props.onChange(normaliseer(raw))
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

/** Datum als DD-MM-JJJJ, om dezelfde reden als TimeField. */
export function DateField(props: {
  label: string
  value: string | undefined
  onChange: (iso: string | undefined) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const naarISO = (raw: string): string | undefined => {
    const c = raw.replace(/\D/g, '')
    if (c.length !== 8) return undefined
    const [d, m, j] = [c.slice(0, 2), c.slice(2, 4), c.slice(4)]
    const datum = new Date(`${j}-${m}-${d}T12:00:00`)
    if (Number.isNaN(datum.getTime())) return undefined
    return `${j}-${m}-${d}`
  }

  const toon = (iso: string | undefined) => {
    if (!iso) return ''
    const [j, m, d] = iso.split('-')
    return `${d}-${m}-${j}`
  }

  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        placeholder="15-07-1991"
        value={draft ?? toon(props.value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, '')
          setDraft(raw)
          const iso = naarISO(raw)
          if (iso) props.onChange(iso)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}

export function Toggle(props: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={props.on}
      onClick={() => props.onChange(!props.on)}
    >
      {props.label}
    </button>
  )
}

export function Scale(props: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <div className="checkline">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="chip"
            aria-pressed={props.value === n}
            onClick={() => props.onChange(props.value === n ? undefined : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Card(props: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(props.title || props.action) && (
        <div className="card-head">
          <h3>{props.title}</h3>
          {props.action}
        </div>
      )}
      {props.children}
    </section>
  )
}
