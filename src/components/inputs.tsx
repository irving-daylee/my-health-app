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
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const shown = draft ?? (props.value == null ? '' : String(props.value).replace('.', ','))

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
}) {
  return (
    <div className="field">
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
