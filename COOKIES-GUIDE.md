# Secure Cookies Guide

Complete guide for implementing secure cookies in your Vite API routes.

## 🍪 Cookie Security Basics

Secure cookies are essential for protecting user sessions and preventing attacks like XSS, CSRF, and session hijacking.

### Security Attributes

1. **HttpOnly** - Prevents JavaScript access (XSS protection)
2. **Secure** - Only sent over HTTPS (prevents interception)
3. **SameSite** - CSRF protection (strict, lax, or none)
4. **Path** - Limits cookie scope
5. **Domain** - Controls subdomain access
6. **MaxAge/Expires** - Controls cookie lifetime

## 🚀 Quick Start

### Setting Cookies

```js
// pages/api/auth/login.js
export async function POST(request) {
  const { username, password } = await request.json();
  
  // Validate credentials...
  
  // Set secure cookie
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_token=token123; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/',
    },
  });
}
```

### Reading Cookies

```js
// pages/api/auth/me.js
export async function GET(request) {
  // Parse cookies from request
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => c.split('='))
  );
  
  const authToken = cookies.auth_token;
  
  if (!authToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Verify token and return user data...
  return new Response(JSON.stringify({ user: { id: 1 } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## 📋 Cookie Presets

Pre-configured secure cookie settings for common use cases:

### Session Cookie (Recommended for Auth)

```js
import { CookiePresets } from '../lib/cookies.js';

res.setCookie('session', token, CookiePresets.session);
// {
//   httpOnly: true,
//   secure: true,
//   sameSite: 'strict',
//   path: '/',
//   maxAge: 3600, // 1 hour
// }
```

### Long-lived Auth Cookie

```js
res.setCookie('auth', token, CookiePresets.auth);
// maxAge: 7 days
```

### Remember Me Cookie

```js
res.setCookie('remember', token, CookiePresets.rememberMe);
// maxAge: 30 days
```

### CSRF Token Cookie

```js
res.setCookie('csrf', token, CookiePresets.csrf);
// {
//   httpOnly: false, // Must be readable by client
//   secure: true,
//   sameSite: 'strict',
// }
```

## 🔒 Security Best Practices

### 1. Always Use HttpOnly for Sensitive Cookies

```js
// ✅ GOOD - Protected from XSS
res.setCookie('auth_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
});

// ❌ BAD - Vulnerable to XSS
res.setCookie('auth_token', token, {
  httpOnly: false, // JavaScript can access this!
});
```

### 2. Always Use Secure in Production

```js
// ✅ GOOD - Environment-aware
res.setCookie('session', token, {
  secure: process.env.NODE_ENV === 'production',
});

// ❌ BAD - Not secure in production
res.setCookie('session', token, {
  secure: false,
});
```

### 3. Use SameSite for CSRF Protection

```js
// ✅ GOOD - Strict CSRF protection
res.setCookie('session', token, {
  sameSite: 'strict', // Best protection
});

// ⚠️ OK - Less strict (for cross-site navigation)
res.setCookie('session', token, {
  sameSite: 'lax',
});

// ❌ BAD - No CSRF protection
res.setCookie('session', token, {
  sameSite: 'none', // Only use with secure: true
});
```

### 4. Set Appropriate Expiration

```js
// ✅ GOOD - Short-lived session
res.setCookie('session', token, {
  maxAge: 3600, // 1 hour
});

// ⚠️ OK - Long-lived with refresh
res.setCookie('refresh_token', token, {
  maxAge: 7 * 24 * 3600, // 7 days
});

// ❌ BAD - Too long
res.setCookie('session', token, {
  maxAge: 365 * 24 * 3600, // 1 year - too long!
});
```

### 5. Use Path to Limit Scope

```js
// ✅ GOOD - Limited to API routes
res.setCookie('api_token', token, {
  path: '/api',
});

// ⚠️ OK - Available everywhere
res.setCookie('session', token, {
  path: '/',
});
```

### 6. Use Domain for Subdomains

```js
// ✅ GOOD - Available on all subdomains
res.setCookie('session', token, {
  domain: '.example.com', // Note the leading dot
});

// ⚠️ OK - Only on current domain
res.setCookie('session', token, {
  domain: 'api.example.com',
});
```

## 🛡️ Signed Cookies (Tamper Protection)

Prevent cookie tampering with cryptographic signatures:

```js
import { SignedCookie } from '../lib/cookies.js';

const signer = new SignedCookie(process.env.COOKIE_SECRET);

// Sign cookie value
const signedValue = signer.sign('user123');
res.setCookie('user_id', signedValue, {
  httpOnly: true,
  secure: true,
});

