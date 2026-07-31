/**
 * Haalt de laatste stand uit Firebase op naar een lokaal bestand, zodat Claude
 * je data kan lezen zonder dat jij hoeft te exporteren.
 *
 * Gebruikt de Firebase Admin SDK met een serviceaccount. De oude
 * database-geheimen zijn door Firebase afgeschaft; dit is de route die zij
 * aanraden. Een serviceaccount omzeilt de database-regels, dus dit bestand is
 * gevoeliger dan wat dan ook in dit project — vandaar dat zowel .secrets/ als
 * .data/ in .gitignore staan. Deze repo is publiek.
 *
 * Eenmalig instellen:
 *   Firebase Console -> Projectinstellingen -> Serviceaccounts ->
 *   "Nieuwe persoonlijke sleutel genereren" -> opslaan als
 *   .secrets/service-account.json
 *
 * Gebruik: npm run fetch-data
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = resolve(root, '.secrets/service-account.json')
const outPath = resolve(root, '.data/laatste.json')

const DATABASE_URL =
  'https://my-health-app-9243f-default-rtdb.europe-west1.firebasedatabase.app'

if (!existsSync(keyPath)) {
  console.error(
    'Geen serviceaccount gevonden op .secrets/service-account.json.\n' +
      'Firebase Console -> Projectinstellingen -> Serviceaccounts -> ' +
      '"Nieuwe persoonlijke sleutel genereren", en sla het bestand daar op.',
  )
  process.exit(1)
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))),
  databaseURL: DATABASE_URL,
})

const snapshot = await getDatabase().ref('users').once('value')
const data = snapshot.val()

if (!data) {
  console.log('Verbinding werkt, maar er staat nog niets in de database.')
  process.exit(0)
}

mkdirSync(resolve(root, '.data'), { recursive: true })
writeFileSync(outPath, JSON.stringify(data, null, 2))

const accounts = Object.keys(data)
const dagen = accounts.reduce((n, uid) => n + Object.keys(data[uid]?.days ?? {}).length, 0)
console.log(
  `Opgehaald naar .data/laatste.json — ${accounts.length} account(s), ${dagen} dagen, ` +
    `${readFileSync(outPath).length} bytes.`,
)
process.exit(0)
