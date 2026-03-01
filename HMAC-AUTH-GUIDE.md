# HMAC Authentication Guide (Server-Only)

HMAC (Hash-based Message Authentication Code) provides secure server-to-server communication by verifying request signatures with a shared secret. This ensures data integrity and authenticity for internal APIs and webhooks.

## Setup

### 1. Environment Variables

Add to your `.env` file:

```bash
# Server-side secret (keep this secure!)
HMAC_SECRET=your-super-secret-key-min-32-chars
```

**Security Note**: 
- Use strong, random secrets (minimum 32 characters)
- Never expose this secret to the client
- Use different secrets for different environments
- Rotate secrets regularly

### 2. Import

```javascript
import { createHMACMiddleware, generateHMACSignature } from './lib/auth.js';
```

## Basic Usage

### Protect an API Route

```javascript
import { createHMACMiddleware } from '../lib/auth.js';

// Create the middleware
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  maxAge: 300 // 5 minutes
});

export default async function handler(req, res) {
  // Verify HMAC signature
  const isAuthenticated = await hmacAuth(req, res);
  if (!isAuthenticated) {
    return; // Middleware already sent error response
  }
  
  // Request is verified and authentic
  console.log('Request verified at:', new Date(req.hmacTimestamp * 1000));
  
  res.json({ success: true, message: 'Secure data' });
}
```

### Make a Signed Request

```javascript
import { generateHMACSignature } from './lib/auth.js';

async function callInternalAPI() {
  const payload = { userId: 123, action: 'update' };
  
  // Generate signature (includes method and path for security)
  const { signature, timestamp, version } = generateHMACSignature(payload, {
    secret: process.env.HMAC_SECRET,
    method: 'POST',
    path: '/api/internal/update'
  });
  
  // Make the request
  const response = await fetch('/api/internal/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HMAC-Signature': signature,
      'X-HMAC-Timestamp': timestamp.toString(),
      'X-HMAC-Version': version
    },
    body: JSON.stringify(payload)
  });
  
  return response.json();
}
```

**Important:** Always provide `method` and `path` when generating signatures. This prevents cross-endpoint replay attacks where an attacker could replay a signed request to a different endpoint.

## Integration with createAuthMiddleware

Combine HMAC with other auth methods for flexible protection:

```javascript
import { createAuthMiddleware, createHMACMiddleware } from './lib/auth.js';

const auth = createAuthMiddleware({
  type: ['jwt', 'custom'],
  secret: process.env.JWT_SECRET,
  customVerify: createHMACMiddleware({
    secret: process.env.HMAC_SECRET
  }),
  privateRoutes: ['/api/internal/*', '/api/webhooks/*']
});

export default async function handler(req, res) {
  const isAuthenticated = await auth(req, res);
  if (!isAuthenticated) return;
  
  // User authenticated via JWT or HMAC
  res.json({ success: true });
}
```

## Advanced Configuration

### Signature Versioning (Enabled by Default)

Signature versioning is enabled by default for security. This prevents downgrade attacks:

```javascript
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  version: 'v1', // Current version (default)
  requireVersion: true // ENABLED BY DEFAULT for security
});
```

**Why enabled by default?**
- Prevents attackers from omitting version header to trigger fallback behavior
- Forces explicit version declaration
- Protects against downgrade attacks
- Can be disabled with `requireVersion: false` (not recommended)

**Client-side (version header required):**

```javascript
const { signature, timestamp, version } = generateHMACSignature(payload, {
  secret: process.env.HMAC_SECRET,
  method: 'POST',
  path: '/api/endpoint',
  version: 'v1' // Explicitly specify version
});

await fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-HMAC-Signature': signature,
    'X-HMAC-Timestamp': timestamp.toString(),
    'X-HMAC-Version': version // Include version header
  },
  body: JSON.stringify(payload)
});
```

### Key Rotation (Critical for Production)

Enable key rotation for long-lived services and zero-downtime secret updates:

**Server-side with key resolver:**

