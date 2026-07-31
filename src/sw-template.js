/**
 * Service worker: zorgt dat de app opent zonder netwerk. Je data staat toch al
 * op je toestel; zonder dit bestand zou alleen het ophalen van de app zelf je
 * tegenhouden.
 *
 * De versie wordt bij het bouwen ingevuld (zie vite.config.ts), zodat elke
 * publicatie een nieuwe cache krijgt en de oude wordt opgeruimd.
 */
const CACHE = 'gezondheid-__APP_VERSION__'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Firebase mag nooit uit de cache komen: dan zou je verouderde data zien. */
const isData = (url) =>
  url.includes('firebasedatabase.app') ||
  url.includes('googleapis.com') ||
  url.includes('firebaseio.com')

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET' || isData(request.url)) return

  // Voor de pagina zelf eerst het netwerk, zodat je een nieuwe versie meteen
  // krijgt; valt dat weg, dan de laatst bewaarde versie.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', clone))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    )
    return
  }

  // Bestanden hebben een hash in hun naam, dus wat in de cache staat is per
  // definitie het juiste bestand.
  e.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(request, clone))
          }
          return res
        }),
    ),
  )
})