// Verify and unsign
try {
  const userId = signer.unsign(req.cookies.user_id);
  console.log('Valid user ID:', userId);
} catch (error) {
  console.error('Cookie tampered!');
}
```

## 📊 Cookie Manager API

### Create Manager

```js
import { CookieManager } from '../lib/cookies.js';

const cookies = new CookieManager(req, res);
```

### Get Cookie

```js
const sessionId = cookies.get('session');
```

### Set Cookie

```js
cookies.set('session', 'token123', {
  httpOnly: true,
  secure: true,
  maxAge: 3600,
});
```

### Set Session Cookie

```js
// Expires when browser closes
cookies.setSession('temp_session', 'token123');
```

### Set Auth Cookie

```js
// 7-day auth cookie with secure defaults
cookies.setAuth('auth_token', 'token123');
```

### Clear Cookie

```js
cookies.clear('session');
```

### Clear All Cookies

```js
cookies.clearAll();
```

### Check if Cookie Exists

```js
if (cookies.has('session')) {
  // Cookie exists
}
```

## 🧪 Testing Cookies

### Test Setting Cookie

```bash
curl -v http://localhost:5173/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Look for Set-Cookie header in response
```

### Test Reading Cookie

```bash
curl http://localhost:5173/api/auth/me \
  -H "Cookie: auth_token=your-token-here"
```

### Test Cookie Attributes

```bash
# Check if cookie is HttpOnly, Secure, SameSite
curl -v http://localhost:5173/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  | grep -i "set-cookie"
```

## 🔍 Cookie Security Validation

Automatically validate cookie security:

```js
import { CookieSecurityValidator } from '../lib/cookies.js';

const options = {
  httpOnly: true,
  secure: false, // Will trigger warning in production
  sameSite: 'strict',
};

const result = CookieSecurityValidator.validate(options);

console.log('Warnings:', result.warnings);
console.log('Errors:', result.errors);
console.log('Valid:', result.isValid);
```

## 🌍 Environment-Aware Configuration

Automatically adjust cookie settings based on environment:

```js
import { getEnvironmentCookieConfig } from '../lib/cookies.js';

const config = getEnvironmentCookieConfig();

// Development: secure: false (allows HTTP)
// Production: secure: true (requires HTTPS)

res.setCookie('session', token, config);
```

## 📱 Client-Side Integration

### JavaScript (Fetch API)

```js
// Login and receive cookie
const response = await fetch('http://localhost:5173/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  credentials: 'include', // Important: Include cookies
});

// Subsequent requests automatically include cookie
const data = await fetch('http://localhost:5173/api/auth/me', {
  credentials: 'include',
});
```

### Axios

```js
import axios from 'axios';

// Configure axios to include cookies
axios.defaults.withCredentials = true;

// Login
await axios.post('http://localhost:5173/api/auth/login', {
  email,
  password,
});

// Subsequent requests include cookie automatically
const { data } = await axios.get('http://localhost:5173/api/auth/me');
```

### React Example

```jsx
import { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(null);

  const login = async (email, password) => {
    const res = await fetch('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include', // Include cookies
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
    }
  };

  const logout = async () => {
    await fetch('http://localhost:5173/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  };

  const checkAuth = async () => {
    const res = await fetch('http://localhost:5173/api/auth/me', {
      credentials: 'include',
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

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

## ⚠️ Common Pitfalls

### 1. Forgetting credentials: 'include'

```js
// ❌ BAD - Cookies won't be sent
fetch('/api/data');

// ✅ GOOD - Cookies included
fetch('/api/data', { credentials: 'include' });
```

### 2. CORS with Credentials

```js
// ❌ BAD - Can't use wildcard with credentials
cors: {
  origin: '*',
  credentials: true, // This won't work!
}

// ✅ GOOD - Specific origins
cors: {
  origin: ['http://localhost:3000'],
  credentials: true,
}
```

### 3. SameSite=None without Secure

```js
// ❌ BAD - SameSite=None requires Secure
res.setCookie('session', token, {
  sameSite: 'none',
  secure: false, // This won't work!
});

// ✅ GOOD
res.setCookie('session', token, {
  sameSite: 'none',
  secure: true,
});
```

### 4. Not Setting HttpOnly for Auth Cookies

```js
// ❌ BAD - Vulnerable to XSS
res.setCookie('auth_token', token, {
  httpOnly: false,
});

// ✅ GOOD - Protected from XSS
res.setCookie('auth_token', token, {
  httpOnly: true,
});
```

## 📚 Resources

- [MDN: HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [OWASP: Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 6265: HTTP State Management](https://tools.ietf.org/html/rfc6265)
- [SameSite Cookie Explained](https://web.dev/samesite-cookies-explained/)
