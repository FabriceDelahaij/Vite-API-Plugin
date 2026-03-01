# Migration Guide

Complete guide for migrating to and between different API route styles and frameworks.

## 🎯 Migration Types

### 1. [Next.js Style → Modern App Router Style](#nextjs-to-modern)
### 2. [Framework Migration (Express, Fastify, etc.)](#framework-migration)
### 3. [TypeScript Migration](#typescript-migration)

---

## Next.js Style → Modern App Router Style {#nextjs-to-modern}

### Why Migrate?

**Benefits of Modern Style:**
- **Cleaner code** - No method checking needed
- **Better performance** - Tree shaking eliminates unused methods
- **Web standards** - Uses standard Request/Response objects
- **Type safety** - Better TypeScript support
- **Explicit methods** - Each HTTP method has its own function

### Migration Examples

#### Basic Route

**Before (Next.js Style):**
```js
export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ message: 'Hello' });
  } else if (req.method === 'POST') {
    res.status(201).json({ created: req.body });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
```

**After (Modern Style):**
```js
export async function GET(request) {
  return new Response(JSON.stringify({ message: 'Hello' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const body = await request.json();
  return new Response(JSON.stringify({ created: body }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### Dynamic Routes

**Before:**
```js
export default function handler(req, res) {
  const { id } = req.query;
  
  if (req.method === 'GET') {
    res.json({ user: { id, name: `User ${id}` } });
  }
}
```

**After:**
```js
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop(); // Extract [id]
  
  return new Response(JSON.stringify({
    user: { id, name: `User ${id}` }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### Authentication & CSRF

**Before:**
```js
export default function handler(req, res) {
  if (req.method === 'POST') {
    const { username, password } = req.body;
    
    if (authenticate(username, password)) {
      const csrfToken = req.getCsrfToken();
      res.setCookie('session', 'token', { httpOnly: true });
      res.json({ success: true, csrfToken });
    } else {
      res.status(401).json({ error: 'Invalid' });
    }
  }
}
```

**After:**
```js
export async function POST(request) {
  const { username, password } = await request.json();
  
  if (authenticate(username, password)) {
    const csrfToken = request.getCsrfToken();
    
    return new Response(JSON.stringify({
      success: true,
      csrfToken,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=token; HttpOnly; Secure; SameSite=Strict',
      },
    });
  }
  
  return new Response(JSON.stringify({
    error: 'Invalid credentials',
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Key Differences

#### 1. Request Object

**Next.js Style:**
```js
const { method, query, body, cookies } = req;
const csrfToken = req.getCsrfToken();
```

**Modern Style:**
```js
const method = request.method;
const url = new URL(request.url);
const query = Object.fromEntries(url.searchParams);
const body = await request.json();
const cookies = request.cookies; // Custom property
const csrfToken = request.getCsrfToken(); // Custom property
```

#### 2. Response Object

**Next.js Style:**
```js
res.status(200).json({ data });
res.setHeader('X-Custom', 'value');
res.setCookie('name', 'value', options);
```

**Modern Style:**
```js
return new Response(JSON.stringify({ data }), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'X-Custom': 'value',
    'Set-Cookie': 'name=value; HttpOnly; Secure',
  },
});
```

#### 3. Method Handling

**Next.js Style:**
```js
if (req.method === 'GET') { /* ... */ }
else if (req.method === 'POST') { /* ... */ }
else { res.status(405).json({ error: 'Method not allowed' }); }
```

**Modern Style:**
```js
export async function GET(request) { /* ... */ }
export async function POST(request) { /* ... */ }
// 405 errors are handled automatically
```

### Step-by-Step Migration

1. **Choose a route to migrate** - Start with a simple route
2. **Replace default export** - Remove `export default function handler`
3. **Add named method exports** - `export async function GET`, etc.
4. **Update request handling** - Use `await request.json()` instead of `req.body`
5. **Update response handling** - Return `new Response()` instead of `res.json()`
6. **Remove method checking** - Each method has its own function
7. **Test the route** - Ensure all functionality works

### Common Issues & Solutions

#### Issue 1: Request Body Not Parsed
**Problem:** `await request.json()` throws an error

**Solution:** Check content type and handle different body types
```js
export async function POST(request) {
  const contentType = request.headers.get('content-type');
  
  if (contentType?.includes('application/json')) {
    const body = await request.json();
  } else if (contentType?.includes('multipart/form-data')) {
    const formData = await request.formData();
  } else {
    const text = await request.text();
  }
}
```

#### Issue 2: Dynamic Route Parameters Not Working
**Problem:** Can't extract `[id]` from URL

**Solution:** Parse the URL pathname correctly
```js
export async function GET(request) {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const id = pathSegments[pathSegments.length - 1];
}
```

---

## Framework Migration {#framework-migration}

### From Express.js

**Express Route:**
```js
app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  res.json({ user: { id } });
});
```

**Vite API Route:**
```js
// pages/api/users/[id].js
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  return new Response(JSON.stringify({ user: { id } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### From Fastify

**Fastify Route:**
```js
fastify.post('/api/users', async (request, reply) => {
  const user = await createUser(request.body);
  return { user };
});
```

**Vite API Route:**
```js
// pages/api/users.js
export async function POST(request) {
  const body = await request.json();
  const user = await createUser(body);
  
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Using CLI Migration Tool

```bash
# Migrate from Next.js
vite-api-routes migrate --from nextjs

# Migrate from Express
vite-api-routes migrate --from express

# Dry run to see what would be migrated
vite-api-routes migrate --from nextjs --dry-run

# Convert to TypeScript during migration
vite-api-routes migrate --from nextjs --typescript
```

---

## TypeScript Migration {#typescript-migration}

### 1. Install TypeScript Dependencies

```bash
npm install --save-dev typescript @types/node
```

### 2. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["pages/**/*.ts", "vite.config.js"]
}
```

### 3. Convert JavaScript to TypeScript

**Before (JavaScript):**
```js
// pages/api/users.js
export async function POST(request) {
  const { name, email } = await request.json();
  
  return new Response(JSON.stringify({ user: { name, email } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**After (TypeScript):**
```typescript
// pages/api/users.ts
interface User {
  name: string;
  email: string;
}

export async function POST(request: Request): Promise<Response> {
  const { name, email }: User = await request.json();
  
  return new Response(JSON.stringify({ user: { name, email } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 4. Modern Style with TypeScript

```typescript
// pages/api/users.ts
interface CreateUserRequest {
  name: string;
  email: string;
}

export async function POST(request: Request): Promise<Response> {
  const body: CreateUserRequest = await request.json();
  
  return new Response(JSON.stringify({ user: body }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 5. Type-Safe Validation

```typescript
function isValidUser(data: unknown): data is CreateUserRequest {
  return typeof data === 'object' && 
         data !== null && 
         'name' in data && 
         'email' in data;
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  
  if (!isValidUser(body)) {
    return new Response(JSON.stringify({
      error: 'Invalid user data'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // body is now typed as CreateUserRequest
  return new Response(JSON.stringify({ user: body }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

---

## Migration Checklist

### Next.js → Modern Style
- [ ] Replace `export default function handler` with named method exports
- [ ] Update request body parsing (`req.body` → `await request.json()`)
- [ ] Update query parameter access (`req.query` → `url.searchParams`)
- [ ] Update response creation (`res.json()` → `new Response()`)
- [ ] Update dynamic route parameter extraction
- [ ] Update cookie handling
- [ ] Update CSRF token usage
- [ ] Remove method checking logic
- [ ] Test all HTTP methods
- [ ] Test error handling

### Framework Migration
- [ ] Map route patterns to file-based routing
- [ ] Convert middleware to plugin configuration
- [ ] Update request/response handling
- [ ] Migrate authentication logic
- [ ] Update error handling
- [ ] Test all endpoints

### TypeScript Migration
- [ ] Install TypeScript dependencies
- [ ] Create tsconfig.json
- [ ] Rename .js files to .ts
- [ ] Add type imports
- [ ] Add interface definitions
- [ ] Add type annotations
- [ ] Fix type errors
- [ ] Test compilation

## 🎉 Benefits After Migration

1. **Cleaner Code** - No more method checking
2. **Better Performance** - Tree shaking works better
3. **Type Safety** - Better TypeScript support
4. **Standards Compliance** - Uses Web API standards
5. **Easier Testing** - Each method can be tested independently
6. **Better IDE Support** - Improved autocomplete and IntelliSense

The modern style makes your API routes more maintainable, performant, and aligned with web standards!