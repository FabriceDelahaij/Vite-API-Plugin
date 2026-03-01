# Zstandard (zstd) Compression Examples

Zstandard is a modern compression algorithm that offers excellent speed/ratio balance. It's faster than gzip with similar or better compression ratios.

## Cache with Zstd Compression

```javascript
import { CacheManager } from '../src/lib/cache.js';

// Create cache with zstd compression
const cache = new CacheManager({
  type: 'memory',
  compressionThreshold: 1024, // Compress values > 1KB
  compressionAlgorithm: 'zstd', // Use zstd instead of gzip
  zstdLevel: 3, // Compression level 1-22 (default: 3)
  encryptionKey: process.env.CACHE_ENCRYPTION_KEY,
});

// Cache some data
await cache.set('user:123', {
  id: 123,
  name: 'John Doe',
  profile: { /* large object */ }
}, 300); // 5 minutes TTL

// Retrieve cached data (automatically decompressed)
const user = await cache.get('user:123');
```

## Compression Middleware with Zstd

```javascript
import { createCompressionMiddleware, COMPRESSION_PRESETS } from '../src/lib/compression.js';

// Use the zstd preset
const { compressionManager, middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.zstd);

// Or customize zstd settings
const { compressionManager, middleware } = createCompressionMiddleware({
  enabled: true,
  threshold: 1024,
  algorithms: ['zstd', 'br', 'gzip', 'deflate'], // Prefer zstd
  zstdLevel: 3, // Balanced compression (1=fastest, 22=best compression)
});
```

## Zstd Compression Levels

- **Level 1-3**: Fast compression, good for real-time APIs
- **Level 4-9**: Balanced speed/ratio (recommended for most use cases)
- **Level 10-19**: Better compression, slower (good for static content)
- **Level 20-22**: Maximum compression, very slow (rarely needed)

## Performance Comparison

| Algorithm | Speed | Ratio | Use Case |
|-----------|-------|-------|----------|
| zstd (level 3) | Very Fast | Good | Real-time APIs, high throughput |
| gzip (level 6) | Fast | Good | General purpose, broad compatibility |
| brotli (level 6) | Slow | Better | Static assets, modern browsers |

## When to Use Zstd

✅ **Good for:**
- High-throughput APIs
- Internal microservices
- Real-time data compression
- Database caching
- Log compression

❌ **Not ideal for:**
- Public-facing APIs (limited browser support)
- Legacy client compatibility
- Streaming compression (not yet implemented)

## Browser Support

Zstd is not yet widely supported in browsers. Use it for:
- Server-to-server communication
- Internal APIs
- Cache storage
- Database compression

For browser-facing APIs, the middleware will automatically fall back to brotli/gzip based on the client's Accept-Encoding header.

## Redis Cache with Zstd

```javascript
import { createClient } from 'redis';
import { CacheManager } from '../src/lib/cache.js';

const redisClient = createClient();
await redisClient.connect();

const cache = new CacheManager({
  type: 'redis',
  redis: redisClient,
  compressionAlgorithm: 'zstd',
  zstdLevel: 3,
  encryptionKey: process.env.CACHE_ENCRYPTION_KEY,
});
```

## Benchmarks

Typical compression results for JSON API responses:

```
Original: 10KB JSON
- gzip (level 6): 2.1KB (79% reduction) - 1.2ms
- zstd (level 3): 1.9KB (81% reduction) - 0.8ms
- brotli (level 6): 1.8KB (82% reduction) - 3.5ms

Original: 100KB JSON
- gzip (level 6): 18KB (82% reduction) - 8ms
- zstd (level 3): 16KB (84% reduction) - 5ms
- brotli (level 6): 15KB (85% reduction) - 25ms
```

Zstd offers the best speed/ratio balance for most scenarios.
