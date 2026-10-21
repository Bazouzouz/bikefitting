import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      '@bikefit/shared': fileURLToPath(new URL('../shared/bike.ts', import.meta.url)),
    },
  },
  server: {
    // `npm run dev:lan` ajoute --host (site exposé au réseau pour la caméra du téléphone). L'API reste sur 127.0.0.1 (proxy).
    host: 'localhost',
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
});
