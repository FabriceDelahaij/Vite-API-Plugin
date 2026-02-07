# Vite API Routes Plugin

A comprehensive Vite plugin that brings Next.js-style API routes to your Vite projects with enterprise-grade security, CLI tools, testing utilities, and optional encryption.

## Features

- 📁 **File-based routing** - Create API routes in `pages/api` or `src/pages/api`
- 🎯 **Modern syntax** - Uses standard Request/Response objects (Web API)
- 🔄 **Dynamic routes** - Support for `[param]` syntax like Next.js
- 🔥 **Hot reload** - Instant updates during development
- 🌐 **Web standards** - Uses standard Request/Response objects
- 🔒 **Built-in security** - CORS, rate limiting, CSRF, input sanitization
- 🌐 **HTTPS support** - Development and production SSL/TLS
- 📊 **Error tracking** - Sentry integration for monitoring
- 🛠️ **CLI Tool (Optional)** - Generate routes, auth systems, and more
- 🧪 **Testing utilities** - Comprehensive test helpers and mocks
- 🔐 **Optional encryption** - Request/response encryption with key rotation
- 📦 **Zero config** - Works out of the box
- 🔷 **TypeScript support** - Full type safety

## Security Features

- ✅ CORS protection with origin whitelisting
- ✅ Rate limiting per IP address
- ✅ CSRF token protection
- ✅ Security headers (Helmet-like)
- ✅ Input sanitization
- ✅ Request body size limits
- ✅ Method whitelisting
- ✅ Authentication middleware support
- ✅ Secure cookie helpers
- ✅ HTTPS support (development & production)
- ✅ Sentry error tracking integration
- ✅ Optional request/response encryption
- ✅ Argon2 password hashing (GPU-resistant)
- ✅ Response caching (in-memory & Redis)
- ✅ API response compression (Brotli, Gzip, Deflate for `/api/*` routes)

## CLI Tool (Optional)

The plugin includes an optional CLI tool for scaffolding and managing your API. To use CLI features, install the CLI dependencies:

```bash
# Install CLI dependencies (optional)
npm install commander chalk inquirer

# Then use CLI commands
vite-api-routes init
vite-api-routes generate route users
```

**CLI Commands:**
```bash
# Initialize a new project
vite-api-routes init

# Generate API routes
vite-api-routes generate route users
vite-api-routes generate crud posts
vite-api-routes generate auth

# Run tests (requires vitest)
vite-api-routes test
vite-api-routes test --watch --coverage

# Generate documentation
vite-api-routes docs

# Migrate from other frameworks
vite-api-routes migrate --from nextjs
```

> **Note:** The CLI tool is completely optional. The plugin works perfectly without it for basic API route functionality.

## Testing Utilities

Comprehensive testing helpers for API routes:

```typescript
import { createTestRequest, ApiTestHelper, MockDatabase } from './testing';

// Create mock requests
const request = createTestRequest('/api/users', {
  method: 'POST',
  body: JSON.stringify({ name: 'John' }),
});

// Test helpers
await ApiTestHelper.expectSuccess(response);
await ApiTestHelper.expectError(response, 400);

// Mock database
const mockDb = new MockDatabase();
const users = mockDb.find('users');
```

## Documentation

📚 **[Complete Documentation Index](./DOCS.md)** - Navigate all available guides

**Core Guides:**
- [SECURITY.md](./SECURITY.md) - Security features and best practices
- [CACHE-GUIDE.md](./CACHE-GUIDE.md) - Response caching for performance
- [COMPRESSION-GUIDE.md](./COMPRESSION-GUIDE.md) - Response compression (Brotli, Gzip)
- [MIGRATION.md](./MIGRATION.md) - Migrate between API route styles
- [TYPESCRIPT-GUIDE.md](./TYPESCRIPT-GUIDE.md) - TypeScript integration
- [CLI-GUIDE.md](./CLI-GUIDE.md) - Optional CLI tool documentation

