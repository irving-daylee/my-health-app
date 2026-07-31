import { useState } from 'react'
import { friendlyAuthError, loginWithEmail, loginWithGoogle, resetPassword } from '../lib/firebase'

export default function Login({ onLocalOnly }: { onLocalOnly: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setSent('')
    try {
      await fn()
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      setError(friendlyAuthError(code))
    } finally {
      setBusy(false)
    }
  }

  const GENERIC_RESET = 'Als er een account op dit adres staat, is er een resetlink verstuurd.'

  const forgot = async () => {
    setBusy(true)
    setError('')
    setSent('')
    try {
      await resetPassword(email)
      setSent(GENERIC_RESET)
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      // "Dit adres bestaat niet" is een antwoord op de vraag wie hier een
      // account heeft. Onbekende adressen krijgen daarom exact dezelfde
      // melding als bestaande; alleen echte fouten tonen we wel.
      if (code === 'auth/user-not-found') setSent(GENERIC_RESET)
      else setError(friendlyAuthError(code))
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

        <button className="btn ghost block" disabled={busy || !email} onClick={() => void forgot()}>
          Wachtwoord vergeten
        </button>

        <button
          className="btn block secondary"
          disabled={busy}
          onClick={() => void run(loginWithGoogle)}
        >
          Inloggen met Google
        </button>

        {sent && (
          <p className="note" style={{ marginTop: 12 }}>
            {sent}
          </p>
        )}
        {error && (
          <p className="error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <hr className="login-sep" />

        <button className="btn ghost block" onClick={onLocalOnly}>
          Verder zonder inloggen
        </button>
        <p className="note">
          Alles werkt dan gewoon, maar je data blijft op dit toestel en synct niet. Je ziet dat
          bovenin de app staan en kunt daar altijd alsnog inloggen.
        </p>
      </div>
    </div>
  )
}
