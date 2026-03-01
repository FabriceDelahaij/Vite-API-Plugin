# Custom Auth Only - Full Control

If you want complete control over authentication logic without using `privateRoutes` or `publicRoutes`, use `skipRouteCheck: true`.

## Basic Example

```js
// vite.config.js
import { createAuthMiddleware } from 'vite-api-routes-plugin';

const authMiddleware = createAuthMiddleware({
  type: 'custom',
  skipRouteCheck: true,  // Skip route filtering, customVerify handles everything
  
  customVerify: async (req, res) => {
    // Your custom logic decides everything
    
    // Public routes
    if (req.url.startsWith('/api/public') || req.url.startsWith('/api/auth')) {
      return true;
    }
    
    // Admin routes need admin token
    if (req.url.startsWith('/api/admin')) {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken === process.env.ADMIN_TOKEN) {
        req.user = { id: 'admin', role: 'admin' };
        return true;
      }
      return false;
    }
    
    // All other routes need JWT
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const jwt = new JWT(process.env.JWT_SECRET);
        req.user = jwt.verify(token);
        return true;
      } catch (error) {
        return false;
      }
    }
    
    return false;
  },
});
```

## Advanced: Method-Based Auth

```js
const authMiddleware = createAuthMiddleware({
  type: 'custom',
  skipRouteCheck: true,
  
  customVerify: async (req, res) => {
    // Allow all GET requests to /api/posts (read-only)
    if (req.method === 'GET' && req.url.startsWith('/api/posts')) {
      return true;
    }
    
    // POST/PUT/DELETE to /api/posts need authentication
    if (req.url.startsWith('/api/posts')) {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const jwt = new JWT(process.env.JWT_SECRET);
        req.user = jwt.verify(token);
        return true;
      }
      return false;
    }
    
    // Everything else is public
    return true;
  },
});
```

## External Auth Service

```js
const authMiddleware = createAuthMiddleware({
  type: 'custom',
  skipRouteCheck: true,
  
  customVerify: async (req, res) => {
    // Health check is always public
    if (req.url === '/api/health') return true;
    
    // Check with external auth service (e.g., Auth0, Firebase, etc.)
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        // Call external service
        const response = await fetch('https://auth-service.com/verify', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const userData = await response.json();
          req.user = userData;
          return true;
        }
      } catch (error) {
        console.error('Auth service error:', error);
      }
    }
    
    return false;
  },
});
```

## Role-Based with Custom Logic

```js
const authMiddleware = createAuthMiddleware({
  type: 'custom',
  skipRouteCheck: true,
  
  customVerify: async (req, res) => {
    // Public routes
    const publicPaths = ['/api/auth/login', '/api/auth/register', '/api/public'];
    if (publicPaths.some(path => req.url.startsWith(path))) {
      return true;
    }
    
    // Get token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    
    try {
      const jwt = new JWT(process.env.JWT_SECRET);
      const user = jwt.verify(token);
      req.user = user;
      
      // Admin routes require admin role
      if (req.url.startsWith('/api/admin')) {
        return user.role === 'admin';
      }
      
      // Moderator routes require moderator or admin role
      if (req.url.startsWith('/api/moderate')) {
        return ['admin', 'moderator'].includes(user.role);
      }
      
      // All other routes just need valid token
      return true;
      
    } catch (error) {
      return false;
    }
  },
});
```

## Database-Based Permissions

```js
import { db } from './database.js';

const authMiddleware = createAuthMiddleware({
  type: 'custom',
  skipRouteCheck: true,
  
  customVerify: async (req, res) => {
    // Public routes
    if (req.url.startsWith('/api/public')) return true;
    
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    
    try {
      const jwt = new JWT(process.env.JWT_SECRET);
      const { userId } = jwt.verify(token);
      
      // Load user from database with permissions
      const user = await db.users.findById(userId);
      if (!user || !user.active) return false;
      
      req.user = user;
      
      // Check permissions based on route
      if (req.url.startsWith('/api/admin')) {
        return user.permissions.includes('admin');
      }
      
      if (req.url.startsWith('/api/users') && req.method !== 'GET') {
        return user.permissions.includes('write:users');
      }
      
      return true;
      
    } catch (error) {
      return false;
    }
  },
});
```

## Benefits of skipRouteCheck

1. **Full Control**: You decide everything in one place
2. **Complex Logic**: Handle method-based auth, role-based access, etc.
3. **External Services**: Easy to integrate with Auth0, Firebase, etc.
4. **Database Queries**: Check permissions from database
5. **No Route Lists**: Don't need to maintain privateRoutes/publicRoutes

## When to Use

Use `skipRouteCheck: true` when:
- You have complex auth logic that doesn't fit simple route patterns
- You need method-based authentication (GET public, POST private)
- You're integrating with external auth services
- You need database lookups for permissions
- You want complete control over the auth flow

Use `privateRoutes` when:
- You have simple route-based auth (e.g., /api/admin/* needs auth)
- You want the framework to handle route matching
- Your auth logic is straightforward

## Testing

```bash
node test-dist-project/test-auth-custom-only.js
```
