import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В деве проксируем API/стрим/превью на бэкенд (uvicorn на :8000),
// чтобы не ловить CORS и работать с одним origin.
const backend = process.env.BACKEND_URL || 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': backend,
      '/stream': backend,
      '/thumb': backend,
      '/health': backend,
    },
  },
});
