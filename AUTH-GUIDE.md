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
import { createAuthMiddleware } from 'vite-api-routes-plugin';

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
import { JWT } from 'vite-api-routes-plugin';

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
import { JWT } from 'vite-api-routes-plugin';

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
import { createAuthMiddleware } from 'vite-api-routes-plugin';

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
import { APIKeyAuth } from 'vite-api-routes-plugin';

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
import { createAuthMiddleware } from 'vite-api-routes-plugin';

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
import { SessionAuth } from 'vite-api-routes-plugin';

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

The plugin includes **Argon2id** password hashing out of the box - the winner of the Password Hashing Competition and OWASP's recommended algorithm. Argon2id provides superior protection against GPU/ASIC attacks compared to bcrypt.

### Requirements

```bash
npm install @node-rs/argon2
```

### Hash Password

```js
import { Password } from 'vite-api-routes-plugin';

// Hash password with secure defaults (Argon2id)
const hash = await Password.hash('mypassword123');
console.log(hash); 
// $argon2id$v=19$m=65536,t=3,p=4$...$...

// Custom options for higher security
const hash = await Password.hash('mypassword123', {
  memoryCost: 65536,  // 64 MB (default)
  timeCost: 3,        // 3 iterations (default)
  parallelism: 4,     // 4 threads (default)
});
```

### Verify Password

```js
import { Password } from 'vite-api-routes-plugin';

const isValid = await Password.verify('mypassword123', hash);
console.log(isValid); // true or false
```

### Security Features

**Built-in Protection:**
- ✅ **Argon2id algorithm** - Resistant to GPU/ASIC attacks
- ✅ **Timing attack prevention** - Hash format validation before verification
- ✅ **Constant-time operations** - Dummy hash on invalid format to prevent timing leaks
- ✅ **Secure defaults** - 64MB memory, 3 iterations, 4 threads
- ✅ **Automatic salt generation** - Unique salt per password

**Hash Format Validation:**
```js
// The Password class validates Argon2 hash format to prevent timing attacks
// Format: $argon2<variant>$v=<version>$m=<memory>,t=<iterations>,p=<parallelism>$<salt>$<hash>
// Example: $argon2id$v=19$m=65536,t=3,p=4$randomsalt$randomhash
```

### Configuration Options

Adjust security parameters based on your needs:

```js
// Balanced (default) - Good for most applications
const hash = await Password.hash(password, {
  memoryCost: 65536,  // 64 MB
  timeCost: 3,        // 3 iterations
  parallelism: 4,     // 4 threads
});

// High security - For sensitive applications
const hash = await Password.hash(password, {
  memoryCost: 131072, // 128 MB
  timeCost: 4,        // 4 iterations
  parallelism: 4,     // 4 threads
});

// Fast (lower security) - For development/testing
const hash = await Password.hash(password, {
  memoryCost: 19456,  // ~19 MB
  timeCost: 2,        // 2 iterations
  parallelism: 1,     // 1 thread
});
```

### Error Handling

```js
try {
  const hash = await Password.hash(password);
} catch (error) {
  if (error.message.includes('Argon2 is required')) {
    console.error('Install @node-rs/argon2: npm install @node-rs/argon2');
  }
  throw error;
}
```

### Real-World Example

See the complete implementation in `pages/api/auth/register.ts`:

```js
import { hash } from '@node-rs/argon2';

// Hash password with OWASP-recommended settings
const hashedPassword = await hash(password, {
  memoryCost: 19456,  // ~19 MB
  timeCost: 2,        // 2 iterations
  parallelism: 1,     // 1 thread
});

// Store hashedPassword in database
```

And verification in `pages/api/auth/login.ts`:

```js
import { verify } from '@node-rs/argon2';

// Verify password
const isValidPassword = await verify(user.password, password);
if (!isValidPassword) {
  return new Response(JSON.stringify({ 
    error: 'Invalid credentials' 
  }), { status: 401 });
}
```

## 🌐 CORS Whitelisting

### Environment-based Configuration

```js
// vite.config.js
import { createEnvCorsConfig } from 'vite-api-routes-plugin';

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
import { createCorsConfig } from 'vite-api-routes-plugin';

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
import { createDomainCorsConfig } from 'vite-api-routes-plugin';

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
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!"
  }'

# Note: Password must meet requirements:
# - At least 8 characters
# - One uppercase letter
# - One lowercase letter
# - One number
# - One special character (@$!%*?&)
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

Always validate user input. The plugin includes validation helpers:

```js
import { validateRequired, isValidEmail } from 'vite-api-routes-plugin';

// Validate required fields
const errors = validateRequired(body, ['username', 'email', 'password']);
if (errors.length > 0) {
  return createErrorResponse('Missing required fields', 400);
}

// Validate email
if (!isValidEmail(email)) {
  return createErrorResponse('Invalid email format', 400);
}

// Validate password strength
if (password.length < 8) {
  return createErrorResponse('Password too short', 400);
}

// Enhanced password validation (recommended)
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
if (!passwordRegex.test(password)) {
  return createErrorResponse(
    'Password must contain uppercase, lowercase, number, and special character',
    400
  );
}
```

**See complete validation example in `pages/api/auth/register.ts`**

### 6. HTTPS Only

Always use HTTPS in production:

```bash
npm run dev:https  # Development
npm run build:prod # Production
```

## � Troubleshooting

### Argon2 Installation Issues

If you encounter errors with `@node-rs/argon2`:

```bash
# Windows
npm install @node-rs/argon2 --force

# Linux/Mac
npm install @node-rs/argon2

# If still failing, try platform-specific package
npm install @node-rs/argon2-linux-x64-gnu
# or
npm install @node-rs/argon2-darwin-x64
# or
npm install @node-rs/argon2-win32-x64-msvc
```

### Password Verification Fails

Common issues:
1. **Hash format mismatch** - Ensure you're using Argon2 hashes (start with `$argon2`)
2. **Timing attacks** - The library automatically validates hash format before verification
3. **Module not found** - Install `@node-rs/argon2` dependency

### CSRF Token Issues

If CSRF validation fails:
1. Ensure you're getting a fresh token from `GET /api/auth/login`
2. Include token in `X-CSRF-Token` header for POST/PUT/DELETE requests
3. Check that CSRF is enabled in your config: `security.enableCsrf: true`

## 📚 Resources

- [JWT.io](https://jwt.io/) - JWT debugger and documentation
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Argon2 Specification](https://github.com/P-H-C/phc-winner-argon2) - Password hashing competition winner
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) - Recommends Argon2id
