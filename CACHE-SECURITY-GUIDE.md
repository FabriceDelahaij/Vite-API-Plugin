# Cache Security Hardening Guide

This guide covers the advanced security features implemented in the cache system to protect sensitive data and prevent tampering.

## Security Features Overview

### 1. Zero Sensitive Data from Logs
All encryption keys, decrypted payloads, and derived keys are automatically zeroed from memory and excluded from error logs.

**Implementation:**
- Error messages are sanitized to remove sensitive data
- Derived encryption keys are zeroed after use
- Key cache entries are zeroed before eviction
- Buffers containing decrypted data are zeroed after processing

```javascript
// Keys are never logged
console.error('Encryption error'); // ✓ Safe
console.error('Encryption error:', error); // ✗ Avoided (might leak keys)
```

### 2. HMAC Tamper Detection
Optional HMAC (Hash-based Message Authentication Code) provides an additional layer of tamper detection beyond GCM's built-in authentication.

**Why HMAC + GCM?**
- GCM provides authenticated encryption (confidentiality + integrity)
- HMAC adds defense-in-depth against implementation bugs or side-channel attacks
- Separate HMAC key derived from master key prevents key reuse

**Configuration:**
```javascript
const cacheManager = new CacheManager({
  encryptionKey: process.env.CACHE_ENCRYPTION_KEY,
  enableHMAC: true, // Default: enabled
});
```

**How it works:**
1. After encryption, HMAC is computed over encrypted data + context
2. During decryption, HMAC is verified before attempting decryption
3. If HMAC fails, decryption is skipped (prevents timing attacks)

### 3. Additional Authenticated Data (AAD)
AAD binds encrypted cache entries to their cache keys, preventing key-swapping attacks.

**Attack Prevention:**
Without AAD, an attacker could swap encrypted values between cache keys:
```
cache['user:123'] = encrypted_data_for_user_456  // ✗ Would decrypt successfully
```

With AAD, the cache key is cryptographically bound to the encrypted data:
```
cache['user:123'] = encrypted_data_for_user_456  // ✓ Decryption fails (AAD mismatch)
```

**Configuration:**
```javascript
const cacheManager = new CacheManager({
  encryptionKey: process.env.CACHE_ENCRYPTION_KEY,
  enableAAD: true, // Default: enabled
});
```

**How it works:**
```javascript
// Encryption: AAD = cache key
cipher.setAAD(Buffer.from(cacheKey));

// Decryption: AAD must match
decipher.setAAD(Buffer.from(cacheKey));
```

### 4. Key Rotation Grace Period
Enforces a time-based policy for accepting cache entries encrypted with old keys.

**Use Case:**
After rotating encryption keys, you may want to:
- Accept old cache entries for 7 days (grace period)
- Reject entries older than 7 days (force re-encryption)

**Configuration:**
```javascript
const cacheManager = new CacheManager({
  encryptionKey: {
    activeKey: process.env.CACHE_ENCRYPTION_KEY_NEW,
    previousKeys: [process.env.CACHE_ENCRYPTION_KEY_OLD],
  },
  keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days (default)
});
```

**How it works:**
1. Each encrypted entry stores a timestamp
2. During decryption with old keys, age is checked
3. If age > grace period, entry is rejected
4. Active key entries are always accepted (no age limit)

**Disable grace period:**
```javascript
keyRotationGracePeriod: 0, // Accept old keys indefinitely
```

## Complete Configuration Example

```javascript
import { createCacheMiddleware } from './lib/cache.js';

const { cacheManager, middleware } = createCacheMiddleware({
  // Basic settings
  type: 'memory',
  maxBytes: 50 * 1024 * 1024, // 50MB
  defaultTTL: 300, // 5 minutes
  
  // Encryption settings
  encryptionKey: {
    activeKey: process.env.CACHE_ENCRYPTION_KEY_V2,
    previousKeys: [
      process.env.CACHE_ENCRYPTION_KEY_V1,
    ],
  },
  encryptByDefault: true, // Encrypt all cached responses
  
  // Security hardening
  enableHMAC: true, // Tamper detection (default: enabled)
  enableAAD: true, // Context binding (default: enabled)
  keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
  
  // Compression
  compressionThreshold: 1024,
  compressionAlgorithm: 'zstd',
  zstdLevel: 3,
});

// Use in your API routes
app.use('/api', middleware);
```

## Key Rotation Workflow

### Step 1: Generate New Key
```bash
# Generate a secure random key (32 bytes = 256 bits)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 2: Update Environment Variables
```bash
# .env
CACHE_ENCRYPTION_KEY_V2=<new-key>
CACHE_ENCRYPTION_KEY_V1=<old-key>
```

### Step 3: Rotate Key in Application
```javascript
// Option A: Restart with new config (recommended)
const cacheManager = new CacheManager({
  encryptionKey: {
    activeKey: process.env.CACHE_ENCRYPTION_KEY_V2,
    previousKeys: [process.env.CACHE_ENCRYPTION_KEY_V1],
  },
});

