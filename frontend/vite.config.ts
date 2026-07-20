import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In der Entwicklung werden /api und /images (lokal gespiegelte Kartenbilder)
// an das lokale Backend weitergereicht; in Produktion übernimmt nginx diese
// Rolle (siehe nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/images': 'http://localhost:3001',
    },
  },
});
