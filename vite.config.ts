import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

/**
 * Schrijft de service worker naar de build met het versienummer erin, zodat
 * elke publicatie een eigen cache krijgt en de vorige wordt opgeruimd.
 */
function serviceWorker(): Plugin {
  return {
    name: 'gezondheid-service-worker',
    apply: 'build',
    closeBundle() {
      const bron = readFileSync(resolve(__dirname, 'src/sw-template.js'), 'utf8')
      writeFileSync(
        resolve(__dirname, 'dist/sw.js'),
        bron.replaceAll('__APP_VERSION__', pkg.version),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  // versienummer uit package.json, zodat je op je telefoon kunt zien of de
  // nieuwste build geladen is
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // relatieve paden, zodat de build net zo goed werkt onder /my-health-app/ op
  // GitHub Pages als op een eigen domein
  base: './',
  server: { port: 5180 },
})
