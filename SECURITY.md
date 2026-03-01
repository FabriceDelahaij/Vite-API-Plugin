# Security Features

This Vite API plugin includes comprehensive security features to protect your API routes.

## 🔒 Security Features

### 1. CORS (Cross-Origin Resource Sharing)
Prevents unauthorized domains from accessing your API.

```js
cors: {
  origin: ['http://localhost:3000'], // Whitelist specific origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}
```

### 2. Rate Limiting
Protects against brute force and DDoS attacks.

```js
rateLimit: {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per IP
}
```

Response headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: When the limit resets
- `Retry-After`: Seconds to wait (when rate limited)

### 3. CSRF Protection
Prevents Cross-Site Request Forgery attacks on state-changing methods (POST, PUT, DELETE, PATCH).

**Getting a CSRF token:**
```js
// In your API handler
const csrfToken = req.getCsrfToken();
res.json({ csrfToken });
```

**Using the token:**
```js
fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: JSON.stringify({ name: 'John' }),
});
```

### 4. Security Headers (Helmet-like)
Automatically sets secure HTTP headers:

- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Strict-Transport-Security` - Forces HTTPS
- `Content-Security-Policy` - Restricts resource loading
- `Referrer-Policy` - Controls referrer information
- `Permissions-Policy` - Restricts browser features

### 5. Input Sanitization
Automatically sanitizes all request inputs:

- Removes potential XSS vectors (`<>` characters)
- Limits string length (10,000 characters)
- Validates object keys (max 100 characters)
- Trims whitespace

### 6. Request Body Size Limit
Prevents memory exhaustion attacks:

```js
security: {
  maxBodySize: 1024 * 1024, // 1MB default
}
```

### 7. Method Whitelisting
Only allows specified HTTP methods:

```js
security: {
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}
```

### 8. Authentication Middleware
Custom authentication for protected routes:

```js
auth: async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !isValidToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  
  req.user = await getUserFromToken(token);
  return true;
}
```

### 9. Secure Cookies
Helper for setting secure cookies:

```js
res.setCookie('session', 'token', {
  httpOnly: true,    // Not accessible via JavaScript
  secure: true,      // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 3600,      // 1 hour
});
```

## 🛡️ Best Practices

### 1. Use HTTPS in Production
Always use HTTPS to encrypt data in transit.

### 2. Whitelist Origins
Never use `origin: '*'` in production:

```js
cors: {
  origin: ['https://yourdomain.com'],
}
```

### 3. Implement Proper Authentication
Use JWT tokens or session-based auth:

```js
import jwt from 'jsonwebtoken';

