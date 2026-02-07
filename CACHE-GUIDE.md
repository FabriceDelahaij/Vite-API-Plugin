# Response Caching Guide

This guide explains how to use the built-in response caching system to improve API performance.

## Overview

The caching system supports:
- **In-memory caching** - Fast, zero-config caching for single instances
- **Redis caching** - Distributed caching for multi-instance deployments
- **Automatic cache key generation** - Based on URL, method, query, and body
- **TTL (Time To Live)** - Configurable expiration times
- **Cache invalidation** - Manual cache clearing and pattern-based invalidation
- **Vary by headers** - Cache different responses based on headers (e.g., Authorization)

## Quick Start

### Basic In-Memory Caching

```js
import vitePluginApiRoutes from './vite-plugin-api-routes.js';
import { createCacheMiddleware } from './src/lib/cache.js';

export default {
  plugins: [
    vitePluginApiRoutes({
      cache: {
        enabled: true,
        type: 'memory',
        maxSize: 100, // Max 100 cached responses
        defaultTTL: 300, // 5 minutes
      },
    }),
  ],
};
```

### Redis Caching (Distributed)

```js
import { createClient } from 'redis';
import vitePluginApiRoutes from './vite-plugin-api-routes.js';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

await redisClient.connect();

export default {
  plugins: [
    vitePluginApiRoutes({
      cache: {
        enabled: true,
        type: 'redis',
        redis: redisClient,
        defaultTTL: 600, // 10 minutes
      },
    }),
  ],
};
```

## Configuration Options

```js
{
  cache: {
    enabled: true,              // Enable/disable caching
    type: 'memory',             // 'memory' or 'redis'
    redis: null,                // Redis client (required for type: 'redis')
    maxSize: 100,               // Max entries (memory only)
    defaultTTL: 300,            // Default TTL in seconds
    keyPrefix: 'api:',          // Cache key prefix
    varyBy: [],                 // Headers to vary cache by
    shouldCache: null,          // Custom function to determine caching
  }
}
```

## Per-Route Caching

### Using Route-Level TTL

```js
// pages/api/products.js
export async function GET(request) {
  const products = await db.products.findAll();
  
  return new Response(JSON.stringify(products), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600', // 10 minutes
    },
  });
}
```

### Conditional Caching

```js
// vite.config.js
export default {
  plugins: [
    vitePluginApiRoutes({
      cache: {
        enabled: true,
        shouldCache: (req, res, data) => {
          // Don't cache error responses
          if (res.statusCode >= 400) return false;
          
          // Don't cache authenticated requests
          if (req.headers.authorization) return false;
          
          // Don't cache empty responses
          if (!data || (Array.isArray(data) && data.length === 0)) return false;
          
          return true;
        },
      },
    }),
  ],
};
```

## Cache Invalidation

### Manual Invalidation

```js
import { CacheManager, createCacheInvalidator } from './src/lib/cache.js';

const cacheManager = new CacheManager({
  type: 'memory',
  defaultTTL: 300,
});

const invalidator = createCacheInvalidator(cacheManager);

// Clear all cache
await invalidator.clearAll();

// Invalidate specific route
await invalidator.invalidateRoute('/api/products');
```

### Invalidate on Mutations

