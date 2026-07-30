import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  // versienummer uit package.json, zodat je op je telefoon kunt zien of de
  // nieuwste build geladen is
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // relatieve paden, zodat de build net zo goed werkt onder /my-health-app/ op
  // GitHub Pages als op een eigen domein
  base: './',
  server: { port: 5180 },
})