**Specialized Guides:**
- [HTTPS-SETUP.md](./HTTPS-SETUP.md) - HTTPS configuration
- [AUTH-GUIDE.md](./AUTH-GUIDE.md) - Authentication implementation
- [COOKIES-GUIDE.md](./COOKIES-GUIDE.md) - Secure cookie management
- [ENCRYPTION-GUIDE.md](./ENCRYPTION-GUIDE.md) - Request/response encryption
- [SENTRY-SETUP.md](./SENTRY-SETUP.md) - Error tracking setup
- [ENV-GUIDE.md](./ENV-GUIDE.md) - Environment variables
- [TESTING-GUIDE.md](./TESTING-GUIDE.md) - API testing guide
- [DEPENDENCIES-GUIDE.md](./DEPENDENCIES-GUIDE.md) - Dependency management

## Installation

```bash
npm install vite-api-routes-plugin

# Optional CLI dependencies (for scaffolding and generation)
npm install commander chalk inquirer

# Optional dependencies
npm install @sentry/node          # For error tracking
npm install --save-dev typescript @types/node  # For TypeScript support
npm install --save-dev vitest @vitest/ui       # For testing
```

### NPM Package Usage

The plugin is available as `vite-api-routes-plugin` on NPM and works with both JavaScript and TypeScript projects.

**Basic TypeScript Setup:**
```typescript
// pages/api/hello.ts
export async function GET(request: Request): Promise<Response> {
  return new Response(JSON.stringify({ 
    message: 'Hello from TypeScript API!' 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  return new Response(JSON.stringify({ received: body }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Available Types:**
```typescript
import type {
  // Configuration types
  ApiRoutesOptions,
  CorsConfig,
  RateLimitConfig,
  SecurityConfig,
  
  // Utility types
  CookieOptions,
  AuthMiddleware,
} from 'vite-api-routes-plugin';
```

## Quick Start (5 Minutes)

### ⚡ Basic Setup

1. **Install the plugin:**
   ```bash
   npm install vite-api-routes-plugin
   ```

2. **Configure Vite:**
   ```javascript
   // vite.config.js
   import { defineConfig } from 'vite';
   import apiRoutes from 'vite-api-routes-plugin';

   export default defineConfig({
     plugins: [
       apiRoutes(), // That's it!
     ],
   });
   ```

3. **Create your first API route:**

   **JavaScript:**
   ```javascript
   // pages/api/hello.js
   export async function GET(request) {
     return new Response(JSON.stringify({
       message: 'Hello from Vite API Routes!',
       timestamp: new Date().toISOString()
     }), {
       status: 200,
       headers: { 'Content-Type': 'application/json' },
     });
   }
   ```

   **TypeScript:**
   ```typescript
   // pages/api/hello.ts
   export async function GET(request: Request): Promise<Response> {
     return new Response(JSON.stringify({
       message: 'Hello from Vite API Routes!',
       timestamp: new Date().toISOString()
     }), {
       status: 200,
       headers: { 'Content-Type': 'application/json' },
     });
   }
   ```

4. **Start development:**
   ```bash
   npm run dev
   ```

   Visit `http://localhost:5173/api/hello`

### 🎯 More Quick Examples

**Dynamic Routes:**
```javascript
// pages/api/users/[id].js
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  return new Response(JSON.stringify({
    user: {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**POST Route with Body:**
```javascript
// pages/api/users.js
export async function POST(request) {
  const { name, email } = await request.json();
  
  return new Response(JSON.stringify({
    success: true,
    user: { id: Date.now(), name, email }
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

Test with:
```bash
curl -X POST http://localhost:5173/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

### 🔒 Add Security (Optional)

```js
// vite.config.js
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  plugins: [
    apiRoutes({
      // CORS protection
      cors: {
        origin: ['http://localhost:3000'],
        credentials: true,
      },
      
      // Rate limiting
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Max 100 requests per IP
      },
      
      // Security headers
      security: {
        enableCsrf: true,
        enableHelmet: true,
      },
    }),
  ],
});
```

### 🔷 TypeScript Setup

```bash
npm install --save-dev typescript @types/node
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["pages/**/*.ts", "vite.config.js"]
}
```

> **That's it!** You now have a fully functional API server with file-based routing, TypeScript support, hot reload, and security features. CLI tools are purely optional for convenience.

## CLI Usage

### Initialize Project

```bash
# Interactive setup
vite-api-routes init

