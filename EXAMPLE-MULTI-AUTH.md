# Multi-Auth Example: JWT + Custom Token

**KEY CONCEPT: Routes are PUBLIC by default. You only specify which routes are PRIVATE.**

## Configuration

```js
// vite.config.js
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';
import { createAuthMiddleware } from 'vite-api-routes-plugin';

const authMiddleware = createAuthMiddleware({
  // Use both JWT and custom auth
  type: ['jwt', 'custom'],
  
  // JWT secret for regular users
  secret: process.env.JWT_SECRET,
  
  // Custom verification for admin tokens
  customVerify: async (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    
    if (adminToken === process.env.ADMIN_TOKEN) {
      req.user = {
        id: 'admin',
        role: 'admin',
        email: 'admin@example.com',
        permissions: ['*']
      };
      return true;
    }
    
    return false;
  },
  
  // Only these routes REQUIRE authentication (everything else is public)
  privateRoutes: [
    '/api/users/*',      // All user routes need auth
    '/api/admin/*',      // All admin routes need auth
    '/api/profile',      // Specific route needs auth
  ],
});

export default defineConfig({
  plugins: [
    apiRoutes({
      auth: authMiddleware,
    }),
  ],
});
```

## Routes Behavior

- `/api/auth/login` - PUBLIC (not in privateRoutes)
- `/api/auth/register` - PUBLIC (not in privateRoutes)
- `/api/public/status` - PUBLIC (not in privateRoutes)
- `/api/users/profile` - PRIVATE (matches `/api/users/*`)
- `/api/admin/dashboard` - PRIVATE (matches `/api/admin/*`)
- `/api/profile` - PRIVATE (exact match)

## Common Patterns

### Pattern 1: Protect Only User & Admin Routes

```js
createAuthMiddleware({
  type: 'jwt',
  secret: process.env.JWT_SECRET,
  privateRoutes: [
    '/api/users/*',
    '/api/admin/*',
  ],
  // /api/auth/*, /api/public/*, etc. are all public
});
```

### Pattern 2: Multiple Auth Methods

```js
createAuthMiddleware({
  type: ['jwt', 'custom'],
  secret: process.env.JWT_SECRET,
  customVerify: async (req) => {
    return req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  },
  privateRoutes: ['/api/admin/*', '/api/users/*'],
});
```

### Pattern 3: Require Both Auth Methods

```js
createAuthMiddleware({
  type: ['jwt', 'custom'],
  requireAll: true,  // Both must succeed
  secret: process.env.JWT_SECRET,
  customVerify: async (req) => {
    return req.headers['x-security-token'] === process.env.SECURITY_TOKEN;
  },
  privateRoutes: ['/api/sensitive/*'],
});
```
