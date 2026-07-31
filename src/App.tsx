import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DayEntry, ISODate, Profile, Settings } from './types'
import { emptyDay } from './types'
import { allDays, getProfile, getSettings, putDay, putProfile, putSettings } from './lib/db'
import { formatDate, shiftISO, todayISO } from './lib/derive'
import { syncEnabled } from './lib/firebase'
import { syncLabel } from './lib/sync'
import { useCloudSync } from './lib/useCloudSync'
import Lock from './screens/Lock'
import Login from './screens/Login'
import Today from './screens/Today'
import Trends from './screens/Trends'
import Insights from './screens/Insights'
import SettingsScreen from './screens/Settings'

type Tab = 'today' | 'trends' | 'insights' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Dag', icon: '☀' },
  { id: 'trends', label: 'Trends', icon: '📈' },
  { id: 'insights', label: 'Inzichten', icon: '✦' },
  { id: 'settings', label: 'Instellingen', icon: '⚙' },
]

const SKIP_LOGIN = 'gezondheid_lokaal'

export default function App() {
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [skipLogin, setSkipLogin] = useState(localStorage.getItem(SKIP_LOGIN) === '1')
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDate] = useState<ISODate>(todayISO())
  const [days, setDays] = useState<DayEntry[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

  const applyRemote = useCallback((nextDays: DayEntry[], nextProfile: Profile) => {
    setDays(nextDays)
    setProfile(nextProfile)
  }, [])

  const { user, authReady, state: syncState, syncDay, syncProfile } = useCloudSync(applyRemote)

  useEffect(() => {
    Promise.all([allDays(), getProfile(), getSettings()]).then(([d, p, s]) => {
      setDays(d)
      setProfile(p)
      setSettings(s)
      setUnlocked(!s.pinHash)
      setReady(true)
    })
  }, [])

  const reload = useCallback(async () => setDays(await allDays()), [])

  const day = useMemo(() => days.find((d) => d.date === date) ?? emptyDay(date), [days, date])

  const saveDay = useCallback(
    async (next: DayEntry) => {
      const stamped = { ...next, updatedAt: Date.now() }
      setDays((prev) => {
        const rest = prev.filter((d) => d.date !== stamped.date)
        return [...rest, stamped].sort((a, b) => a.date.localeCompare(b.date))
      })
      await putDay(stamped)
      void syncDay(stamped)
    },
    [syncDay],
  )

  const saveProfile = useCallback(
    async (p: Profile) => {
      const stamped = { ...p, updatedAt: Date.now() }
      setProfile(stamped)
      await putProfile(stamped)
      void syncProfile(stamped)
    },
    [syncProfile],
  )

  const saveSettings = useCallback(async (s: Settings) => {
    setSettings(s)
    await putSettings(s)
  }, [])

  const showToast = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 3000)
  }

  if (!ready || !authReady || !profile || !settings) return null

  if (!unlocked) return <Lock settings={settings} onUnlock={() => setUnlocked(true)} />

  if (syncEnabled && !user && !skipLogin) {
    return (
      <Login
        onLocalOnly={() => {
          localStorage.setItem(SKIP_LOGIN, '1')
          setSkipLogin(true)
        }}
      />
    )
  }

  const isToday = date === todayISO()
  const versionBadge = (
    <span
      className="app-version"
      onClick={() => showToast(`Versie ${__APP_VERSION__} — dit is wat er nu op dit toestel draait`)}
    >
      v{__APP_VERSION__}
    </span>
  )

  return (
    <div className="app">
      <header className="topbar">
        {tab === 'today' ? (
          <>
            <button aria-label="Vorige dag" onClick={() => setDate(shiftISO(date, -1))}>
              ‹
            </button>
            <h1>
              <span style={{ textTransform: 'capitalize' }}>
                {isToday ? 'Vandaag' : formatDate(date).split(' ')[0]}
              </span>
              {versionBadge}
              <span className="sub" style={{ display: 'block' }}>
                {formatDate(date)}
              </span>
            </h1>
            <button
              aria-label="Volgende dag"
              disabled={isToday}
              onClick={() => setDate(shiftISO(date, 1))}
            >
              ›
            </button>
          </>
        ) : (
          <h1>
            {TABS.find((t) => t.id === tab)!.label}
            {versionBadge}
          </h1>
        )}
        {syncEnabled && (
          <span
            className={`sync-dot ${syncState}`}
            title={syncLabel[syncState]}
            onClick={() => showToast(syncLabel[syncState])}
          />
        )}
      </header>

      <main className="content">
        {tab === 'today' && <Today day={day} days={days} profile={profile} onSave={saveDay} />}
        {tab === 'trends' && <Trends days={days} profile={profile} />}
        {tab === 'insights' && <Insights days={days} profile={profile} />}
        {tab === 'settings' && (
          <SettingsScreen
            profile={profile}
            settings={settings}
            days={days}
            user={user}
            syncState={syncState}
            onProfile={saveProfile}
            onSettings={saveSettings}
            onReload={reload}
            onLoginAgain={() => {
              localStorage.removeItem(SKIP_LOGIN)
              setSkipLogin(false)
            }}
          />
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              setTab(t.id)
              if (t.id === 'today') setDate(todayISO())
              window.scrollTo({ top: 0 })
            }}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
