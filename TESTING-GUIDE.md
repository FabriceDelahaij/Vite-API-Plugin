# API Routes Testing Guide

## Fixed Issues

✅ **Import Path Issues**: Fixed incorrect import paths in TypeScript files
✅ **JSON Response Issues**: Fixed App Router style handler detection in plugin
✅ **CSRF Protection**: Temporarily disabled for easier testing

## Quick Test Commands

### 1. Start the Development Server
```bash
npm run dev
# or
yarn dev
```

### 2. Test Simple Endpoint (GET)
```bash
curl http://localhost:5173/api/test-simple
```

Expected response:
```json
{
  "message": "Hello from GET endpoint",
  "timestamp": "2024-02-07T...",
  "method": "GET",
  "success": true
}
```

### 3. Test Simple Endpoint (POST)
```bash
curl -X POST http://localhost:5173/api/test-simple \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

Expected response:
```json
{
  "message": "Hello from POST endpoint",
  "timestamp": "2024-02-07T...",
  "method": "POST",
  "receivedBody": {"test": "data"},
  "success": true
}
```

### 4. Test Logout Endpoint (GET)
```bash
curl http://localhost:5173/api/auth/logout
```

Expected response:
```json
{
  "success": true,
  "data": {
    "endpoint": "/api/auth/logout",
    "method": "POST",
    "description": "Use POST method to logout",
    "requiresCsrf": true
  },
  "message": "Logout endpoint information"
}
```

### 5. Test Logout Endpoint (POST)
```bash
curl -X POST http://localhost:5173/api/auth/logout \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "loggedOut": true,
    "timestamp": "2024-02-07T..."
  },
  "message": "Logged out successfully"
}
```

## Browser Testing

You can also test in your browser by visiting:
- http://localhost:5173/api/test-simple
- http://localhost:5173/api/auth/logout
- http://localhost:5173/api/public/status

## Troubleshooting

### If you get "Cannot find module" errors:
1. Make sure all import paths use `../../../src/types/api` and `../../../src/utils/api-helpers`
2. Check that the files exist in the `src/` directory

### If JSON responses don't work:
1. Check the browser developer tools Network tab
2. Verify the Content-Type header is `application/json`
3. Check the Vite dev server console for errors

### If you get CSRF errors:
1. CSRF is currently disabled in the config for testing
2. To re-enable, set `enableCsrf: true` in `vite.config.js`

## Re-enabling Security Features

Once testing is complete, you can re-enable security features:

```javascript
// In vite.config.js
security: {
  enableCsrf: true, // Re-enable CSRF protection
  enableHelmet: true,
  maxBodySize: 1024 * 1024,
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
},
```

## Available Test Endpoints

- `/api/test-simple` - Simple GET/POST test
- `/api/auth/logout` - GET/POST/DELETE logout methods
- `/api/auth/register` - User registration
- `/api/public/status` - Public status endpoint
- `/api/hello` - Basic hello endpoint
- `/api/users/[id]` - Dynamic user endpoint