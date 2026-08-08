import { useEffect, useRef, useState } from 'react'
import type { DayEntry, Profile, Settings } from '../types'
import { Card, NumberField } from '../components/inputs'
import { allFoods, deleteFood, exportAll, importAll, putFoods } from '../lib/db'
import { foodKey, type FoodItem } from '../lib/foods'
import { ageAt, birthDateForAge, todayISO } from '../lib/derive'
import { PIN_LENGTH, biometricsAvailable, hashPin, registerBiometrics } from '../lib/lock'
import { claudeSummary } from '../lib/share'
import { logout, syncEnabled } from '../lib/firebase'
import { syncLabel, type SyncState } from '../lib/sync'
import type { User } from 'firebase/auth'

type Props = {
  profile: Profile
  settings: Settings
  days: DayEntry[]
  user: User | null
  syncState: SyncState
  onProfile: (p: Profile) => void
  onSettings: (s: Settings) => void
  onReload: () => Promise<void>
  onLoginAgain: () => void
}

export default function SettingsScreen({
  profile,
  settings,
  days,
  user,
  syncState,
  onProfile,
  onSettings,
  onReload,
  onLoginAgain,
}: Props) {
  const [msg, setMsg] = useState('')
  const [pin, setPin] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const share = async () => {
    const text = claudeSummary(days, profile)
    const file = new File([text], `gezondheid-${todayISO()}.md`, { type: 'text/markdown' })
    try {
      // Web Share Level 2 — hiermee kun je het bestand rechtstreeks aan de Claude-app geven.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mijn gezondheidsdata' })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: 'Mijn gezondheidsdata', text })
        return
      }
      await copy()
    } catch (e) {
      // een geannuleerd deelvenster is geen fout
      if (e instanceof Error && e.name !== 'AbortError') setMsg('Delen mislukt: ' + e.message)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(claudeSummary(days, profile))
      setMsg('Samenvatting gekopieerd — plak hem in een Claude-gesprek.')
    } catch {
      setMsg('Kopiëren mislukt. Gebruik de exportknop hieronder.')
    }
  }

  const download = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gezondheid-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (file: File) => {
    try {
      const count = await importAll(JSON.parse(await file.text()))
      await onReload()
      setMsg(`${count} dagen samengevoegd met wat er al stond.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Import mislukt.')
    }
  }

  const setPinCode = async () => {
    onSettings({ ...settings, pinHash: await hashPin(pin) })
    setPin('')
    setMsg('PIN ingesteld.')
  }

  const enableBiometrics = async () => {
    try {
      const id = await registerBiometrics()
      onSettings({ ...settings, biometricCredentialId: id })
      setMsg('Face ID / Touch ID ingeschakeld.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Instellen mislukt.')
    }
  }

  return (
    <>
      {syncEnabled && (
        <Card title="Synchronisatie">
          {user ? (
            <>
              <p className="note">
                Ingelogd als <strong>{user.email ?? 'onbekend account'}</strong>.{' '}
                {syncLabel[syncState]}.
              </p>
              <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => void logout()}>
                Uitloggen
              </button>
            </>
          ) : (
            <>
              <p className="note">
                Je werkt nu alleen op dit toestel. Log in om je dagen te delen met je andere
                apparaten — wat hier al staat wordt daarbij meegenomen.
              </p>
              <button className="btn" style={{ marginTop: 12 }} onClick={onLoginAgain}>
                Inloggen
              </button>
            </>
          )}
        </Card>
      )}

      <Card title="Profiel">
        <div className="fields">
          <NumberField
            label="Leeftijd"
            unit="jaar"
            value={ageAt(profile, todayISO())}
            onChange={(v) =>
              v != null &&
              v > 0 &&
              v < 120 &&
              onProfile({ ...profile, birthDate: birthDateForAge(profile.birthDate, v) })
            }
          />
          <NumberField
            label="Lengte"
            unit="m"
            step={0.01}
            value={profile.heightM}
            onChange={(v) => v && onProfile({ ...profile, heightM: v })}
          />
          <NumberField
            label="Streefgewicht"
            unit="kg"
            step={0.01}
            decimals={2}
            value={profile.targetWeightKg}
            onChange={(v) => v && onProfile({ ...profile, targetWeightKg: v })}
          />
          <NumberField
            label="Caloriedoel"
            unit="kcal"
            step={50}
            value={profile.calorieGoalKcal}
            onChange={(v) => v && onProfile({ ...profile, calorieGoalKcal: v })}
          />
          <NumberField
            label="Beweegdoel"
            unit="min/week"
            step={15}
            value={profile.exerciseGoalWeek}
            onChange={(v) => v && onProfile({ ...profile, exerciseGoalWeek: v })}
          />
          <NumberField
            label="Krachttraining"
            unit="keer/week"
            value={profile.strengthGoalWeek}
            onChange={(v) => v && onProfile({ ...profile, strengthGoalWeek: v })}
          />
          <NumberField
            label="Waterdoel"
            unit="ml"
            step={100}
            value={profile.waterGoalMl}
            onChange={(v) => v && onProfile({ ...profile, waterGoalMl: v })}
          />
          <div className="field">
            <label>Geslacht (voor BMR-schatting)</label>
            <select
              value={profile.sex ?? ''}
              onChange={(e) =>
                onProfile({
                  ...profile,
                  sex: e.target.value === '' ? undefined : (e.target.value as 'male' | 'female'),
                })
              }
            >
              <option value="">Niet ingevuld</option>
              <option value="male">Man</option>
              <option value="female">Vrouw</option>
            </select>
          </div>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Je leeftijd telt vanzelf op zodra je jarig bent — je geboortedag blijft onderwater
          bewaard. Geslacht is alleen nodig voor de basaalverbruik-schatting; zonder invulling
          wordt die simpelweg niet getoond.
        </p>
      </Card>

      <FoodsCard />

      <Card title="Slot">
        <p className="note" style={{ marginBottom: 12 }}>
          {settings.pinHash
            ? 'Er staat een PIN op de app.'
            : 'Zonder PIN opent de app direct. Dit is een deur, geen kluis: de data zelf is niet met de PIN versleuteld.'}
        </p>
        <div className="row">
          <input
            type="password"
            inputMode="numeric"
            placeholder={`Nieuwe PIN (${PIN_LENGTH} cijfers)`}
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            style={{
              border: '1px solid var(--grey-200)',
              borderRadius: 10,
              padding: '10px 12px',
              flex: 1,
              minWidth: 140,
            }}
          />
          <button className="btn" disabled={pin.length !== PIN_LENGTH} onClick={setPinCode}>
            Instellen
          </button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {biometricsAvailable() && (
            <button className="btn secondary" onClick={enableBiometrics}>
              {settings.biometricCredentialId
                ? 'Face ID opnieuw koppelen'
                : 'Face ID / Touch ID inschakelen'}
            </button>
          )}
          {settings.pinHash && (
            <button
              className="btn ghost"
              onClick={() =>
                onSettings({ ...settings, pinHash: undefined, biometricCredentialId: undefined })
              }
            >
              Slot verwijderen
            </button>
          )}
        </div>
      </Card>

      <Card title="Naar Claude">
        <p className="note" style={{ marginBottom: 12 }}>
          Stuur je data naar de Claude-app om vragen te stellen die verder gaan dan de vaste
          inzichten. Delen opent het iOS-deelvenster; kopiëren zet een compacte samenvatting op je
          klembord die je in een gesprek plakt.
        </p>
        <div className="row">
          <button className="btn" onClick={share}>
            Delen
          </button>
          <button className="btn secondary" onClick={copy}>
            Kopiëren
          </button>
        </div>
      </Card>

      <Card title="Back-up">
        <p className="note" style={{ marginBottom: 12 }}>
          Je data staat alleen op dit toestel. Wis je je browseropslag, dan is die weg. Exporteer
          regelmatig — je PIN gaat niet mee in het bestand.
        </p>
        <div className="row">
          <button className="btn" onClick={download}>
            Exporteren ({days.length} {days.length === 1 ? 'dag' : 'dagen'})
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            Importeren
          </button>
        </div>
      </Card>

      {msg && <p className="note">{msg}</p>}
    </>
  )
}


/* ---------------- beheer van je itemlijst ---------------- */

function FoodsCard() {
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void allFoods().then(setFoods)
  }, [])

  const zichtbaar = foods
    .filter((f) => f.key.includes(foodKey(filter)))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))

  const bewerk = (key: string, p: Partial<FoodItem>) => {
    const next = foods.map((f) => (f.key === key ? { ...f, ...p } : f))
    setFoods(next)
    const gewijzigd = next.find((f) => f.key === key)
    if (gewijzigd) void putFoods([gewijzigd])
  }

  const wis = (key: string) => {
    setFoods((prev) => prev.filter((f) => f.key !== key))
    void deleteFood(key)
  }

  return (
    <Card title={`Mijn items (${foods.length})`}>
      <p className="note" style={{ marginBottom: 12 }}>
        Alles wat je met een naam en calorieën opslaat komt hier vanzelf in. De twee velden zijn
        calorieën en eiwit in gram; eiwit mag leeg blijven. Typefouten gooi je eruit met het kruisje.
      </p>

      <div className="field">
        <label>Zoeken</label>
        <input
          type="text"
          value={filter}
          placeholder="Bijvoorbeeld: bolletje"
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="food-list">
        {zichtbaar.length === 0 && <p className="empty">Geen items gevonden.</p>}
        {zichtbaar.map((f) => (
          <div className="food-row" key={f.key}>
            <input
              className="food-name"
              value={f.name}
              onChange={(e) => bewerk(f.key, { name: e.target.value })}
            />
            <input
              className="food-kcal"
              type="text"
              inputMode="numeric"
              aria-label="calorieën"
              value={f.kcal}
              onChange={(e) => bewerk(f.key, { kcal: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            />
            <input
              className="food-protein"
              type="text"
              inputMode="numeric"
              aria-label="eiwit in gram"
              placeholder="g"
              value={f.proteinG ?? ''}
              onChange={(e) => {
                const cijfers = e.target.value.replace(/\D/g, '')
                bewerk(f.key, { proteinG: cijfers === '' ? undefined : Number(cijfers) })
              }}
            />
            <button className="remove" aria-label={`${f.name} verwijderen`} onClick={() => wis(f.key)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}
