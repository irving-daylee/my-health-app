import type { DayEntry, ISODate, Profile, Settings } from '../types'
import { seedFoods, type FoodItem } from './foods'
import { defaultProfile, defaultSettings, normalizeDay } from '../types'

const DB_NAME = 'gezondheid'
const DB_VERSION = 2
const DAYS = 'days'
const META = 'meta'
const FOODS = 'foods'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Deze browser geeft geen toegang tot lokale opslag.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    // Een geblokkeerde of nooit-openende verbinding hangt anders oneindig.
    setTimeout(() => reject(new Error('Lokale opslag reageert niet.')), 8000)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DAYS)) db.createObjectStore(DAYS, { keyPath: 'date' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      if (!db.objectStoreNames.contains(FOODS)) {
        const store = db.createObjectStore(FOODS, { keyPath: 'key' })
        // Meteen vullen met de startlijst, zodat de eerste keer invoeren al
        // suggesties geeft in plaats van een lege doos.
        for (const item of seedFoods()) store.add(item)
      }
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

/** Schrijft de dag met een verse tijdstempel — voor bewerkingen door de gebruiker. */
export const putDay = (day: DayEntry) =>
  tx(DAYS, 'readwrite', (s) => s.put({ ...day, updatedAt: Date.now() }))

/**
 * Schrijft de dag precies zoals hij is. Voor sync en import: daar is updatedAt
 * juist het gegeven waarop we beslissen wie wint, dus dat mag niet overschreven
 * worden.
 */
export const putDayRaw = (day: DayEntry) => tx(DAYS, 'readwrite', (s) => s.put(day))

export const deleteDay = (date: ISODate) => tx(DAYS, 'readwrite', (s) => s.delete(date))

/** Dagen inclusief grafstenen — voor sync. Voor weergave: filter op `deleted`. */
export async function allDays(): Promise<DayEntry[]> {
  const days = await tx<DayEntry[]>(DAYS, 'readonly', (s) => s.getAll())
  return days
    .filter((d) => d?.date)
    .map(normalizeDay)
    .sort((a, b) => a.date.localeCompare(b.date))
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

/**
 * Voegt een binnenkomende dag samen met wat er al staat.
 *
 * Twee regels, in deze volgorde:
 *
 * 1. Lege plekken worden altijd aangevuld. Een import bevat vaak maar een
 *    stukje van een dag -- bijvoorbeeld alleen een weging -- en mag de rest
 *    van die dag niet wissen.
 * 2. Een waarde die er al staat wordt alleen vervangen als het bestand
 *    nieuwer is, of als het bestand geen tijdstempel heeft. Zonder die
 *    voorwaarde overschrijft een oude export van je eigen data stilletjes je
 *    latere correcties: werk je 's ochtends een tussenstand bij en 's avonds
 *    de eindstand, dan zet een import van een bestand van tussendoor de
 *    tussenstand terug.
 *
 * Maaltijden en trainingen gaan op `id` samen, zodat dezelfde regel niet
 * dubbel verschijnt.
 */
export function mergeDay(mine: DayEntry | undefined, incoming: DayEntry): DayEntry {
  if (!mine) return incoming
  // Een bestand van een andere app (een weegschaalexport) heeft helemaal geen
  // tijdstempel. Dan valt er niets te vergelijken en is de import zelf het
  // signaal: je haalt hem binnen omdat je die waardes wilt. Alleen bij een
  // bestand dat wel een tijdstempel heeft en aantoonbaar ouder is, houden we
  // vast aan wat hier staat.
  const bestandIsNieuwer =
    (incoming.updatedAt ?? 0) === 0 || (incoming.updatedAt ?? 0) > (mine.updatedAt ?? 0)

  /** Waardes uit het bestand die mogen winnen: alles bij een nieuwer bestand,
   *  anders alleen wat hier nog leeg is. */
  const teNemen = <T extends object>(basis: T, binnen: T): Partial<T> =>
    Object.fromEntries(
      Object.entries(binnen).filter(
        ([k, v]) =>
          v !== undefined &&
          (bestandIsNieuwer || (basis as Record<string, unknown>)[k] === undefined),
      ),
    ) as Partial<T>

  const byId = <T extends { id: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((x) => [x.id, x]))
    // Een bekende regel alleen vervangen als het bestand nieuwer is; onbekende
    // regels komen er hoe dan ook bij.
    for (const x of b) if (bestandIsNieuwer || !map.has(x.id)) map.set(x.id, x)
    return [...map.values()]
  }

  return {
    ...mine,
    ...teNemen(mine, incoming),
    sleep: { ...mine.sleep, ...teNemen(mine.sleep, incoming.sleep) },
    body: { ...mine.body, ...teNemen(mine.body, incoming.body) },
    context: { ...mine.context, ...teNemen(mine.context, incoming.context) },
    meals: byId(mine.meals, incoming.meals),
    workouts: byId(mine.workouts, incoming.workouts),
    // Een import op een gewiste dag brengt hem terug -- maar een oud bestand
    // mag een dag die je later hebt gewist niet uit de dood halen.
    deleted: bestandIsNieuwer ? incoming.deleted : mine.deleted,
    // Het resultaat is nieuwer dan beide bronnen, anders duwt sync de oude
    // serverversie er zo overheen.
    updatedAt: Date.now(),
  }
}

export async function importAll(payload: unknown) {
  const data = payload as { profile?: Profile; days?: DayEntry[] }
  if (!data || !Array.isArray(data.days)) throw new Error('Onbekend bestandsformaat')
  if (data.profile) await putProfile({ ...defaultProfile, ...data.profile })
  for (const day of data.days) {
    if (typeof day?.date !== 'string') continue
    const incoming = normalizeDay(day)
    const mine = await getDay(incoming.date)
    await putDayRaw(mergeDay(mine ? normalizeDay(mine) : undefined, incoming))
  }
  return data.days.length
}

export const allFoods = () => tx<FoodItem[]>(FOODS, 'readonly', (s) => s.getAll())

export async function putFoods(items: FoodItem[]) {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(FOODS, 'readwrite')
    const store = t.objectStore(FOODS)
    for (const item of items) store.put(item)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export const deleteFood = (key: string) => tx(FOODS, 'readwrite', (s) => s.delete(key))
