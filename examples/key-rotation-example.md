# Encryption Key Rotation Example

This example demonstrates how to rotate encryption keys without invalidating the cache.

## Basic Setup

```javascript
import { CacheManager } from '../src/lib/cache.js';

// Option 1: Single key (simple)
const cache = new CacheManager({
  type: 'memory',
  encryptionKey: 'my-secret-key-v1',
});

// Option 2: Key rotation (advanced)
const cacheWithRotation = new CacheManager({
  type: 'memory',
  encryptionKey: {
    activeKey: 'my-secret-key-v2',
    previousKeys: ['my-secret-key-v1'],
  },
});
```

## Key Rotation Workflow

### Step 1: Initial Setup
```javascript
// Start with a single key
const cache = new CacheManager({
  type: 'memory',
  encryptionKey: 'key-v1',
  encryptByDefault: true,
});

// Cache some data
await cache.set('user:123', { name: 'Alice', email: 'alice@example.com' }, 3600);
```

### Step 2: Rotate to New Key
```javascript
// Rotate to a new key
cache.rotateEncryptionKey('key-v2');

// Check status
console.log(cache.getEncryptionStatus());
// Output: { enabled: true, hasActiveKey: true, previousKeyCount: 1, cacheSize: 0 }
```

### Step 3: Seamless Access
```javascript
// Old data encrypted with key-v1 can still be read
const user = await cache.get('user:123');
console.log(user); // { name: 'Alice', email: 'alice@example.com' }

// New data is encrypted with key-v2
await cache.set('user:456', { name: 'Bob', email: 'bob@example.com' }, 3600);
```

### Step 4: Multiple Rotations
```javascript
// Rotate again
cache.rotateEncryptionKey('key-v3');

// Now supports 3 keys: key-v3 (active), key-v2, key-v1
// Can decrypt data encrypted with any of these keys

// After 4th rotation, key-v1 is dropped (max 3 previous keys)
cache.rotateEncryptionKey('key-v4');
// Supports: key-v4 (active), key-v3, key-v2
```

## Production Deployment Strategy

### Gradual Key Rotation

```javascript
// Week 1: Deploy with both keys
const cache = new CacheManager({
  encryptionKey: {
    activeKey: process.env.ENCRYPTION_KEY_V2,
    previousKeys: [process.env.ENCRYPTION_KEY_V1],
  },
});

// Week 2-3: Monitor and let cache naturally refresh
// All new writes use key-v2
// Old cached items with key-v1 are still readable

// Week 4: Remove old key from config
// By now, most cached items use key-v2
// Items still using key-v1 will be cache misses (acceptable)
```

### Scheduled Rotation

```javascript
// Rotate keys monthly
import cron from 'node-cron';

cron.schedule('0 0 1 * *', () => {
  const newKey = generateSecureKey(); // Your key generation logic
  cache.rotateEncryptionKey(newKey);
  
  // Store new key in secure storage (e.g., AWS Secrets Manager)
  await storeKeySecurely(newKey);
  
  console.log('Encryption key rotated successfully');
});
```

## Environment Variables

```bash
# .env
CACHE_ENCRYPTION_KEY_ACTIVE=your-current-key-here
CACHE_ENCRYPTION_KEY_PREVIOUS_1=your-previous-key-1
CACHE_ENCRYPTION_KEY_PREVIOUS_2=your-previous-key-2
```

```javascript
// Load from environment
const cache = new CacheManager({
  encryptionKey: {
    activeKey: process.env.CACHE_ENCRYPTION_KEY_ACTIVE,
    previousKeys: [
      process.env.CACHE_ENCRYPTION_KEY_PREVIOUS_1,
      process.env.CACHE_ENCRYPTION_KEY_PREVIOUS_2,
    ].filter(Boolean), // Remove undefined values
  },
});
```

## Best Practices

1. **Key Generation**: Use cryptographically secure random keys (32+ bytes)
   ```javascript
   import crypto from 'crypto';
   const newKey = crypto.randomBytes(32).toString('base64');
   ```

2. **Key Storage**: Store keys in secure secret management systems
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault

3. **Rotation Schedule**: Rotate keys regularly (e.g., every 90 days)

4. **Monitoring**: Track decryption failures to detect issues
   ```javascript
   cache.on('decryption-error', (error) => {
     logger.error('Cache decryption failed', { error });
   });
   ```

5. **Graceful Degradation**: If decryption fails, treat as cache miss
   - The implementation already handles this
   - Failed decryptions return `null` and delete the entry

6. **Limit Previous Keys**: Keep max 3 previous keys (configurable)
   - Balances security with backward compatibility
   - Older cached items become cache misses (acceptable)

## Redis Example

```javascript
import { createClient } from 'redis';

const redisClient = createClient();
await redisClient.connect();

const cache = new CacheManager({
  type: 'redis',
  redis: redisClient,
  encryptionKey: {
    activeKey: process.env.ENCRYPTION_KEY_ACTIVE,
    previousKeys: [
      process.env.ENCRYPTION_KEY_PREV_1,
      process.env.ENCRYPTION_KEY_PREV_2,
    ].filter(Boolean),
  },
});

// Same rotation API works for Redis
cache.rotateEncryptionKey('new-key');
```

## Testing Key Rotation

```javascript
import { describe, it, expect } from 'vitest';

describe('Key Rotation', () => {
  it('should decrypt data encrypted with previous key', async () => {
    const cache = new CacheManager({
      encryptionKey: 'key-v1',
    });
    
    // Encrypt with key-v1
    await cache.set('test', { value: 'secret' }, 3600, { encrypt: true });
    
    // Rotate to key-v2
    cache.rotateEncryptionKey('key-v2');
    
    // Should still decrypt data encrypted with key-v1
    const data = await cache.get('test');
    expect(data).toEqual({ value: 'secret' });
  });
  
  it('should encrypt new data with active key', async () => {
    const cache = new CacheManager({
      encryptionKey: 'key-v1',
    });
    
    cache.rotateEncryptionKey('key-v2');
    
    // New data uses key-v2
    await cache.set('new', { value: 'data' }, 3600, { encrypt: true });
    
    const data = await cache.get('new');
    expect(data).toEqual({ value: 'data' });
  });
});
```
