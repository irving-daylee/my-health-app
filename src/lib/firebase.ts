import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { getDatabase, off, onValue, ref, set, type Database } from 'firebase/database'
import { firebaseConfig, syncEnabled } from '../firebase.config'
import type { DayEntry, ISODate, Profile } from '../types'
import type { FoodItem } from './foods'

export { syncEnabled }

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Database | null = null

function init() {
  if (!syncEnabled) throw new Error('Sync staat uit: vul eerst firebase.config.ts in.')
  if (!app) {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getDatabase(app)
    // ingelogd blijven na het sluiten van de app
    void setPersistence(auth, browserLocalPersistence)
  }
  return { auth: auth!, db: db! }
}

export type RemoteData = {
  profile?: Profile
  days?: Record<ISODate, DayEntry>
  foods?: Record<string, FoodItem>
}

export function watchAuth(cb: (user: User | null) => void): () => void {
  if (!syncEnabled) {
    cb(null)
    return () => {}
  }
  return onAuthStateChanged(init().auth, cb)
}

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(init().auth, email, password)

export const loginWithGoogle = () => signInWithPopup(init().auth, new GoogleAuthProvider())

export const logout = () => signOut(init().auth)

/** Firebase mailt zelf een resetlink; wij krijgen geen wachtwoord te zien. */
export const resetPassword = (email: string) => sendPasswordResetEmail(init().auth, email)

/** Luistert op het hele gebruikersknooppunt; geeft een opzegfunctie terug. */
export function watchData(uid: string, cb: (data: RemoteData | null) => void): () => void {
  const node = ref(init().db, `users/${uid}`)
  onValue(node, (snap) => cb(snap.val()))
  return () => off(node)
}

export const pushDay = (uid: string, day: DayEntry) =>
  set(ref(init().db, `users/${uid}/days/${day.date}`), day)

export const pushProfile = (uid: string, profile: Profile) =>
  set(ref(init().db, `users/${uid}/profile`), profile)

/** Firebase-sleutels mogen geen . # $ [ ] / bevatten; namen dus coderen. */
const foodPath = (key: string) => encodeURIComponent(key).replace(/\./g, '%2E')

export const pushFoods = (uid: string, items: FoodItem[]) =>
  set(
    ref(init().db, `users/${uid}/foods`),
    Object.fromEntries(items.map((f) => [foodPath(f.key), f])),
  )

/** Eenmalige volledige upload — gebruikt bij de eerste sync van een apparaat. */
export async function pushAll(uid: string, profile: Profile, days: DayEntry[]) {
  await pushProfile(uid, profile)
  await Promise.all(days.map((d) => pushDay(uid, d)))
}

export const friendlyAuthError = (code: string): string =>
  ({
    'auth/invalid-email': 'Dat e-mailadres klopt niet.',
    'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
    'auth/wrong-password': 'E-mailadres of wachtwoord klopt niet.',
    'auth/user-not-found': 'Geen account met dit e-mailadres.',
    'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer opnieuw.',
    'auth/network-request-failed': 'Geen verbinding. Je data blijft lokaal bewaard.',
    'auth/popup-closed-by-user': 'Inloggen afgebroken.',
    'auth/operation-not-allowed': 'Deze inlogmethode staat uit in Firebase.',
    'auth/missing-email': 'Vul eerst je e-mailadres in.',
  })[code] ?? 'Inloggen mislukt. Probeer het opnieuw.'
