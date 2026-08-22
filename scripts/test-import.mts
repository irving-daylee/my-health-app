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
import { emptyDay, normalizeDay } from '../src/types'
import { mergeDays } from '../src/lib/sync'

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


// Een oudere export van je eigen data mag een latere correctie niet terugzetten.
// Zo ging het mis: 's ochtends een tussenstand ingevuld, 's avonds de eindstand,
// en daarna een bestand van tussendoor geimporteerd.
const gecorrigeerd = emptyDay('2026-08-09')
gecorrigeerd.restingKcal = 1916
gecorrigeerd.activeKcal = 232
await putDay(gecorrigeerd)

await importAll({
  version: 1,
  days: [
    {
      date: '2026-08-09',
      restingKcal: 1106,
      waterMl: 750,
      updatedAt: Date.now() - 3 * 60 * 60 * 1000,
    },
  ],
})

const oud = await getDay('2026-08-09')
eis('oudere export overschrijft een correctie niet', oud?.restingKcal === 1916)
eis('oudere export vult wel lege velden aan', oud?.waterMl === 750)

// Een nieuwer bestand mag wel winnen — anders kun je niets meer bijwerken.
await importAll({
  version: 1,
  days: [{ date: '2026-08-09', restingKcal: 2008, updatedAt: Date.now() + 1000 }],
})
eis('nieuwer bestand wint wel', (await getDay('2026-08-09'))?.restingKcal === 2008)

// Een onmogelijke tijdstempel mag een dag niet onbewerkbaar maken. Dit is het
// gevaarlijke geval, omdat het buiten je zicht gebeurt: bij het samenvoegen
// wint de hoogste updatedAt, dus zonder deze afhandeling verliest elke
// bewerking van vandaag van een stempel uit het jaar 3994 -- en draait de
// eerstvolgende sync je wijziging terug.
const kapot = normalizeDay({ date: '2026-08-17', restingKcal: 1700, updatedAt: 63880358400000 })
eis('tijdstempel uit de toekomst wordt genegeerd', kapot.updatedAt === 0)

const mijnCorrectie = { ...kapot, restingKcal: 1850, updatedAt: Date.now() }
const samengevoegd = mergeDays([mijnCorrectie], [kapot])
eis(
  'een correctie wint van zo\'n dag bij het syncen',
  samengevoegd.find((d) => d.date === '2026-08-17')?.restingKcal === 1850,
)

console.log(gezakt === 0 ? '\nAlles goed.' : `\n${gezakt} controle(s) gezakt.`)
process.exit(gezakt === 0 ? 0 : 1)
