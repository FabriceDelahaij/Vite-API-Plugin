import { defineConfig } from 'vite';
import apiRoutes from './vite-plugin-api-routes';
import fs from 'fs';
import path from 'path';

/**
 * Production configuration with HTTPS and Sentry
 * 
 * Required environment variables:
 * - SSL_KEY_PATH: Path to SSL private key
 * - SSL_CERT_PATH: Path to SSL certificate
 * - SENTRY_DSN: Sentry DSN for error tracking
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins
 * - API_TOKEN: API authentication token
 */

const sslKeyPath = process.env.SSL_KEY_PATH || '/etc/ssl/private/key.pem';
const sslCertPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/cert.pem';

// Check if SSL certificates exist
const httpsEnabled = fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath);

if (!httpsEnabled) {
  console.error('⚠ WARNING: SSL certificates not found!');
  console.error(`  Key:  ${sslKeyPath}`);
  console.error(`  Cert: ${sslCertPath}`);
  console.error('  Set SSL_KEY_PATH and SSL_CERT_PATH environment variables.');
}

const httpsConfig = httpsEnabled ? {
  enabled: true,
  key: fs.readFileSync(sslKeyPath),
  cert: fs.readFileSync(sslCertPath),
} : {
  enabled: false,
};

// Parse allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

export default defineConfig({
  mode: 'production',
  
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // HTTPS Configuration
      https: httpsConfig,
      
      // CORS - Strict origin whitelisting
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        credentials: true,
        maxAge: 86400,
      },
      
      // Rate limiting - Stricter in production
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 50, // Reduced from 100
      },
      
      // Security options
      security: {
        enableCsrf: true,
        enableHelmet: true,
        maxBodySize: 512 * 1024, // 512KB (reduced from 1MB)
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
      
      // Sentry error tracking
      errorTracking: {
        enabled: !!process.env.SENTRY_DSN,
        dsn: process.env.SENTRY_DSN,
        environment: 'production',
        sampleRate: 0.5, // Sample 50% of errors in production
        beforeSend(event, hint) {
          // Remove sensitive data before sending to Sentry
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers?.authorization;
            delete event.request.headers?.cookie;
            
            // Redact sensitive query params
            if (event.request.query_string) {
              event.request.query_string = event.request.query_string
                .replace(/token=[^&]*/gi, 'token=[REDACTED]')
                .replace(/password=[^&]*/gi, 'password=[REDACTED]')
                .replace(/secret=[^&]*/gi, 'secret=[REDACTED]');
            }
          }
          
          // Remove sensitive data from extra context
          if (event.extra) {
            delete event.extra.body;
            delete event.extra.cookies;
          }
          
          return event;
        },
      },
      
      // Authentication middleware
      auth: async (req, res) => {
        // Public routes
        if (req.url.includes('/api/public')) {
          return true;
        }
        
        // Verify JWT or API token
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          res.status(401).json({ error: 'Unauthorized' });
          return false;
        }
        
        // In production, verify against your auth service
        // This is a simple example - use JWT verification in real apps
        if (token !== process.env.API_TOKEN) {
          res.status(401).json({ error: 'Invalid token' });
          return false;
        }
        
        req.user = { id: 1, name: 'User' };
        return true;
      },
    }),
  ],
  
  build: {
    minify: 'terser',
    sourcemap: false, // Disable source maps in production
  },
});