```javascript
const hmacAuth = createHMACMiddleware({
  secret: (keyId) => {
    // Resolve secret based on key ID
    const keys = {
      'key_2025_01': process.env.HMAC_SECRET_2025_01,
      'key_2024_12': process.env.HMAC_SECRET_2024_12, // Old key for transition
    };
    return keys[keyId] || null;
  },
  requireKeyId: true // Require key ID header
});
```

**Client-side with key ID:**

```javascript
const { signature, timestamp, version, keyId } = generateHMACSignature(payload, {
  secret: process.env.HMAC_SECRET_2025_01,
  method: 'POST',
  path: '/api/endpoint',
  keyId: 'key_2025_01' // Specify which key was used
});

await fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-HMAC-Signature': signature,
    'X-HMAC-Timestamp': timestamp.toString(),
    'X-HMAC-Version': version,
    'X-HMAC-Key-Id': keyId // Include key ID
  },
  body: JSON.stringify(payload)
});
```

**Key rotation workflow:**

```javascript
// Step 1: Add new key (both keys active)
const keys = {
  'key_2025_01': process.env.HMAC_SECRET_2025_01, // New key
  'key_2024_12': process.env.HMAC_SECRET_2024_12, // Old key
};

// Step 2: Update clients to use new key (gradual rollout)
// Clients send: X-HMAC-Key-Id: key_2025_01

// Step 3: Monitor for old key usage
// Track req.auth.keyId in logs

// Step 4: Remove old key after transition period
const keys = {
  'key_2025_01': process.env.HMAC_SECRET_2025_01, // Only new key
};
```

**Advanced: Database-backed key store:**

```javascript
import { getSecretFromDB } from './secrets.js';

const hmacAuth = createHMACMiddleware({
  secret: async (keyId) => {
    // Fetch from database or secrets manager
    const secret = await getSecretFromDB(keyId);
    return secret?.value;
  },
  requireKeyId: true
});
```

**Benefits:**
- Zero-downtime key rotation
- Support multiple active keys simultaneously
- Gradual client migration
- Audit trail of which keys are used
- Revoke compromised keys without breaking all clients

**Why use versioning?**
- Allows protocol changes without breaking existing clients
- Enables gradual migration to new signature formats
- Makes it explicit which version clients are using
- Prevents accidental use of old/deprecated formats

**Migration example (future v2):**

```javascript
// Server supports both v1 and v2
const hmacAuthV1 = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  version: 'v1'
});

const hmacAuthV2 = createHMACMiddleware({
  secret: process.env.HMAC_SECRET_V2,
  version: 'v2',
  requireVersion: true
});

// Try v2 first, fallback to v1
export default async function handler(req, res) {
  const version = req.headers['x-hmac-version'];
  
  if (version === 'v2') {
    const isAuth = await hmacAuthV2(req, res);
    if (!isAuth) return;
  } else {
    const isAuth = await hmacAuthV1(req, res);
    if (!isAuth) return;
  }
  
  res.json({ success: true });
}
```

### Replay Attack Protection

For high-security scenarios (financial transactions, webhooks with side effects), enable replay protection with nonces:

```javascript
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  replayProtection: true, // Enable nonce checking
  maxAge: 300
});
```

**Client-side (making requests):**

```javascript
import { generateHMACSignature } from './lib/auth.js';

const payload = { amount: 1000, recipient: 'user123' };
const { signature, timestamp, nonce } = generateHMACSignature(payload, {
  secret: process.env.HMAC_SECRET,
  includeNonce: true // Generate nonce
});

await fetch('/api/payment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-HMAC-Signature': signature,
    'X-HMAC-Timestamp': timestamp.toString(),
    'X-HMAC-Nonce': nonce // Include nonce
  },
  body: JSON.stringify(payload)
});
```

**How it works:**
- Each request includes a unique nonce (random 16-byte hex string)
- Nonce is included in the HMAC signature
- Server tracks used nonces for `maxAge` seconds
- Duplicate nonces are rejected with 403 Forbidden

**Custom nonce store (Redis example):**