// Option B: Hot rotation (no restart)
cacheManager.rotateEncryptionKey(process.env.CACHE_ENCRYPTION_KEY_V2);
```

### Step 4: Monitor Grace Period
```javascript
// Check encryption status
const status = cacheManager.getEncryptionStatus();
console.log(status);
// {
//   enabled: true,
//   hasActiveKey: true,
//   previousKeyCount: 1,
//   cacheSize: 42,
//   hmacEnabled: true,
//   aadEnabled: true,
//   keyRotationGracePeriod: 604800000,
//   activeKeyAge: 86400000 // 1 day since rotation
// }
```

### Step 5: Remove Old Key (After Grace Period)
After 7 days (or your configured grace period), remove the old key:

```javascript
const cacheManager = new CacheManager({
  encryptionKey: process.env.CACHE_ENCRYPTION_KEY_V2, // Only new key
});
```

## Security Best Practices

### 1. Key Management
- **Never hardcode keys** - Use environment variables or secret management services
- **Rotate keys regularly** - Every 90 days recommended
- **Use strong keys** - Minimum 32 bytes (256 bits) of cryptographically secure random data
- **Separate keys per environment** - Dev, staging, and production should use different keys

### 2. Encryption Settings
- **Enable HMAC** - Provides defense-in-depth (enabled by default)
- **Enable AAD** - Prevents key-swapping attacks (enabled by default)
- **Set grace period** - Balance between security and cache hit rate
- **Encrypt sensitive data** - Use `encryptByDefault: true` or selective encryption

### 3. Monitoring
```javascript
// Regular health checks
const stats = await cacheManager.getStats();
console.log('Cache stats:', {
  size: stats.size,
  encryptionEnabled: stats.encryptionEnabled,
  utilizationPercent: stats.utilizationPercent,
});

const encStatus = cacheManager.getEncryptionStatus();
console.log('Encryption status:', {
  activeKeyAge: encStatus.activeKeyAge,
  previousKeyCount: encStatus.previousKeyCount,
});
```

### 4. Error Handling
All encryption errors are sanitized to prevent key leakage:

```javascript
try {
  await cacheManager.set('key', sensitiveData);
} catch (error) {
  // Error message is sanitized (no keys or data leaked)
  console.error('Cache error:', error.message);
  // Fallback: serve from database
}
```

## Performance Considerations

### HMAC Overhead
- **Cost:** ~0.1-0.5ms per operation (negligible for most use cases)
- **Benefit:** Defense-in-depth against tampering
- **Recommendation:** Keep enabled unless microsecond latency is critical

### AAD Overhead
- **Cost:** ~0.01ms per operation (minimal)
- **Benefit:** Prevents key-swapping attacks
- **Recommendation:** Always keep enabled

### Key Derivation Caching
- Derived keys are cached for 5 minutes
- Reduces scrypt overhead from ~50ms to ~0.01ms
- Cache size limited to 100 entries (LRU eviction)
- Keys are zeroed before eviction

## Threat Model

### Protected Against:
✓ **Key leakage via logs** - Sensitive data zeroed and sanitized  
✓ **Cache tampering** - HMAC verification detects modifications  
✓ **Key-swapping attacks** - AAD binds data to cache keys  
✓ **Timing attacks** - Constant-time operations where possible  
✓ **Old key exploitation** - Grace period enforcement  
✓ **Memory dumps** - Sensitive data zeroed after use  

### Not Protected Against:
✗ **Compromised encryption keys** - Rotate keys immediately if compromised  
✗ **Physical access to memory** - Use full-disk encryption  
✗ **Side-channel attacks** - Requires hardware-level mitigations  
✗ **Application-level vulnerabilities** - Follow secure coding practices  

## Migration from v1 to v2

The security hardening introduces version 2 of the encryption format. Both versions are supported:

**v1 Format (Legacy):**
```json
{
  "v": 1,
  "salt": "...",
  "iv": "...",
  "authTag": "...",
  "data": "..."
}
```

**v2 Format (Current):**
```json
{
  "v": 2,
  "salt": "...",
  "iv": "...",
  "authTag": "...",
  "data": "...",
  "timestamp": 1234567890,
  "hmac": "..."
}
```

**Automatic Migration:**
- Old v1 entries are automatically decrypted (backward compatible)
- New entries are encrypted with v2 format
- No manual migration required
- Grace period applies to both v1 and v2 entries

## Troubleshooting

### "HMAC verification failed"
**Cause:** Cache entry was tampered with or corrupted  
**Solution:** Entry is automatically rejected and removed from cache

### "Cache entry expired due to key rotation policy"
**Cause:** Entry encrypted with old key is beyond grace period  
**Solution:** Entry is rejected, will be re-cached with new key on next request

### "Decryption failed with all available keys"
**Cause:** None of the configured keys can decrypt the entry  
**Solution:** Check that previousKeys includes all recently used keys

### High memory usage in key cache
**Cause:** Many unique salts (normal for high-traffic systems)  
**Solution:** Key cache is limited to 100 entries with LRU eviction (automatic)

## References

- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final) - GCM Mode
- [RFC 2104](https://tools.ietf.org/html/rfc2104) - HMAC
- [OWASP Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
