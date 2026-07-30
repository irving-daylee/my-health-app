import type { DayEntry, ISODate, Profile, Settings } from '../types'
import { defaultProfile, defaultSettings } from '../types'

const DB_NAME = 'gezondheid'
const DB_VERSION = 1
const DAYS = 'days'
const META = 'meta'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DAYS)) db.createObjectStore(DAYS, { keyPath: 'date' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const getDay = (date: ISODate) => tx<DayEntry | undefined>(DAYS, 'readonly', (s) => s.get(date))

export const putDay = (day: DayEntry) =>
  tx(DAYS, 'readwrite', (s) => s.put({ ...day, updatedAt: Date.now() }))

export const deleteDay = (date: ISODate) => tx(DAYS, 'readwrite', (s) => s.delete(date))

export async function allDays(): Promise<DayEntry[]> {
  const days = await tx<DayEntry[]>(DAYS, 'readonly', (s) => s.getAll())
  return days.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getProfile(): Promise<Profile> {
  const p = await tx<Profile | undefined>(META, 'readonly', (s) => s.get('profile'))
  return { ...defaultProfile, ...(p ?? {}) }
}

export const putProfile = (p: Profile) => tx(META, 'readwrite', (s) => s.put(p, 'profile'))

export async function getSettings(): Promise<Settings> {
  const s = await tx<Settings | undefined>(META, 'readonly', (st) => st.get('settings'))
  return { ...defaultSettings, ...(s ?? {}) }
}

export const putSettings = (s: Settings) => tx(META, 'readwrite', (st) => st.put(s, 'settings'))

export async function exportAll() {
  // de PIN hoort niet in een back-up die je ergens neerzet — die blijft op het toestel
  const [days, profile] = await Promise.all([allDays(), getProfile()])
  return { version: 1, exportedAt: new Date().toISOString(), profile, days }
}

export async function importAll(payload: unknown) {
  const data = payload as { profile?: Profile; days?: DayEntry[] }
  if (!data || !Array.isArray(data.days)) throw new Error('Onbekend bestandsformaat')
  if (data.profile) await putProfile({ ...defaultProfile, ...data.profile })
  for (const day of data.days) {
    if (typeof day?.date === 'string') await putDay(day)
  }
  return data.days.length
}
