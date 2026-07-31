/**
 * Firebase-projectconfig. Deze waarden zijn niet geheim — ze staan in elke
 * webapp die Firebase gebruikt en identificeren alleen het project. De
 * beveiliging zit in de database-rules (zie database.rules.json), die afdwingen
 * dat je alleen je eigen data kunt lezen en schrijven.
 *
 * Vervang de placeholders door de config uit Firebase Console →
 * Projectinstellingen → Je apps → Web-app.
 */
export const firebaseConfig = {
  apiKey: 'VUL_IN',
  authDomain: 'VUL_IN.firebaseapp.com',
  databaseURL: 'https://VUL_IN-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'VUL_IN',
  storageBucket: 'VUL_IN.firebasestorage.app',
  messagingSenderId: 'VUL_IN',
  appId: 'VUL_IN',
}

/** Zolang dit false is draait de app puur lokaal, zonder sync en zonder login. */
export const syncEnabled = !firebaseConfig.apiKey.startsWith('VUL_IN')
