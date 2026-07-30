import type { ReactNode } from 'react'

export function NumberField(props: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  step?: number
  unit?: string
  placeholder?: string
}) {
  return (
    <div className="field">
      <label>
        {props.label}
        {props.unit ? ` (${props.unit})` : ''}
      </label>
      <input
        type="number"
        inputMode="decimal"
        step={props.step ?? 1}
        placeholder={props.placeholder}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
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
