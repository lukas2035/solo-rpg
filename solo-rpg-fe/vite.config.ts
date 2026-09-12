import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lokální BE (solo-rpg-be) – API i statické soubory z Obsidian vaultu
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/vault': 'http://127.0.0.1:3001',
    },
  },
})
