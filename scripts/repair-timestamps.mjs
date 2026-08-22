/**
 * Herstelt dagen met een onmogelijke tijdstempel in Firebase.
 *
 * Bij een import zijn 397 dagen weggeschreven met een `updatedAt` in het jaar
 * 3994. Bij het samenvoegen wint de hoogste tijdstempel, dus die dagen zijn
 * niet meer te corrigeren: je wijziging van vandaag verliest, en de sync draait
 * hem terug. De app negeert zulke stempels sinds v1.20.0, maar in de database
 * staan ze nog -- en een ouder apparaat leest ze wel.
 *
 * Dit script zet alleen de tijdstempel goed. Aan je gegevens wordt niets
 * veranderd: gewicht, voeding, water en slaap blijven exact zoals ze zijn.
 *
 * Eerst kijken wat er zou gebeuren:  node scripts/repair-timestamps.mjs
 * Daarna daadwerkelijk uitvoeren:    node scripts/repair-timestamps.mjs --uitvoeren
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = resolve(root, '.secrets/service-account.json')
const DATABASE_URL =
  'https://my-health-app-9243f-default-rtdb.europe-west1.firebasedatabase.app'

if (!existsSync(keyPath)) {
  console.error('Geen serviceaccount op .secrets/service-account.json.')
  process.exit(1)
}

const uitvoeren = process.argv.includes('--uitvoeren')

initializeApp({
  credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
  databaseURL: DATABASE_URL,
})
const db = getDatabase()

// Ruime marge: alles voorbij morgen kan geen echte bewerking zijn.
const grens = Date.now() + 86_400_000
const snapshot = await db.ref('users').once('value')
const alles = snapshot.val() ?? {}

let gevonden = 0
const teHerstellen = []
for (const uid of Object.keys(alles)) {
  for (const [datum, dag] of Object.entries(alles[uid]?.days ?? {})) {
    if ((dag?.updatedAt ?? 0) > grens) {
      gevonden++
      // De dag zelf is oud; een lage stempel zorgt dat elke echte bewerking wint.
      teHerstellen.push({ uid, datum, was: dag.updatedAt })
    }
  }
}

console.log(`${gevonden} dag(en) met een onmogelijke tijdstempel.`)
if (gevonden > 0) {
  const datums = teHerstellen.map((d) => d.datum).sort()
  console.log(`Bereik: ${datums[0]} tot en met ${datums[datums.length - 1]}`)
}

if (!uitvoeren) {
  console.log('\nDit was een proefdraai. Voer uit met --uitvoeren om te herstellen.')
  process.exit(0)
}

if (gevonden === 0) process.exit(0)

// Altijd eerst een kopie, zodat dit terug te draaien is.
if (!existsSync(resolve(root, '.data'))) mkdirSync(resolve(root, '.data'))
const backupPad = resolve(root, '.data/voor-herstel.json')
writeFileSync(backupPad, JSON.stringify(alles, null, 2))
console.log(`Kopie van de huidige stand: ${backupPad}`)

for (const { uid, datum } of teHerstellen) {
  await db.ref(`users/${uid}/days/${datum}/updatedAt`).set(0)
}
console.log(`${teHerstellen.length} dag(en) hersteld.`)
process.exit(0)
