import type { DayEntry, ISODate, Profile } from '../types'
import { defaultProfile, normalizeDay } from '../types'
import type { RemoteData } from './firebase'

/**
 * Dagen zijn onafhankelijk van elkaar, dus samenvoegen kan per dag: van elke
 * datum wint de versie die het laatst is bijgewerkt. Twee apparaten die
 * verschillende dagen invullen raken elkaar dus nooit; bewerk je op beide
 * dezelfde dag, dan wint de laatste bewerking — en alleen voor die ene dag.
 */
export function mergeDays(local: DayEntry[], remote: DayEntry[]): DayEntry[] {
  const byDate = new Map<ISODate, DayEntry>()
  for (const day of local) byDate.set(day.date, day)
  for (const day of remote) {
    const mine = byDate.get(day.date)
    if (!mine || (day.updatedAt ?? 0) > (mine.updatedAt ?? 0)) byDate.set(day.date, day)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function mergeProfile(local: Profile, remote: Profile | undefined): Profile {
  if (!remote) return local
  return (remote.updatedAt ?? 0) > (local.updatedAt ?? 0)
    ? { ...defaultProfile, ...remote }
    : local
}

export const remoteDays = (data: RemoteData | null): DayEntry[] =>
  data?.days ? Object.values(data.days).filter((d) => d?.date).map(normalizeDay) : []

/** Dagen die lokaal nieuwer zijn dan wat er op de server staat. */
export function unsyncedDays(local: DayEntry[], remote: DayEntry[]): DayEntry[] {
  const remoteByDate = new Map(remote.map((d) => [d.date, d]))
  return local.filter((d) => {
    const theirs = remoteByDate.get(d.date)
    return !theirs || (d.updatedAt ?? 0) > (theirs.updatedAt ?? 0)
  })
}

export type SyncState = 'off' | 'offline' | 'syncing' | 'synced' | 'error'

export const syncLabel: Record<SyncState, string> = {
  off: 'Sync staat uit — je data blijft op dit toestel',
  offline: 'Geen verbinding — wijzigingen worden lokaal bewaard en later gesynct',
  syncing: 'Bezig met synchroniseren',
  synced: 'Alles gesynchroniseerd',
  error: 'Synchroniseren mislukt — je data staat nog wel lokaal',
}