```javascript
import Redis from 'ioredis';

const redis = new Redis();

const nonceStore = {
  has: async (nonce) => {
    const exists = await redis.exists(`hmac:nonce:${nonce}`);
    return exists === 1;
  },
  add: async (nonce, ttl) => {
    await redis.setex(`hmac:nonce:${nonce}`, ttl, '1');
  }
};

const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  replayProtection: true,
  nonceStore // Use Redis instead of in-memory
});
```

**When to use replay protection:**
- Financial transactions
- Webhooks that trigger side effects
- Admin operations
- Any idempotency-critical endpoints

**Trade-offs:**
- Requires state management (memory or Redis)
- Slight performance overhead
- Clients must generate unique nonces

### Custom Headers

```javascript
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  signatureHeader: 'x-custom-signature',
  timestampHeader: 'x-custom-timestamp',
  nonceHeader: 'x-custom-nonce',
  maxAge: 600, // 10 minutes
  clockSkew: 60, // 1 minute clock skew tolerance
  algorithm: 'sha512' // Use SHA-512 instead of SHA-256
});
```

### Clock Skew Tolerance

Handle clock synchronization issues between servers:

```javascript
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  maxAge: 300, // Reject requests older than 5 minutes
  clockSkew: 30 // Allow 30 seconds of future timestamps (default)
});
```

**How it works:**
- Rejects timestamps more than `clockSkew` seconds in the future
- Rejects timestamps more than `maxAge` seconds in the past
- Prevents accepting requests with far-future timestamps
- Accommodates minor clock differences between servers

**Example validation:**
```javascript
// Current time: 12:00:00
// clockSkew: 30s, maxAge: 300s

✓ 11:55:00 (5 min ago) - Valid
✓ 12:00:00 (now) - Valid  
✓ 12:00:30 (30s future) - Valid (within clock skew)
✗ 12:01:00 (1 min future) - Rejected (beyond clock skew)
✗ 11:54:00 (6 min ago) - Rejected (beyond maxAge)
```

**When to adjust:**
- Increase `clockSkew` if servers have poor time sync
- Decrease `clockSkew` for tighter security (requires NTP)
- Use NTP to keep clocks synchronized (recommended)

### Custom Error Handling

```javascript
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  onUnauthorized: (req, res, error) => {
    // Log the error
    console.error('HMAC auth failed:', error, {
      url: req.url,
      method: req.method
    });
    
    // Send custom response
    res.status(401).json({
      error: 'Authentication Failed',
      code: 'HMAC_INVALID'
    });
    
    return false;
  }
});
```

### Proxy Configuration

If running behind a proxy (nginx, load balancer, etc.), enable `trustProxy` for accurate IP logging:

```javascript
const hmacAuth = createHMACMiddleware({
  secret: process.env.HMAC_SECRET,
  trustProxy: true // Trust X-Forwarded-For header
});
```

**Important:** Only enable `trustProxy` if:
- You're behind a trusted proxy/load balancer
- The proxy sets `X-Forwarded-For` or `X-Real-IP` headers
- You control the proxy configuration

**Without `trustProxy`:**
- Uses `req.ip` or direct socket address
- Safer for direct connections
- May log proxy IP instead of client IP

**With `trustProxy`:**
- Uses first IP from `X-Forwarded-For` header
- Falls back to `X-Real-IP` header
- Better for logging actual client IPs
- ⚠️ Can be spoofed if proxy isn't configured correctly

## Common Use Cases

### 1. Internal Microservice Communication

**Service A (Caller):**

```javascript
import { generateHMACSignature } from './lib/auth.js';

async function callServiceB(data) {
  const { signature, timestamp, version } = generateHMACSignature(data, {
    secret: process.env.SERVICE_SHARED_SECRET,
    method: 'POST',
    path: '/api/process'
  });
  
  return fetch('http://service-b/api/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HMAC-Signature': signature,
      'X-HMAC-Timestamp': timestamp.toString(),
      'X-HMAC-Version': version
    },
    body: JSON.stringify(data)
  });
}
```

**Service B (Receiver):**

