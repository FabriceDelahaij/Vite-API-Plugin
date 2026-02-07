import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/Vite-API-Plugin/' : '/',
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      cors: {
        origin: '*',
        credentials: true,
      },
      security: {
        enableCsrf: false, // Disable CSRF for demo
        enableHelmet: true,
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 1000, // Higher limit for demo
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
});