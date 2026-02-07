# Authentication Guide

Complete guide for implementing authentication in your Vite API routes.

## 🔐 Authentication Methods

The plugin supports multiple authentication methods:

1. **JWT (JSON Web Tokens)** - Stateless, scalable
2. **API Keys** - Simple, for service-to-service
3. **Sessions** - Traditional, server-side state
4. **Custom** - Roll your own

## 🚀 Quick Start

### 1. Set Environment Variables

```bash
# .env
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
NODE_ENV=development
```

### 2. Use Secure Configuration

```bash
# Start with secure config (JWT + CORS whitelisting)
npm run dev -- --config vite.config.secure.js
```

### 3. Test Authentication

```bash
# Register a new user
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"john","email":"john@example.com","password":"password123"}'

# Response includes JWT token
# {
#   "success": true,
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "csrfToken": "...",
#   "user": { "id": 1, "username": "john", "email": "john@example.com" }
# }

# Login
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'

# Access protected route
curl http://localhost:5173/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📚 JWT Authentication

### Configuration

```js
// vite.config.js
import { createAuthMiddleware } from './lib/auth.js';

const authMiddleware = createAuthMiddleware({
  type: 'jwt',
  secret: process.env.JWT_SECRET,
  publicRoutes: [
    '/api/public',
    '/api/auth/login',
    '/api/auth/register',
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

### Usage in API Routes

```js
// pages/api/protected/data.js
export async function GET(request) {
  // request.user is automatically populated by auth middleware
  const { userId, email, role } = request.user;

  return new Response(JSON.stringify({
    message: `Hello ${email}`,
    data: 'sensitive data',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Generate JWT Token

```js
import { JWT } from './lib/auth.js';

const jwt = new JWT(process.env.JWT_SECRET);

const token = jwt.sign({
  userId: 123,
  email: 'user@example.com',
  role: 'user',
  permissions: ['read', 'write'],
}, '7d'); // Expires in 7 days
```

### Verify JWT Token

```js
import { JWT } from './lib/auth.js';

const jwt = new JWT(process.env.JWT_SECRET);

try {
  const payload = jwt.verify(token);
  console.log(payload); // { userId, email, role, permissions, iat, exp }
} catch (error) {
  console.error('Invalid token:', error.message);
}
```

## 🔑 API Key Authentication

### Configuration

```js
import { createAuthMiddleware } from './lib/auth.js';

const authMiddleware = createAuthMiddleware({
  type: 'apikey',
  publicRoutes: ['/api/public'],
});

export default defineConfig({
  plugins: [
    apiRoutes({
      auth: authMiddleware,
    }),
  ],
});
```

### Generate API Key

```js
import { APIKeyAuth } from './lib/auth.js';

const apiKeyAuth = new APIKeyAuth();

// Generate new key
const apiKey = apiKeyAuth.generate('My App', ['read', 'write']);
console.log('API Key:', apiKey);
// sk_a1b2c3d4e5f6...
```

### Use API Key

```bash
# In header
curl http://localhost:5173/api/data \
  -H "X-API-Key: sk_a1b2c3d4e5f6..."

# In query parameter
curl "http://localhost:5173/api/data?apiKey=sk_a1b2c3d4e5f6..."
```

### Environment-based API Keys

```bash
# .env
API_KEY_1=sk_abc123:MyApp:read,write
API_KEY_2=sk_xyz789:AdminApp:read,write,delete
```

## 🍪 Session Authentication

### Configuration

```js
import { createAuthMiddleware } from './lib/auth.js';

const authMiddleware = createAuthMiddleware({
  type: 'session',
  publicRoutes: ['/api/auth/login'],
});

export default defineConfig({
  plugins: [
    apiRoutes({
      auth: authMiddleware,
    }),
  ],
});
```

### Create Session

```js
import { SessionAuth } from './lib/auth.js';

const sessionAuth = new SessionAuth();

// Create session
const sessionId = sessionAuth.create(userId, {
  username: 'john',
  role: 'user',
}, 3600); // 1 hour

// Set cookie
res.setCookie('sessionId', sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 3600,
});
```

## 🛡️ Role-Based Access Control (RBAC)

### Require Specific Role

```js
// pages/api/admin/data.js
export async function GET(request) {
  // Check if user has admin role
  if (!request.user || request.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Admin-only logic
  return new Response(JSON.stringify({ message: 'Admin access granted' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Require Multiple Roles

```js
// pages/api/moderation/data.js
export async function GET(request) {
  // Allow admin OR moderator
  const allowedRoles = ['admin', 'moderator'];
  if (!request.user || !allowedRoles.includes(request.user.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Access granted' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Require Permission

```js
// pages/api/delete/resource.js
export async function DELETE(request) {
  // Require 'delete' permission
  if (!request.user || !request.user.permissions?.includes('delete')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Delete logic
  return new Response(JSON.stringify({ message: 'Deleted successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## 🔒 Password Security

### Hash Password

```js
import { Password } from './lib/auth.js';

// Hash password (uses PBKDF2)
const hash = await Password.hash('mypassword123');
console.log(hash); // salt:derivedKey
```

### Verify Password

```js
import { Password } from './lib/auth.js';

const isValid = await Password.verify('mypassword123', hash);
console.log(isValid); // true or false
```

### Production Recommendation

For production, use **bcrypt** or **argon2**:

```bash
npm install bcrypt
# or
npm install argon2
```

```js
import bcrypt from 'bcrypt';

// Hash
const hash = await bcrypt.hash(password, 10);

// Verify
const isValid = await bcrypt.compare(password, hash);
```

## 🌐 CORS Whitelisting

### Environment-based Configuration

```js
// vite.config.js
import { createEnvCorsConfig } from './lib/cors.js';

export default defineConfig({
  plugins: [
    apiRoutes({
      cors: createEnvCorsConfig(),
    }),
  ],
});
```

**Development** (automatic):
- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:8080`

**Production** (from `.env`):
```bash
ALLOWED_ORIGINS=https://example.com,https://www.example.com,https://app.example.com
```

### Custom Whitelist

```js
import { createCorsConfig } from './lib/cors.js';

const corsConfig = createCorsConfig({
  origins: [
    'https://example.com',
    'https://www.example.com',
    'https://*.example.com', // Wildcard for subdomains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

export default defineConfig({
  plugins: [
    apiRoutes({
      cors: corsConfig,
    }),
  ],
});
```

### Domain-based Configuration

```js
import { createDomainCorsConfig } from './lib/cors.js';

// Automatically allows:
// - https://example.com
// - https://www.example.com
// - https://*.example.com (all subdomains)
const corsConfig = createDomainCorsConfig('example.com');
```

### Pattern Matching

```js
const corsConfig = createCorsConfig({
  origins: [
    'https://*.example.com',      // All subdomains
    'https://app-*.example.com',  // app-dev, app-staging, etc.
    'https://example.*',          // All TLDs
  ],
});
```

## 🧪 Testing Authentication

### Test Registration

```bash
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test Login

```bash
# Get CSRF token
CSRF_TOKEN=$(curl http://localhost:5173/api/auth/login | jq -r '.csrfToken')

# Login with CSRF token
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test Protected Route

```bash
# Save token from login response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Access protected route
curl http://localhost:5173/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Test CORS

```bash
# Test from allowed origin
curl http://localhost:5173/api/hello \
  -H "Origin: http://localhost:3000" \
  -v

# Test from blocked origin (should fail)
curl http://localhost:5173/api/hello \
  -H "Origin: https://evil.com" \
  -v
```

## 📊 Client-Side Integration

### React Example

```jsx
import { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  // Login
  const login = async (email, password) => {
    const res = await fetch('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (data.success) {
      setToken(data.token);
      localStorage.setItem('token', data.token);
      localStorage.setItem('csrfToken', data.csrfToken);
      setUser(data.user);
    }
  };

  // Fetch protected data
  const fetchData = async () => {
    const res = await fetch('http://localhost:5173/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await res.json();
    setUser(data.user);
  };

  // Logout
  const logout = async () => {
    await fetch('http://localhost:5173/api/auth/logout', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': localStorage.getItem('csrfToken'),
      },
    });

    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('csrfToken');
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  return (
    <div>
      {user ? (
        <div>
          <p>Welcome, {user.email}!</p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <button onClick={() => login('test@example.com', 'password123')}>
          Login
        </button>
      )}
    </div>
  );
}
```

## 🔐 Security Best Practices

### 1. Strong JWT Secret

```bash
# Generate strong secret (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Short Token Expiry

```js
// Short-lived access tokens
const accessToken = jwt.sign(payload, '15m');

// Long-lived refresh tokens (separate endpoint)
const refreshToken = jwt.sign(payload, '7d');
```

### 3. Secure Cookies

```js
res.setCookie('token', token, {
  httpOnly: true,      // Not accessible via JavaScript
  secure: true,        // HTTPS only
  sameSite: 'strict',  // CSRF protection
  maxAge: 3600,        // 1 hour
});
```

### 4. Rate Limiting

Already enabled in the plugin:
- 100 requests per 15 minutes per IP
- Configurable in `vite.config.js`

### 5. Input Validation

Always validate user input:

```js
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return res.status(400).json({ error: 'Invalid email' });
}

if (password.length < 8) {
  return res.status(400).json({ error: 'Password too short' });
}
```

### 6. HTTPS Only

Always use HTTPS in production:

```bash
npm run dev:https  # Development
npm run build:prod # Production
```

## 📚 Resources

- [JWT.io](https://jwt.io/) - JWT debugger and documentation
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
