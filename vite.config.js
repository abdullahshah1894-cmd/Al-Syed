import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  // In development the frontend calls /api on its own origin; Vite forwards it to the backend
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
