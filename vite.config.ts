import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relatieve paden, zodat de build net zo goed werkt onder /my-health-app/ op
  // GitHub Pages als op een eigen domein
  base: './',
  server: { port: 5180 },
})