```javascript
import { createHMACMiddleware } from './lib/auth.js';

const hmacAuth = createHMACMiddleware({
  secret: process.env.SERVICE_SHARED_SECRET
});

export default async function handler(req, res) {
  const isAuthenticated = await hmacAuth(req, res);
  if (!isAuthenticated) return;
  
  // Process the request
  res.json({ processed: true });
}
```

### 2. Webhook Verification

**Webhook Sender:**

```javascript
import { generateHMACSignature } from './lib/auth.js';

async function sendWebhook(webhookUrl, payload) {
  const { signature, timestamp, version } = generateHMACSignature(payload, {
    secret: process.env.WEBHOOK_SECRET,
    method: 'POST',
    path: new URL(webhookUrl).pathname
  });
  
  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': timestamp.toString(),
      'X-Webhook-Version': version
    },
    body: JSON.stringify(payload)
  });
}
```

**Webhook Receiver:**

```javascript
import { createHMACMiddleware } from './lib/auth.js';

const webhookAuth = createHMACMiddleware({
  secret: process.env.WEBHOOK_SECRET,
  signatureHeader: 'x-webhook-signature',
  timestampHeader: 'x-webhook-timestamp',
  maxAge: 60 // Webhooks should be recent (1 minute)
});

export default async function handler(req, res) {
  const isAuthenticated = await webhookAuth(req, res);
  if (!isAuthenticated) return;
  
  // Process webhook
  console.log('Webhook received:', req.body);
  res.json({ received: true });
}
```

### 3. Admin API Protection

```javascript
import { createAuthMiddleware, createHMACMiddleware } from './lib/auth.js';

// Require HMAC for all admin routes
const auth = createAuthMiddleware({
  type: 'custom',
  customVerify: createHMACMiddleware({
    secret: process.env.ADMIN_API_SECRET,
    maxAge: 120 // 2 minutes for admin operations
  }),
  privateRoutes: ['/api/admin/*']
});

export default async function handler(req, res) {
  const isAuthenticated = await auth(req, res);
  if (!isAuthenticated) return;
  
  // Admin operation
  res.json({ admin: true });
}
```

### 4. Scheduled Jobs / Cron

```javascript
// cron-job.js
import { generateHMACSignature } from './lib/auth.js';

async function triggerScheduledTask() {
  const payload = { task: 'cleanup', timestamp: Date.now() };
  const { signature, timestamp, version } = generateHMACSignature(payload, {
    secret: process.env.CRON_SECRET,
    method: 'POST',
    path: '/api/cron/cleanup'
  });
  
  await fetch('http://localhost:3000/api/cron/cleanup', {
    method: 'POST',
    headers: {
      'X-HMAC-Signature': signature,
      'X-HMAC-Timestamp': timestamp.toString(),
      'X-HMAC-Version': version
    },
    body: JSON.stringify(payload)
  });
}
```

```javascript
// api/cron/cleanup.js
import { createHMACMiddleware } from '../../lib/auth.js';

const cronAuth = createHMACMiddleware({
  secret: process.env.CRON_SECRET
});

export default async function handler(req, res) {
  const isAuthenticated = await cronAuth(req, res);
  if (!isAuthenticated) return;
  
  // Run cleanup task
  await performCleanup();
  res.json({ cleaned: true });
}
```

## Security Best Practices

1. **Secret Management**
   - Use environment variables for secrets
   - Never commit secrets to version control
   - Use different secrets for different services
   - Rotate secrets regularly (every 90 days)
   - Use a secrets manager in production (AWS Secrets Manager, HashiCorp Vault)

2. **Time Window**
   - Keep time windows short (5-10 minutes for APIs, 1 minute for webhooks)
   - Use proper clock skew tolerance (default: 30 seconds)
   - Ensure server clocks are synchronized (use NTP)
   - Reject future timestamps beyond clock skew
   - Monitor timestamp validation failures for clock drift issues

3. **Replay Attack Protection**
   - Enable `replayProtection: true` for critical endpoints
   - Use Redis or similar for distributed nonce storage
   - Monitor for replay attempts in logs
   - Consider shorter `maxAge` for high-value operations
   - Implement idempotency keys as an additional layer

