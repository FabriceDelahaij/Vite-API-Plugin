import { defineConfig } from 'vite';
import apiRoutes from './vite-plugin-api-routes';

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // CORS configuration
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:5173'], // Whitelist specific origins
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        credentials: true,
        maxAge: 86400,
      },
      
      // Rate limiting
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Max 100 requests per windowMs per IP
      },
      
      // Security options
      security: {
        enableCsrf: false, // Temporarily disabled for testing
        enableHelmet: true, // Security headers
        maxBodySize: 1024 * 1024, // 1MB max body size
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      },
      
      // Optional: Custom authentication middleware (simplified for testing)
      auth: async (req, res) => {
        // Skip auth for public routes and test routes
        if (req.url.includes('/api/public') || req.url.includes('/api/test')) {
          return true;
        }
        
        // For testing, allow all requests to auth endpoints
        if (req.url.includes('/api/auth')) {
          req.user = { id: 1, name: 'Test User', email: 'test@example.com' };
          return true;
        }
        
        // Check for valid auth token for other routes
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token || token !== 'your-secret-token') {
          res.status(401).json({ error: 'Unauthorized' });
          return false;
        }
        
        // Attach user to request
        req.user = { id: 1, name: 'John Doe', email: 'john@example.com' };
        return true;
      },
    }),
  ],
});
