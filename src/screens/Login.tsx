import { useState } from 'react'
import { friendlyAuthError, loginWithEmail, loginWithGoogle } from '../lib/firebase'

export default function Login({ onLocalOnly }: { onLocalOnly: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      setError(friendlyAuthError(code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-box">
        <h1>Gezondheid</h1>
        <p className="login-sub">Log in om je data te synchroniseren tussen je telefoon en laptop.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => loginWithEmail(email, password))
          }}
        >
          <div className="field">
            <label>E-mailadres</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Wachtwoord</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            className="btn block"
            type="submit"
            style={{ marginTop: 16 }}
            disabled={busy || !email || !password}
          >
            {busy ? 'Bezig…' : 'Inloggen'}
          </button>
        </form>

        <button
          className="btn block secondary"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={() => void run(loginWithGoogle)}
        >
          Inloggen met Google
        </button>

        {error && (
          <p className="error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={onLocalOnly}>
          Verder zonder inloggen
        </button>
        <p className="note" style={{ marginTop: 4 }}>
          Zonder inloggen werkt alles gewoon, maar blijft je data op dit toestel en synct er niets.
        </p>
      </div>
    </div>
  )
}
