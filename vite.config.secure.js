import { defineConfig } from 'vite';
import apiRoutes from './vite-plugin-api-routes';
import { createAuthMiddleware, JWT } from './lib/auth.js';
import { createEnvCorsConfig } from './lib/cors.js';

/**
 * Secure configuration with CORS whitelisting and JWT authentication
 */

// Initialize JWT handler
const jwt = new JWT(process.env.JWT_SECRET);

// Create CORS configuration with environment-based whitelisting
const corsConfig = createEnvCorsConfig();

// Create JWT authentication middleware
const authMiddleware = createAuthMiddleware({
  type: 'jwt',
  secret: process.env.JWT_SECRET,
  publicRoutes: [
    '/api/public',
    '/api/auth/login',
    '/api/auth/register',
    '/api/health',
  ],
  onUnauthorized: (req, res, error) => {
    console.warn(`[AUTH] Unauthorized access attempt: ${req.url} - ${error.message}`);
    res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Valid authentication required',
    });
    return false;
  },
});

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // CORS with strict origin whitelisting
      cors: corsConfig,
      
      // Rate limiting
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
      },
      
      // Security options
      security: {
        enableCsrf: true,
        enableHelmet: true,
        maxBodySize: 1024 * 1024, // 1MB
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
      
      // JWT Authentication
      auth: authMiddleware,
      
      // Error tracking
      errorTracking: {
        enabled: !!process.env.SENTRY_DSN,
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        sampleRate: 1.0,
      },
    }),
  ],
});
