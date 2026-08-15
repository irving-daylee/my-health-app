/**
 * Controleert dat importeren samenvoegt in plaats van overschrijft.
 *
 * Een importbestand bevat vaak maar een deel van een dag — bijvoorbeeld alleen
 * de weegschaalgegevens uit een Fitdays-export. Dan mogen de maaltijden, het
 * water en de slaap van die datum niet verdwijnen. Dat is lastig met het oog te
 * controleren en makkelijk stuk te maken, vandaar deze test.
 *
 * Draait op een IndexedDB in het geheugen, dus er komt geen browser aan te pas
 * en je eigen data blijft ongemoeid.
 *
 * Gebruik: npm run test-import
 */
import 'fake-indexeddb/auto'
import { allDays, getDay, importAll, putDay } from '../src/lib/db'
import { emptyDay } from '../src/types'

let gezakt = 0
const eis = (wat: string, waar: boolean) => {
  console.log(`${waar ? 'ok  ' : 'FOUT'}  ${wat}`)
  if (!waar) gezakt++
}

const bestaand = emptyDay('2026-08-14')
bestaand.meals = [{ id: 'a', name: 'BBQ worstje', kcal: 247 }]
bestaand.workouts = [{ id: 'w', type: 'zaalvoetbal', minutes: 60 }]
bestaand.waterMl = 1250
bestaand.sleep = { hours: 7 }
bestaand.body = { weightKg: 77.3, fasted: true }
await putDay(bestaand)

await importAll({
  version: 1,
  days: [
    // dezelfde dag, maar alleen weegschaalgegevens
    { date: '2026-08-14', body: { weightKg: 77.25, bodyFatPct: 22.4, fasted: true } },
    // en een dag die er nog niet was
    { date: '2025-06-15', body: { weightKg: 73.95, fasted: true } },
  ],
})

const na = await getDay('2026-08-14')
eis('maaltijden blijven staan', na?.meals.length === 1)
eis('trainingen blijven staan', na?.workouts.length === 1)
eis('water blijft staan', na?.waterMl === 1250)
eis('slaap blijft staan', na?.sleep.hours === 7)
eis('gewicht is bijgewerkt', na?.body.weightKg === 77.25)
eis('nieuw veld is toegevoegd', na?.body.bodyFatPct === 22.4)
eis('nieuwe dag is aangemaakt', (await getDay('2025-06-15'))?.body.weightKg === 73.95)
eis('geen dagen verdwenen', (await allDays()).length === 2)

console.log(gezakt === 0 ? '\nAlles goed.' : `\n${gezakt} controle(s) gezakt.`)
process.exit(gezakt === 0 ? 0 : 1)
