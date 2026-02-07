import { defineConfig } from 'vite';
import vitePluginApiRoutes from './vite-plugin-api-routes.js';

/**
 * Vite configuration with response compression enabled
 * 
 * Usage:
 *   npm run dev -- --config vite.config.compressed.js
 * 
 * Test compression:
 *   curl -H "Accept-Encoding: br, gzip" -I http://localhost:5173/api/examples/compression-test
 *   # Look for: Content-Encoding: br
 *   # Look for: X-Compression-Ratio: XX%
 */
export default defineConfig({
  plugins: [
    vitePluginApiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // Enable response compression (enabled by default)
      compression: {
        enabled: true,
        threshold: 1024, // Only compress responses > 1KB
        level: 6, // Compression level (0-11 for brotli, 0-9 for gzip)
        algorithms: ['br', 'gzip', 'deflate'], // Preferred order
        compressibleTypes: [
          'text/html',
          'text/css',
          'text/javascript',
          'text/plain',
          'text/xml',
          'application/json',
          'application/javascript',
          'application/xml',
          'image/svg+xml',
        ],
        excludePatterns: [
          // Don't compress already-compressed content
          '/api/images/.*',
          '/api/videos/.*',
        ],
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