auth: async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return true;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return false;
  }
}
```

### 4. Validate and Sanitize Input
Always validate input in your handlers:

```js
export async function POST(request) {
  const { email, age } = await request.json();
  
  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Validate age range
  if (age < 0 || age > 150) {
    return new Response(JSON.stringify({ error: 'Invalid age' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Process valid data...
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 5. Use Environment Variables
Never hardcode secrets:

```js
const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.API_KEY;
```

### 6. Log Security Events
Monitor suspicious activity:

```js
export async function GET(request) {
  const url = new URL(request.url);
  console.log(`[${new Date().toISOString()}] ${request.method} ${url.pathname}`);
  
  // Your handler logic...
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 7. Handle Errors Securely
Don't leak sensitive information:

```js
try {
  // Your code...
} catch (error) {
  console.error('Internal error:', error);
  // Don't send error details to client
  res.status(500).json({ error: 'Internal server error' });
}
```

## 🌐 HTTPS Configuration

### Development

Generate self-signed certificates and run with HTTPS:

```bash
npm run dev:https
```

This automatically:
1. Generates SSL certificates in `.cert/` directory
2. Starts Vite with HTTPS enabled
3. Serves API at `https://localhost:5173`

**Manual certificate generation:**

```bash
npm run generate-cert
```

See [HTTPS-SETUP.md](./HTTPS-SETUP.md) for detailed HTTPS configuration.

### Production

Use real SSL certificates from Let's Encrypt or your provider:

```bash
# Set environment variables
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem

# Build and run
npm run build:prod
```

**Configuration:**

```js
https: {
  enabled: true,
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
}
```

### Force HTTPS Redirect

The plugin automatically sets HSTS headers:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

For additional protection, configure your reverse proxy (nginx/Apache) to redirect HTTP to HTTPS.

## 📊 Error Tracking with Sentry

### Setup

1. Install Sentry:
```bash
npm install @sentry/node
```

2. Get your DSN from [sentry.io](https://sentry.io)

3. Configure in `.env`:
```bash
SENTRY_DSN=https://your-key@sentry.io/your-project-id
```

4. Enable in config:
```js
errorTracking: {
  enabled: true,
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sampleRate: 1.0, // 100% in dev, 0.5 (50%) in prod
  beforeSend(event, hint) {
    // Remove sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.authorization;
    }
    return event;
  },
}
```

### What Gets Tracked

The plugin automatically captures:
- All unhandled errors in API routes
- Request context (method, URL, IP)
- Query parameters and body (sanitized)
- Stack traces
- User information (if authenticated)

### Test Error Tracking

```bash
# Start server
npm run dev

# Trigger test error
curl http://localhost:5173/api/test-error

# Check Sentry dashboard for the error
```

### Privacy and Security

Sensitive data is automatically filtered:
- Authorization headers
- Cookies
- Password fields
- Token parameters

See [SENTRY-SETUP.md](./SENTRY-SETUP.md) for comprehensive error tracking guide.

## 🚨 Security Checklist

### Core Security Features (Implemented)

- [x] **Enable HTTPS in production** - See [HTTPS-SETUP.md](./HTTPS-SETUP.md)
- [x] **Set up error tracking (Sentry)** - See [SENTRY-SETUP.md](./SENTRY-SETUP.md)
- [x] **Whitelist specific CORS origins** - See [AUTH-GUIDE.md](./AUTH-GUIDE.md)
- [x] **Implement authentication** - JWT, API keys, sessions - See [AUTH-GUIDE.md](./AUTH-GUIDE.md)
- [x] **Enable CSRF protection** - Enabled by default for POST/PUT/DELETE/PATCH
- [x] **Set appropriate rate limits** - Configured in vite.config.js (100 req/15min default)
- [x] **Validate all user inputs** - Automatic sanitization enabled
- [x] **Use secure cookies** - httpOnly, secure, sameSite - See [COOKIES-GUIDE.md](./COOKIES-GUIDE.md)
- [x] **Store secrets in environment variables** - See [ENV-GUIDE.md](./ENV-GUIDE.md)
- [x] **Keep dependencies updated** - See [DEPENDENCIES-GUIDE.md](./DEPENDENCIES-GUIDE.md)
- [x] **Use strong password hashing** - Argon2id implementation (GPU-resistant)
- [x] **Implement proper session management** - SessionAuth class with TTL and cleanup
- [x] **Add request logging and monitoring** - Sentry integration with error tracking
- [x] **Enable response compression** - Brotli, Gzip, Deflate support
- [x] **Implement request timeouts** - 30-second default timeout prevents slowloris attacks
- [x] **Security headers** - Helmet-like headers (X-Frame-Options, CSP, etc.)
- [x] **Input sanitization** - XSS protection with automatic input cleaning
- [x] **Request body size limits** - 1MB default limit prevents memory exhaustion
- [x] **Method whitelisting** - Only allowed HTTP methods are processed
- [x] **IP-based rate limiting** - Per-IP request tracking with automatic cleanup

### Optional Advanced Features

- [x] **Request/response encryption** - AES-256-GCM with key rotation - See [ENCRYPTION-GUIDE.md](./ENCRYPTION-GUIDE.md)
- [x] **Response caching** - In-memory or Redis caching - See [CACHE-GUIDE.md](./CACHE-GUIDE.md)
- [x] **HMR with state preservation** - Development feature for better DX
- [x] **CLI tools** - Route generation and scaffolding - See [CLI-GUIDE.md](./CLI-GUIDE.md)
- [x] **Testing utilities** - Comprehensive test helpers - See [TESTING-GUIDE.md](./TESTING-GUIDE.md)

### Recommended Additional Steps

- [ ] **Set up Web Application Firewall (WAF)** - CloudFlare, AWS WAF, etc.
- [ ] **Implement API versioning** - /api/v1/, /api/v2/ for backward compatibility
- [ ] **Add API documentation** - OpenAPI/Swagger for your endpoints
- [ ] **Set up monitoring dashboards** - Grafana, DataDog, New Relic
- [ ] **Implement audit logging** - Track all security-relevant events
- [ ] **Regular security audits** - Penetration testing and code reviews
- [ ] **Set up automated backups** - Database and configuration backups
- [ ] **Implement IP whitelisting** - For admin/sensitive endpoints
- [ ] **Add honeypot endpoints** - Detect and block malicious actors
- [ ] **Set up DDoS protection** - CloudFlare, AWS Shield, etc.

## 📚 Additional Resources

- [HTTPS-SETUP.md](./HTTPS-SETUP.md) - Complete HTTPS configuration guide
- [SENTRY-SETUP.md](./SENTRY-SETUP.md) - Error tracking setup and best practices
- [AUTH-GUIDE.md](./AUTH-GUIDE.md) - Authentication and CORS implementation
- [COOKIES-GUIDE.md](./COOKIES-GUIDE.md) - Secure cookie management
- [ENV-GUIDE.md](./ENV-GUIDE.md) - Environment variable best practices
- [DEPENDENCIES-GUIDE.md](./DEPENDENCIES-GUIDE.md) - Dependency management and updates
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Let's Encrypt](https://letsencrypt.org/)
- [Sentry Documentation](https://docs.sentry.io/)