# With options
vite-api-routes init --template full --typescript
```

### Generate Components

```bash
# Generate a basic route
vite-api-routes generate route users

# Generate CRUD routes
vite-api-routes generate crud posts

# Generate authentication system
vite-api-routes generate auth

# Generate middleware
vite-api-routes generate middleware cors
```

### Testing

```bash
# Run tests
vite-api-routes test

# Watch mode
vite-api-routes test --watch

# With coverage
vite-api-routes test --coverage

# Test UI
vite-api-routes test --ui
```

### Documentation

```bash
# Generate API documentation
vite-api-routes docs

# Different formats
vite-api-routes docs --format html
vite-api-routes docs --format json
```

### Migration

```bash
# Migrate from Next.js
vite-api-routes migrate --from nextjs

# Migrate from Express
vite-api-routes migrate --from express

# Dry run
vite-api-routes migrate --from nextjs --dry-run
```

# Optional: Generate SSL certificates for HTTPS development
npm run generate-cert
```

## Usage

### 1. Configure Vite

Add the plugin to your `vite.config.js`:

```js
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      
      // CORS configuration
      cors: {
        origin: ['http://localhost:3000'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
      },
      
      // Rate limiting
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Max requests per IP
      },
      
      // Security options
      security: {
        enableCsrf: true,
        enableHelmet: true,
        maxBodySize: 1024 * 1024, // 1MB
      },
      
      // HTTPS (optional)
      https: {
        enabled: false, // Set to true for HTTPS
        key: fs.readFileSync('.cert/key.pem'),
        cert: fs.readFileSync('.cert/cert.pem'),
      },
      
      // Error tracking (optional)
      errorTracking: {
        enabled: true,
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        sampleRate: 1.0,
      },
      
      // Optional auth middleware
      auth: async (req, res) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          res.status(401).json({ error: 'Unauthorized' });
          return false;
        }
        req.user = { id: 1, name: 'User' };
        return true;
      },
    }),
  ],
});
```

### 2. Create API Routes

Create files in `pages/api/`:

