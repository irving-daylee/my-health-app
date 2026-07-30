import { useEffect, useState } from 'react'
import type { Settings } from '../types'
import { unlockWithBiometrics, verifyPin } from '../lib/lock'

export default function Lock(props: { settings: Settings; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const credId = props.settings.biometricCredentialId

  const tryBiometrics = async () => {
    if (!credId) return
    setMsg('')
    try {
      if (await unlockWithBiometrics(credId)) props.onUnlock()
    } catch {
      setMsg('Biometrie geannuleerd — gebruik je PIN.')
    }
  }

  // Face ID / Touch ID meteen aanbieden; PIN blijft als terugval staan.
  useEffect(() => {
    if (credId) void tryBiometrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await verifyPin(pin, props.settings.pinHash!)) props.onUnlock()
    else {
      setMsg('Onjuiste PIN.')
      setPin('')
    }
  }

  return (
    <div className="lock">
      <h1>Gezondheid</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          autoFocus={!credId}
        />
        <button className="btn" type="submit" disabled={pin.length < 4}>
          Ontgrendelen
        </button>
      </form>
      {credId && (
        <button className="btn secondary" onClick={tryBiometrics}>
          Face ID / Touch ID
        </button>
      )}
      <p className="msg">{msg}</p>
    </div>
  )
}