```js
// pages/api/products.js
import { cacheManager } from './cache-instance.js';

export async function POST(request) {
  const product = await request.json();
  await db.products.create(product);
  
  // Invalidate products cache
  await cacheManager.delete('api:/api/products');
  
  return new Response(JSON.stringify(product), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Vary By Headers

Cache different responses based on headers:

```js
export default {
  plugins: [
    vitePluginApiRoutes({
      cache: {
        enabled: true,
        varyBy: ['Authorization', 'Accept-Language'],
      },
    }),
  ],
};
```

This will cache separate responses for:
- Different users (Authorization header)
- Different languages (Accept-Language header)

## Cache Statistics

### Get Cache Stats

```js
const stats = await cacheManager.getStats();
console.log(stats);
// {
//   enabled: true,
//   type: 'memory',
//   size: 42,
//   maxSize: 100,
//   entries: [
//     { key: 'api:abc123', size: 1024, expiresIn: 250000, age: 50000 },
//     ...
//   ]
// }
```

### Monitor Cache Performance

```js
// Add cache stats endpoint
// pages/api/__cache_stats.js
export async function GET(request) {
  const stats = await cacheManager.getStats();
  
  return new Response(JSON.stringify(stats), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Best Practices

### 1. Cache Public Data Only

```js
shouldCache: (req, res, data) => {
  // Don't cache authenticated requests
  return !req.headers.authorization;
}
```

### 2. Use Appropriate TTLs

```js
{
  cache: {
    defaultTTL: 300, // 5 minutes for most endpoints
  }
}

// Override per route
export async function GET(request) {
  const data = await getStaticData();
  
  return new Response(JSON.stringify(data), {
    headers: {
      'Cache-Control': 'public, max-age=3600', // 1 hour for static data
    },
  });
}
```

### 3. Invalidate on Mutations

```js
export async function POST(request) {
  const result = await createResource(request);
  
  // Invalidate related caches
  await cacheManager.delete('api:/api/resources');
  await cacheManager.delete('api:/api/resources/count');
  
  return new Response(JSON.stringify(result), { status: 201 });
}
```

### 4. Use Redis for Production

```js
// For multi-instance deployments
{
  cache: {
    type: 'redis',
    redis: redisClient,
    defaultTTL: 600,
  }
}
```

### 5. Monitor Cache Hit Rate

```js
// Track cache performance
const stats = await cacheManager.getStats();
const hitRate = stats.hits / (stats.hits + stats.misses);
console.log(`Cache hit rate: ${(hitRate * 100).toFixed(2)}%`);
```

## Advanced Patterns

### Stale-While-Revalidate

```js
export async function GET(request) {
  const cacheKey = cacheManager.generateKey(request);
  const cached = await cacheManager.get(cacheKey);
  
  if (cached) {
    // Serve stale data immediately
    const response = new Response(JSON.stringify(cached.body));
    
    // Revalidate in background
    setTimeout(async () => {
      const fresh = await fetchFreshData();
      await cacheManager.set(cacheKey, { body: fresh }, 300);
    }, 0);
    
    return response;
  }
  
  // No cache, fetch fresh
  const data = await fetchFreshData();
  await cacheManager.set(cacheKey, { body: data }, 300);
  
  return new Response(JSON.stringify(data));
}
```

### Cache Warming

```js
// Warm cache on startup
async function warmCache() {
  const popularRoutes = [
    '/api/products',
    '/api/categories',
    '/api/featured',
  ];
  
  for (const route of popularRoutes) {
    const response = await fetch(`http://localhost:3000${route}`);
    // Cache will be populated automatically
  }
}

warmCache();
```

### Conditional Requests (ETags)

```js
export async function GET(request) {
  const data = await getData();
  const etag = generateETag(data);
  
  // Check If-None-Match header
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304 });
  }
  
  return new Response(JSON.stringify(data), {
    headers: {
      'ETag': etag,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
```

## Troubleshooting

### Cache Not Working

1. Check if caching is enabled:
```js
const stats = await cacheManager.getStats();
console.log('Cache enabled:', stats.enabled);
```

2. Verify cache headers:
```bash
curl -I http://localhost:3000/api/products
# Look for: X-Cache: HIT or X-Cache: MISS
```

3. Check TTL configuration:
```js
// Ensure TTL is not too short
{ cache: { defaultTTL: 300 } } // 5 minutes minimum
```

### Memory Issues

If using in-memory cache with high traffic:

```js
{
  cache: {
    type: 'memory',
    maxSize: 1000, // Increase max size
  }
}
```

Or switch to Redis:

```js
{
  cache: {
    type: 'redis',
    redis: redisClient,
  }
}
```

### Redis Connection Issues

```js
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.on('connect', () => console.log('Redis connected'));
```

## Performance Tips

1. **Use appropriate cache sizes**: Start with 100-500 entries for memory cache
2. **Set realistic TTLs**: 5-15 minutes for dynamic data, 1+ hours for static
3. **Monitor hit rates**: Aim for >70% cache hit rate
4. **Use Redis for scale**: Switch to Redis when serving >1000 req/min
5. **Vary by essential headers only**: Each vary header multiplies cache entries
6. **Invalidate proactively**: Clear cache on mutations to avoid stale data

## See Also

- [Security Guide](./SECURITY.md) - Security best practices
- [Performance Guide](./PERFORMANCE.md) - Performance optimization
- [Redis Documentation](https://redis.io/docs/) - Redis setup and configuration
