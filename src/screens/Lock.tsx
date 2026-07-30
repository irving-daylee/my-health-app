import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '../types'
import { PIN_LENGTH, unlockWithBiometrics, verifyPin } from '../lib/lock'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

export default function Lock(props: { settings: Settings; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [msg, setMsg] = useState('')
  const credId = props.settings.biometricCredentialId

  const tryBiometrics = useCallback(async () => {
    if (!credId) return
    setMsg('')
    try {
      if (await unlockWithBiometrics(credId)) props.onUnlock()
    } catch {
      setMsg('Biometrie geannuleerd — gebruik je PIN.')
    }
  }, [credId, props])

  // Face ID meteen aanbieden; de PIN blijft eronder staan als terugval.
  useEffect(() => {
    void tryBiometrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zodra de code compleet is meteen controleren — geen bevestigknop nodig.
  useEffect(() => {
    if (pin.length < PIN_LENGTH) return
    let cancelled = false
    verifyPin(pin, props.settings.pinHash!).then((ok) => {
      if (cancelled) return
      if (ok) props.onUnlock()
      else {
        setError(true)
        setMsg('Onjuiste PIN')
        setTimeout(() => {
          setError(false)
          setPin('')
        }, 500)
      }
    })
    return () => {
      cancelled = true
    }
  }, [pin, props])

  const press = (key: string) => {
    if (error) return
    setMsg('')
    if (key === 'back') setPin((p) => p.slice(0, -1))
    else setPin((p) => (p.length < PIN_LENGTH ? p + key : p))
  }

  // fysiek toetsenbord op de Mac
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`pin-lock ${error ? 'shake' : ''}`}>
      <h1>Gezondheid</h1>
      <p className="pin-subtitle">Voer je PIN in</p>

      <div className="pin-dots">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <div
            key={i}
            className={`dot ${error ? 'error' : i < pin.length ? 'filled' : ''}`}
          />
        ))}
      </div>

      <div className="pin-keypad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <button key={i} className="pin-key empty" tabIndex={-1} aria-hidden />
          ) : (
            <button
              key={i}
              className={`pin-key ${k === 'back' ? 'backspace' : ''}`}
              aria-label={k === 'back' ? 'Wissen' : k}
              onClick={() => press(k)}
            >
              {k === 'back' ? '⌫' : k}
            </button>
          ),
        )}
      </div>

      {credId && (
        <button className="pin-biometric" onClick={tryBiometrics}>
          Face ID gebruiken
        </button>
      )}

      <p className="pin-msg">{msg}</p>
    </div>
  )
}
