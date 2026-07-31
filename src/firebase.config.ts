/**
 * Firebase-projectconfig. Deze waarden zijn niet geheim — ze staan in elke
 * webapp die Firebase gebruikt en identificeren alleen het project. De
 * beveiliging zit in de database-rules (zie database.rules.json), die afdwingen
 * dat je alleen je eigen data kunt lezen en schrijven.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAjcwaMlULtgqJ_3FIHBWTcvz58UP2AzpQ',
  authDomain: 'my-health-app-9243f.firebaseapp.com',
  databaseURL: 'https://my-health-app-9243f-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'my-health-app-9243f',
  storageBucket: 'my-health-app-9243f.firebasestorage.app',
  messagingSenderId: '643188461616',
  appId: '1:643188461616:web:11f7b6515d283bc2fb5df5',
}

/** Zolang dit false is draait de app puur lokaal, zonder sync en zonder login. */
export const syncEnabled = !firebaseConfig.apiKey.startsWith('VUL_IN')
