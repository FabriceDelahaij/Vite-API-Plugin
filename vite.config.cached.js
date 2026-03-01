import { defineConfig } from 'vite';
import vitePluginApiRoutes from './vite-plugin-api-routes.js';

/**
 * Vite configuration with response caching enabled
 * 
 * Usage:
 *   npm run dev -- --config vite.config.cached.js
 * 
 * Test caching:
 *   curl -i http://localhost:5173/api/examples/cached-data
 *   # First request: X-Cache: MISS (slow)
 *   # Second request: X-Cache: HIT (instant)
 */
export default defineConfig({
  plugins: [
    vitePluginApiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // Enable response caching
      cache: {
        enabled: true,
        type: 'memory', // Use 'redis' for production
        maxSize: 100, // Max 100 cached responses
        defaultTTL: 300, // 5 minutes default
        keyPrefix: 'api:',
        
        // Vary cache by these headers
        varyBy: ['Accept-Language'],
        
        // Custom cache logic
        shouldCache: (req, res, data) => {
          // Don't cache error responses
          if (res.statusCode >= 400) return false;
          
          // Don't cache authenticated requests
          if (req.headers.authorization) return false;
          
          // Don't cache empty responses
          if (!data || (Array.isArray(data) && data.length === 0)) return false;
          
          return true;
        },
      },
      
      // CORS configuration
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        credentials: true,
      },
      
      // Rate limiting
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100,
      },
      
      // Security
      security: {
        enableCsrf: false,
        enableHelmet: true,
        maxBodySize: 1024 * 1024,
      },
    }),
  ],
  
  server: {
    port: 5173,
    strictPort: false,
  },
});
