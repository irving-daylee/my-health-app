import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DayEntry, ISODate, Profile, Settings } from './types'
import { emptyDay } from './types'
import { allDays, getProfile, getSettings, putDay, putProfile, putSettings } from './lib/db'
import { formatDate, shiftISO, todayISO } from './lib/derive'
import Lock from './screens/Lock'
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

export default function App() {
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDate] = useState<ISODate>(todayISO())
  const [days, setDays] = useState<DayEntry[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)

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

  const day = useMemo(
    () => days.find((d) => d.date === date) ?? emptyDay(date),
    [days, date],
  )

  const saveDay = useCallback(
    async (next: DayEntry) => {
      setDays((prev) => {
        const rest = prev.filter((d) => d.date !== next.date)
        return [...rest, next].sort((a, b) => a.date.localeCompare(b.date))
      })
      await putDay(next)
    },
    [],
  )

  const saveProfile = useCallback(async (p: Profile) => {
    setProfile(p)
    await putProfile(p)
  }, [])

  const saveSettings = useCallback(async (s: Settings) => {
    setSettings(s)
    await putSettings(s)
  }, [])

  const showVersion = () => {
    setToast(`Versie ${__APP_VERSION__} — dit is wat er nu op dit toestel draait`)
    setTimeout(() => setToast(''), 3000)
  }

  if (!ready || !profile || !settings) return null

  if (!unlocked) {
    return <Lock settings={settings} onUnlock={() => setUnlocked(true)} />
  }

  const isToday = date === todayISO()

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
              <span className="app-version" onClick={showVersion}>
                v{__APP_VERSION__}
              </span>
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
            <span className="app-version" onClick={showVersion}>
              v{__APP_VERSION__}
            </span>
          </h1>
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
            onProfile={saveProfile}
            onSettings={saveSettings}
            onReload={reload}
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