4. **Cross-Endpoint Protection**
   - Method and path are REQUIRED for v1 signatures (enforced)
   - Prevents replaying a signed request to a different endpoint
   - Example: Can't replay POST /api/transfer to POST /api/withdraw
   - Requests without method/path in signature are rejected
   - Built into v1 signature format automatically

5. **Version Enforcement**
   - Version header is REQUIRED by default (`requireVersion: true`)
   - Prevents downgrade attacks where attackers omit version
   - Forces clients to explicitly declare protocol version
   - Can be disabled with `requireVersion: false` (not recommended)

6. **Transport Security**
   - Always use HTTPS in production
   - HMAC prevents tampering but doesn't encrypt data
   - Use TLS 1.2 or higher

5. **Request Validation**
   - Validate payload structure before processing
   - Implement rate limiting
   - Log failed authentication attempts
   - Monitor for replay attacks

6. **Error Handling**
   - Don't reveal why verification failed in responses
   - Log detailed errors server-side only
   - Use generic error messages for clients

## Troubleshooting

### "Signature expired" Error
- Check server time synchronization
- Increase `maxAge` parameter if needed
- Verify timestamp is in seconds, not milliseconds

### "Invalid signature" Error
- Ensure both sides use the same secret
- Verify payload hasn't been modified
- Check that payload serialization is consistent (JSON.stringify order)
- Confirm headers are being sent correctly

### "Missing HMAC signature or timestamp" Error
- Verify headers are being set in the request
- Check header names match configuration
- Ensure headers aren't being stripped by proxies/load balancers

## Testing

```javascript
import { createHMACMiddleware, generateHMACSignature } from './lib/auth.js';

describe('HMAC Authentication', () => {
  const secret = 'test-secret-key-min-32-characters';
  
  test('should authenticate valid signature', async () => {
    const payload = { userId: 123, action: 'test' };
    const { signature, timestamp } = generateHMACSignature(payload, { secret });
    
    const req = {
      method: 'POST',
      body: payload,
      headers: {
        'x-hmac-signature': signature,
        'x-hmac-timestamp': timestamp.toString()
      }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const hmacAuth = createHMACMiddleware({ secret });
    const result = await hmacAuth(req, res);
    
    expect(result).toBe(true);
    expect(req.hmacVerified).toBe(true);
  });
  
  test('should reject expired signatures', async () => {
    const payload = { userId: 123 };
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
    
    const message = `${JSON.stringify(payload)}.${oldTimestamp}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');
    
    const req = {
      method: 'POST',
      body: payload,
      headers: {
        'x-hmac-signature': signature,
        'x-hmac-timestamp': oldTimestamp.toString()
      }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const hmacAuth = createHMACMiddleware({ secret, maxAge: 300 });
    const result = await hmacAuth(req, res);
    
    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  
  test('should reject tampered payloads', async () => {
    const payload = { userId: 123 };
    const { signature, timestamp } = generateHMACSignature(payload, { secret });
    
    // Tamper with payload
    const tamperedPayload = { userId: 456 };
    
    const req = {
      method: 'POST',
      body: tamperedPayload,
      headers: {
        'x-hmac-signature': signature,
        'x-hmac-timestamp': timestamp.toString()
      }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const hmacAuth = createHMACMiddleware({ secret });
    const result = await hmacAuth(req, res);
    
    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

## Performance Considerations

- HMAC computation is fast (microseconds for small payloads)
- Cache middleware instances (don't recreate on every request)
- For large payloads, consider signing a hash instead
- Use connection pooling for internal API calls

## Migration from Class-Based API

If you were using the old `HMACAuth` class, here's how to migrate:

**Old:**
```javascript
const hmac = new HMACAuth(process.env.HMAC_SECRET);
const middleware = hmac.middleware();
```

**New:**
```javascript
const middleware = createHMACMiddleware({
  secret: process.env.HMAC_SECRET
});
```

**Old:**
```javascript
const signed = hmac.sign(payload);
```

**New:**
```javascript
const { signature, timestamp } = generateHMACSignature(payload, {
  secret: process.env.HMAC_SECRET
});
```