**JavaScript:**
```js
// pages/api/hello.js
export async function GET(request) {
  return new Response(JSON.stringify({ message: 'Hello!' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const body = await request.json();
  return new Response(JSON.stringify({ received: body }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**TypeScript:**
```typescript
// pages/api/hello.ts
export async function GET(request: Request): Promise<Response> {
  return new Response(JSON.stringify({ message: 'Hello!' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Dynamic Routes:**
```javascript
// pages/api/users/[id].js
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  return new Response(JSON.stringify({ userId: id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 3. Start Development Server

```bash
# HTTP (default)
npm run dev

# HTTPS (with self-signed certificate)
npm run dev:https

# Production build
npm run build:prod
```

Your API routes are now available:
- `GET /api/hello`
- `GET /api/users/123`
- `POST /api/posts`

## API Reference

### Request Object (Standard Web API)

The `request` parameter is a standard [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object with additional properties:

- `request.method` - HTTP method (GET, POST, etc.)
- `request.url` - Full request URL
- `request.headers` - Headers object
- `request.json()` - Parse JSON body
- `request.text()` - Get text body
- `request.formData()` - Parse form data
- `request.user` - User object (if auth middleware is used)

**Extracting Dynamic Route Parameters:**
```javascript
// pages/api/users/[id].js
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop(); // Extract [id]
  // or use URLSearchParams for query strings
  const params = new URLSearchParams(url.search);
}
```

### Response Object (Standard Web API)

Return a standard [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object:

```javascript
// JSON response
return new Response(JSON.stringify({ data: 'value' }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

// Text response
return new Response('Hello World', {
  status: 200,
  headers: { 'Content-Type': 'text/plain' },
});

// With cookies
return new Response(JSON.stringify({ success: true }), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Set-Cookie': 'session=abc123; HttpOnly; Secure; SameSite=Strict',
  },
});
```

### Response Headers

Rate limiting headers are automatically added:
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - When the limit resets

## Examples

### Multiple HTTP Methods

```js
// pages/api/users.js - Clean method separation
export async function GET(request) {
  return new Response(JSON.stringify({ users: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const { name, email } = await request.json();
  
  return new Response(JSON.stringify({
    message: 'User created',
    user: { name, email },
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Dynamic Routes

```js
// pages/api/products/[id].js
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop(); // Extract [id]
  
  return new Response(JSON.stringify({
    product: { id, name: `Product ${id}` },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Protected Route with Authentication

```js
// pages/api/protected/data.js
export async function GET(request) {
  // request.user is set by auth middleware
  return new Response(JSON.stringify({
    message: `Hello ${request.user.name}`,
    data: 'sensitive data',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Login with CSRF Token

```js
// pages/api/auth/login.js
export async function POST(request) {
  const { username, password } = await request.json();
  
  if (username === 'admin' && password === 'secret') {
    const csrfToken = crypto.randomUUID(); // Generate CSRF token
    
    return new Response(JSON.stringify({ 
      success: true, 
      csrfToken,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `session=token123; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`,
      },
    });
  }
  
  return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Using CSRF Token (Client-side)

```js
// Get CSRF token
const { csrfToken } = await fetch('/api/auth/login').then(r => r.json());

// Use token in POST request
await fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: JSON.stringify({ name: 'John' }),
});
```

### Public Route (Skip Auth)

```js
// vite.config.js
auth: async (req, res) => {
  // Skip auth for public routes
  if (req.url.includes('/api/public')) {
    return true;
  }
  
  // Check auth for other routes
  const token = req.headers.authorization;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  
  return true;
}
```

## Configuration Options

### cors
- `origin` - Allowed origins (string, array, or '*')
- `methods` - Allowed HTTP methods
- `credentials` - Allow credentials
- `maxAge` - Preflight cache duration

### rateLimit
- `windowMs` - Time window in milliseconds
- `max` - Maximum requests per window per IP

### security
- `enableCsrf` - Enable CSRF protection (default: true)
- `enableHelmet` - Enable security headers (default: true)
- `maxBodySize` - Maximum request body size in bytes
- `allowedMethods` - Allowed HTTP methods

### https
- `enabled` - Enable HTTPS (default: false)
- `key` - SSL private key (Buffer or path)
- `cert` - SSL certificate (Buffer or path)

### errorTracking
- `enabled` - Enable Sentry error tracking (default: false)
- `dsn` - Sentry DSN
- `environment` - Environment name (development/production)
- `sampleRate` - Error sampling rate (0.0 to 1.0)
- `beforeSend` - Function to filter/modify events

### encryption (Optional)
- `enabled` - Enable request/response encryption (default: false)
- `algorithm` - Encryption algorithm (default: 'aes-256-gcm')
- `keyRotation` - Key rotation interval (default: '24h')
- `secretKey` - Master secret key for encryption

Example encryption configuration:
```js
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  plugins: [
    apiRoutes({
      encryption: {
        enabled: process.env.ENCRYPTION_ENABLED === 'true',
        algorithm: 'aes-256-gcm',
        keyRotation: '24h',
        secretKey: process.env.ENCRYPTION_SECRET_KEY,
      },
      // ... other options
    }),
  ],
});
```

### auth
Optional authentication middleware function:
```js
async (req, res) => {
  // Return true to allow, false to deny
  // Set req.user for authenticated user
}
```

## Testing

The plugin includes comprehensive testing utilities to make API testing easier:

### Test Utilities

```typescript
// Import from the testing module in your project
import {
  createTestRequest,
  createMockUser,
  ApiTestHelper,
  MockDatabase,
  RateLimitTester,
  CsrfTester,
} from './src/testing';

// Create mock requests
const request = createTestRequest('/api/users', {
  method: 'POST',
  body: JSON.stringify({ name: 'John Doe' }),
  headers: { 'Content-Type': 'application/json' },
});

// Test API responses (using modern style route)
import { POST } from './pages/api/users';
const response = await POST(request);
await ApiTestHelper.expectSuccess(response, 201);
await ApiTestHelper.expectJson(response);

// Mock database
const mockDb = new MockDatabase();
const users = mockDb.find('users');
const user = mockDb.create('users', { name: 'John' });
```

### Example Test

```typescript
import { describe, it, expect } from 'vitest';
import { createTestRequest, ApiTestHelper } from './src/testing';
import { POST } from './pages/api/users';

describe('Users API', () => {
  it('should create a new user', async () => {
    const request = createTestRequest('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
      }),
    });

    const response = await POST(request);
    const data = await ApiTestHelper.expectSuccess(response, 201);
    
    expect(data.user).toHaveProperty('id');
    expect(data.user.name).toBe('John Doe');
  });
});
```

### Running Tests

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Test UI
npm run test:ui
```

## Security Best Practices

### Essential Security Checklist

- ✅ **Enable HTTPS in production** - See [HTTPS-SETUP.md](./HTTPS-SETUP.md)
- ✅ **Whitelist specific CORS origins** - Never use `origin: '*'` in production
- ✅ **Implement authentication** - JWT, API keys, or sessions (see [AUTH-GUIDE.md](./AUTH-GUIDE.md))
- ✅ **Enable CSRF protection** - Enabled by default for state-changing methods
- ✅ **Set rate limits** - Protect against brute force and DDoS attacks
- ✅ **Use secure cookies** - httpOnly, secure, sameSite flags (see [COOKIES-GUIDE.md](./COOKIES-GUIDE.md))
- ✅ **Validate all inputs** - Sanitization enabled by default
- ✅ **Store secrets securely** - Use environment variables (see [ENV-GUIDE.md](./ENV-GUIDE.md))
- ✅ **Use strong password hashing** - Argon2id implementation included
- ✅ **Enable error tracking** - Sentry integration (see [SENTRY-SETUP.md](./SENTRY-SETUP.md))
- ✅ **Keep dependencies updated** - Use `npm audit` regularly (see [DEPENDENCIES-GUIDE.md](./DEPENDENCIES-GUIDE.md))
- ✅ **Enable response compression** - Reduce bandwidth and improve performance
- ✅ **Implement request timeouts** - Prevent slowloris attacks (30s default)

### Quick Security Setup

```js
// vite.config.js - Production-ready security configuration
export default defineConfig({
  plugins: [
    apiRoutes({
      // HTTPS (required for production)
      https: {
        enabled: true,
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH),
      },
      
      // CORS - Whitelist specific origins
      cors: {
        origin: process.env.ALLOWED_ORIGINS.split(','),
        credentials: true,
      },
      
      // Rate limiting - Adjust based on your needs
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Max 100 requests per IP
      },
      
      // Security features
      security: {
        enableCsrf: true,
        enableHelmet: true,
        maxBodySize: 1024 * 1024, // 1MB
      },
      
      // Error tracking
      errorTracking: {
        enabled: true,
        dsn: process.env.SENTRY_DSN,
        environment: 'production',
      },
      
      // Authentication
      auth: async (req, res) => {
        // Implement your auth logic
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          res.status(401).json({ error: 'Unauthorized' });
          return false;
        }
        // Verify token and set req.user
        return true;
      },
    }),
  ],
});
```

See [SECURITY.md](./SECURITY.md) for comprehensive security guidelines and best practices.

## License

MIT
