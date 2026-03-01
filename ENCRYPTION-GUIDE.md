# Request/Response Encryption Guide

The Vite API Routes Plugin includes optional request/response encryption for enhanced security in sensitive applications.

## Overview

The encryption system provides:
- **AES-256-GCM encryption** for request/response data
- **Automatic key rotation** for enhanced security
- **Transparent middleware integration**
- **Client-side encryption helpers**
- **Key management utilities**

## Setup

### 1. Install Dependencies

No additional dependencies are required - encryption uses Node.js built-in crypto module.

### 2. Configure Encryption

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';
import { createEncryptionManager } from 'vite-api-routes-plugin/encryption';

const encryptionManager = createEncryptionManager({
  enabled: process.env.ENCRYPTION_ENABLED === 'true',
  algorithm: 'aes-256-gcm',
  keyRotation: '24h',
  secretKey: process.env.ENCRYPTION_SECRET_KEY,
});

export default defineConfig({
  plugins: [
    apiRoutes({
      encryption: encryptionManager,
      // ... other options
    }),
  ],
});
```

### 3. Environment Variables

```bash
# .env
ENCRYPTION_ENABLED=true
ENCRYPTION_ALGORITHM=aes-256-gcm
ENCRYPTION_KEY_ROTATION=24h
ENCRYPTION_SECRET_KEY=your-256-bit-secret-key-here
```

## Usage

### Server-Side

#### Automatic Encryption Middleware

The encryption middleware automatically handles encrypted requests and responses:

```javascript
// pages/api/secure-data.js
export async function POST(request) {
  // Request is automatically decrypted if encrypted
  const data = await request.json();
  
  // Process data normally
  const result = processSecureData(data);
  
  // Response is automatically encrypted if client supports it
  return new Response(JSON.stringify({
    success: true,
    data: result,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### Manual Encryption

You can also manually encrypt/decrypt data:

```javascript
import { createEncryptionManager } from 'vite-api-routes-plugin/encryption';

const encryption = createEncryptionManager({
  enabled: true,
  algorithm: 'aes-256-gcm',
});

export async function POST(request) {
  const body = await request.text();
  
  // Decrypt request manually
  const decryptedData = encryption.decryptRequest(body);
  
  // Process data
  const result = processData(decryptedData);
  
  // Encrypt response manually
  return encryption.encryptResponse(result);
}
```

#### Using Encryption Decorator

```javascript
import { withEncryption, createEncryptionManager } from 'vite-api-routes-plugin/encryption';

const encryption = createEncryptionManager({ enabled: true });

const handler = withEncryption(encryption)(async function(request) {
  const data = await request.json();
  
  return new Response(JSON.stringify({
    message: 'Secure data processed',
    data,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

export { handler as POST };
```

### Client-Side

#### JavaScript/TypeScript Client

```javascript
import { ClientEncryption } from 'vite-api-routes-plugin/encryption';

const clientEncryption = new ClientEncryption('server-public-key');

// Encrypt request data
const encryptedData = await clientEncryption.encryptForServer({
  username: 'john',
  password: 'secret123',
});

// Send encrypted request
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Encrypted': 'true',
    'Accept-Encryption': 'true',
  },
  body: encryptedData,
});

// Decrypt response
if (response.headers.get('X-Encrypted') === 'true') {
  const encryptedResponse = await response.text();
  const decryptedData = await clientEncryption.decryptFromServer(encryptedResponse);
  console.log(decryptedData);
} else {
  const data = await response.json();
  console.log(data);
}
```

#### Fetch Wrapper

```javascript
// utils/encrypted-fetch.js
import { ClientEncryption } from 'vite-api-routes-plugin/encryption';

const encryption = new ClientEncryption('server-public-key');

export async function encryptedFetch(url, options = {}) {
  const { body, ...otherOptions } = options;
  
  let encryptedBody = body;
  let headers = { ...options.headers };
  
  // Encrypt request body if present
  if (body && typeof body === 'object') {
    encryptedBody = await encryption.encryptForServer(body);
    headers['X-Encrypted'] = 'true';
    headers['Accept-Encryption'] = 'true';
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url, {
    ...otherOptions,
    headers,
    body: encryptedBody,
  });
  
  // Decrypt response if encrypted
  if (response.headers.get('X-Encrypted') === 'true') {
    const encryptedData = await response.text();
    const decryptedData = await encryption.decryptFromServer(encryptedData);
    
    // Return a new Response with decrypted data
    return new Response(JSON.stringify(decryptedData), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  
  return response;
}

// Usage
const response = await encryptedFetch('/api/secure-endpoint', {
  method: 'POST',
  body: { sensitiveData: 'secret' },
});

const data = await response.json();
```

## Configuration Options

### EncryptionConfig

```typescript
interface EncryptionConfig {
  enabled: boolean;           // Enable/disable encryption
  algorithm: string;          // Encryption algorithm (default: 'aes-256-gcm')
  keyRotation: string;        // Key rotation interval (default: '24h')
  secretKey?: string;         // Master secret key
  ivLength: number;           // IV length in bytes (default: 16)
}
```

### Key Rotation Intervals

- `'1h'` - Every hour
- `'24h'` - Every 24 hours (default)
- `'7d'` - Every 7 days
- `'30d'` - Every 30 days

### Supported Algorithms

- `'aes-256-gcm'` - AES-256 with Galois/Counter Mode (recommended)
- `'aes-256-cbc'` - AES-256 with Cipher Block Chaining
- `'aes-192-gcm'` - AES-192 with GCM
- `'aes-128-gcm'` - AES-128 with GCM

## Security Considerations

### 1. Key Management

```javascript
// Generate a secure secret key
import crypto from 'crypto';

const secretKey = crypto.randomBytes(32).toString('hex');
console.log('ENCRYPTION_SECRET_KEY=' + secretKey);
```

### 2. Environment Variables

Never hardcode encryption keys in your source code:

```javascript
// ❌ Bad
const encryption = createEncryptionManager({
  secretKey: 'hardcoded-key-123',
});

// ✅ Good
const encryption = createEncryptionManager({
  secretKey: process.env.ENCRYPTION_SECRET_KEY,
});
```

### 3. HTTPS Required

Always use HTTPS when encryption is enabled:

```javascript
// vite.config.js
export default defineConfig({
  plugins: [
    apiRoutes({
      encryption: encryptionManager,
      https: {
        enabled: true,
        key: fs.readFileSync('.cert/key.pem'),
        cert: fs.readFileSync('.cert/cert.pem'),
      },
    }),
  ],
});
```

### 4. Key Rotation

Implement proper key rotation:

```javascript
const encryption = createEncryptionManager({
  enabled: true,
  keyRotation: '24h', // Rotate keys daily
});

// Monitor key rotation
encryption.on('keyRotated', (keyId) => {
  console.log(`🔑 Encryption key rotated: ${keyId}`);
});
```

## Testing Encrypted APIs

### Test Utilities

```javascript
// tests/encryption.test.js
import { describe, it, expect } from 'vitest';
import { createEncryptionManager } from 'vite-api-routes-plugin/encryption';
import { createTestRequest } from '../testing';

describe('Encryption', () => {
  const encryption = createEncryptionManager({
    enabled: true,
    algorithm: 'aes-256-gcm',
  });

  it('should encrypt and decrypt data', () => {
    const originalData = { message: 'secret data' };
    
    // Encrypt
    const encrypted = encryption.encrypt(originalData);
    expect(encrypted).toHaveProperty('encrypted');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('tag');
    
    // Decrypt
    const decrypted = encryption.decrypt(encrypted);
    expect(JSON.parse(decrypted)).toEqual(originalData);
  });

  it('should handle encrypted requests', async () => {
    const originalData = { username: 'test', password: 'secret' };
    const encryptedBody = encryption.encryptRequest(originalData);
    
    const request = createTestRequest('/api/auth/login', {
      method: 'POST',
      body: encryptedBody,
      headers: {
        'Content-Type': 'application/json',
        'X-Encrypted': 'true',
      },
    });
    
    // Test that middleware can decrypt the request
    const middleware = encryption.middleware();
    const response = await middleware(request, async (req) => {
      const data = await req.json();
      expect(data).toEqual(originalData);
      
      return new Response(JSON.stringify({ success: true }));
    });
    
    expect(response.status).toBe(200);
  });
});
```

### Mock Encryption for Tests

```javascript
// tests/setup.js
import { vi } from 'vitest';

// Mock encryption in tests
vi.mock('vite-api-routes-plugin/encryption', () => ({
  createEncryptionManager: () => ({
    encrypt: vi.fn((data) => ({ encrypted: 'mock', iv: 'mock', tag: 'mock' })),
    decrypt: vi.fn((data) => JSON.stringify(data.original || {})),
    middleware: () => (req, handler) => handler(req),
  }),
}));
```

## Performance Considerations

### 1. Selective Encryption

Only encrypt sensitive endpoints:

```javascript
// pages/api/public/status.js - No encryption needed
export async function GET() {
  return new Response(JSON.stringify({ status: 'ok' }));
}

// pages/api/auth/login.js - Encryption enabled
import { withEncryption } from 'vite-api-routes-plugin/encryption';

export const POST = withEncryption(encryption)(async function(request) {
  // Handle sensitive login data
});
```

### 2. Caching Considerations

Encrypted responses should not be cached:

```javascript
export async function GET(request) {
  const response = new Response(JSON.stringify(sensitiveData));
  
  // Prevent caching of encrypted responses
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  
  return response;
}
```

### 3. Monitoring

Monitor encryption performance:

```javascript
const encryption = createEncryptionManager({
  enabled: true,
  onEncrypt: (duration) => {
    console.log(`Encryption took ${duration}ms`);
  },
  onDecrypt: (duration) => {
    console.log(`Decryption took ${duration}ms`);
  },
});
```

## Troubleshooting

### Common Issues

#### 1. Key Not Found Error

```
Error: Encryption key abc123 not found
```

**Solution:** Key has been rotated. Ensure clients handle key rotation gracefully.

#### 2. Authentication Tag Verification Failed

```
Error: Authentication tag verification failed
```

**Solution:** Data has been tampered with or wrong key used. Check key management.

#### 3. Invalid Time Format

```
Error: Invalid time format: 25h
```

**Solution:** Use valid time formats: `1h`, `24h`, `7d`, `30d`.

### Debugging

Enable debug logging:

```javascript
const encryption = createEncryptionManager({
  enabled: true,
  debug: true, // Enable debug logging
});
```

Check encryption statistics:

```javascript
const stats = encryption.getStats();
console.log('Encryption stats:', stats);
```

## Best Practices

1. **Use HTTPS Always** - Never use encryption over HTTP
2. **Rotate Keys Regularly** - Set appropriate rotation intervals
3. **Monitor Performance** - Track encryption/decryption times
4. **Selective Encryption** - Only encrypt sensitive data
5. **Proper Key Storage** - Use secure key management systems
6. **Test Thoroughly** - Test all encryption scenarios
7. **Handle Errors Gracefully** - Implement proper error handling
8. **Document Usage** - Document which endpoints use encryption

## Migration Guide

### From Unencrypted to Encrypted

1. **Phase 1: Optional Encryption**
   ```javascript
   // Support both encrypted and unencrypted requests
   export async function POST(request) {
     let data;
     
     if (request.headers.get('X-Encrypted') === 'true') {
       const encryptedBody = await request.text();
       data = encryption.decryptRequest(encryptedBody);
     } else {
       data = await request.json();
     }
     
     // Process data...
   }
   ```

2. **Phase 2: Encourage Encryption**
   ```javascript
   // Warn about unencrypted requests
   export async function POST(request) {
     if (request.headers.get('X-Encrypted') !== 'true') {
       console.warn('Unencrypted request received - consider upgrading client');
     }
     
     // Handle both cases...
   }
   ```

3. **Phase 3: Require Encryption**
   ```javascript
   // Require encryption for sensitive endpoints
   export async function POST(request) {
     if (request.headers.get('X-Encrypted') !== 'true') {
       return new Response(JSON.stringify({
         error: 'Encryption required for this endpoint',
       }), { status: 400 });
     }
     
     // Handle encrypted requests only...
   }
   ```

### Migrating from Legacy Encryption Implementation

If you're upgrading from a previous encryption implementation, follow these steps:

#### Breaking Changes

**EncryptedData Interface:**
- `tag` is now required (was optional)
- Added `version` field for key versioning
- Added `algorithm` field

**Configuration Changes:**
- `ivLength` changed from 16 to 12 bytes for GCM
- Added `tagLength` for GCM tag length
- Added `keyDerivationRounds` for PBKDF2
- Added `distributedMode` for multi-instance support

#### Migration Steps

**Step 1: Update Environment Variables**

```bash
# .env
ENCRYPTION_ENABLED=true
ENCRYPTION_ALGORITHM=aes-256-gcm
ENCRYPTION_SECRET_KEY=your-secret-key-here
ENCRYPTION_KEY_ROTATION=24h
ENCRYPTION_PBKDF2_ROUNDS=100000
ENCRYPTION_DISTRIBUTED_MODE=false
```

**Step 2: Update Configuration**

```javascript
const encryption = createEncryptionManager({
  enabled: true,
  algorithm: 'aes-256-gcm',
  distributedMode: process.env.NODE_ENV === 'production',
  keyDerivationRounds: 100000,
});

// Access new features
const keyInfo = encryption.getActiveKeyInfo();
const stats = encryption.getStats();
```

**Step 3: Handle Legacy Data**

If you have data encrypted with the old implementation:

```javascript
class EncryptionMigrator {
  constructor(oldManager, newManager) {
    this.oldManager = oldManager;
    this.newManager = newManager;
  }

  async migrateData(legacyEncryptedData) {
    try {
      // Try new format first
      return this.newManager.decrypt(legacyEncryptedData);
    } catch (error) {
      // Fallback to old format
      console.warn('Migrating legacy encrypted data');
      const decrypted = this.oldManager.decrypt(legacyEncryptedData);
      
      // Re-encrypt with new format
      const newEncrypted = this.newManager.encrypt(JSON.parse(decrypted));
      
      // Store the new encrypted data
      await this.updateStoredData(legacyEncryptedData.id, newEncrypted);
      
      return decrypted;
    }
  }
}
```

**Step 4: Update Tests**

```javascript
it('should encrypt and decrypt with proper GCM', () => {
  const data = { message: 'test' };
  const encrypted = encryption.encrypt(data);
  
  // Verify GCM properties
  expect(encrypted).toHaveProperty('tag');
  expect(encrypted).toHaveProperty('version');
  expect(encrypted).toHaveProperty('algorithm');
  expect(Buffer.from(encrypted.iv, 'hex')).toHaveLength(12); // GCM IV
  expect(Buffer.from(encrypted.tag, 'hex')).toHaveLength(16); // GCM tag
  
  const decrypted = encryption.decrypt(encrypted);
  expect(JSON.parse(decrypted)).toEqual(data);
});

it('should detect tampering', () => {
  const data = { message: 'test' };
  const encrypted = encryption.encrypt(data);
  
  // Tamper with tag
  encrypted.tag = 'invalid';
  
  expect(() => encryption.decrypt(encrypted)).toThrow(/Authentication failed/);
});
```

#### New Features in Current Implementation

**1. Key Versioning**
```javascript
const keyInfo = encryption.getActiveKeyInfo();
console.log(`Current key version: ${keyInfo.version}`);

encryption.forceKeyRotation();

const metadata = encryption.getKeyMetadata();
```

**2. Distributed Mode**
```javascript
const encryption = createEncryptionManager({
  enabled: true,
  distributedMode: true,
  secretKey: process.env.ENCRYPTION_SECRET_KEY,
});

encryption.handleKeyRotationEvent({
  type: 'key-rotation',
  newKeyId: 'key_2_abc123',
  version: 2,
  instanceId: 'server-2'
});
```

**3. Enhanced Key Management**
```javascript
encryption.revokeKey('key_1_old123');

const stats = encryption.getStats();
console.log(`Active keys: ${stats.keyStats.active}`);
```

#### Security Improvements

- **Proper GCM Authentication**: Real authentication tags prevent tampering
- **Key Derivation**: PBKDF2 with configurable rounds (default: 100,000)
- **Distributed Support**: Key versioning for multi-instance deployments
- **Algorithm Validation**: Only secure algorithms are supported

#### Production Deployment

**Gradual Rollout:**
1. Deploy new encryption code alongside old
2. Migrate data in batches
3. Monitor for errors
4. Remove old encryption code

**Monitoring:**
```javascript
const stats = encryption.getStats();
console.log('Encryption stats:', {
  totalKeys: stats.totalKeys,
  currentVersion: stats.currentVersion,
  keyStats: stats.keyStats
});
```

This encryption system provides enterprise-grade security for your API routes while maintaining ease of use and performance.