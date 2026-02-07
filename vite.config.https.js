import { defineConfig } from 'vite';
import apiRoutes from './vite-plugin-api-routes';
import fs from 'fs';
import path from 'path';

// Load SSL certificates for HTTPS
const httpsConfig = {
  enabled: true,
  key: fs.readFileSync(path.resolve('.cert/key.pem')),
  cert: fs.readFileSync(path.resolve('.cert/cert.pem')),
};

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // HTTPS Configuration
      https: httpsConfig,
      
      // CORS configuration
      cors: {
        origin: ['https://localhost:3000', 'https://localhost:5173'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        credentials: true,
      },
      
      // Rate limiting
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100,
      },
      
      // Security options
      security: {
        enableCsrf: true,
        enableHelmet: true,
        maxBodySize: 1024 * 1024,
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
      
      // Error tracking with Sentry
      errorTracking: {
        enabled: true,
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        sampleRate: 1.0,
        beforeSend(event, hint) {
          // Filter out sensitive data
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers?.authorization;
          }
          return event;
        },
      },
      
      // Authentication middleware
      auth: async (req, res) => {
        if (req.url.includes('/api/public')) {
          return true;
        }
        
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token || token !== process.env.API_TOKEN) {
          res.status(401).json({ error: 'Unauthorized' });
          return false;
        }
        
        req.user = { id: 1, name: 'User' };
        return true;
      },
    }),
  ],
  
  // Vite HTTPS server configuration
  server: {
    https: httpsConfig.enabled ? {
      key: httpsConfig.key,
      cert: httpsConfig.cert,
    } : undefined,
    port: 5173,
  },
});
