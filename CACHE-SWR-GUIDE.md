# Stale-While-Revalidate (SWR) Implementation Guide

## Overview

The cache now supports **real** stale-while-revalidate with the `onRevalidate` hook. This allows you to:
- Serve stale data immediately (low latency)
- Fetch fresh data in the background (high freshness)
- Reduce load on your data sources
- Handle revalidation errors gracefully

## How It Works

1. **Fresh Period** - Data is served from cache (TTL not expired)
2. **Stale Period** - Data is stale but still served, triggers background revalidation
3. **Expired** - Data is completely expired and removed from cache

```
Time:     0s -------- 60s -------- 360s --------->
          |   FRESH   | STALE (SWR) | EXPIRED
          |           |             |
Cache:    HIT         STALE         MISS
Action:   Serve       Serve +       Fetch
                      Revalidate    Fresh
```

## Basic Usage

### Simple Revalidation

```javascript
import { createCacheMiddleware } from './src/lib/cache.js';

const { middleware } = createCacheMiddleware({
  type: 'memory',
  defaultTTL: 60, // Fresh for 60 seconds
  staleWhileRevalidate: 300, // Serve stale for 5 minutes while revalidating
  
  // Revalidation hook - called when stale data is served
  onRevalidate: async (key, staleValue, reqContext) => {
    console.log(`Revalidating ${reqContext.path}`);
    
    // Fetch fresh data from your data source
    const freshData = await fetchFromDatabase(reqContext.path);
    
    // Return fresh data to be cached
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: freshData,
    };
  },
});

app.use(middleware);
```

### With Custom TTL

You can return custom TTL and SWR settings from the revalidation hook:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  const freshData = await fetchFromDatabase(reqContext.path);
  
  return {
    statusCode: 200,
    headers: {},
    body: freshData,
    _cacheConfig: {
      ttl: 120, // Fresh for 2 minutes
      staleWhileRevalidate: 600, // Stale for 10 minutes
    },
  };
},
```

## Route-Specific Revalidation

Handle different routes with different logic:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  // User data - fetch from database
  if (reqContext.path.startsWith('/api/user/')) {
    const userId = reqContext.path.split('/').pop();
    const user = await db.users.findById(userId);
    
    return {
      statusCode: 200,
      headers: {},
      body: user,
      _cacheConfig: { ttl: 300, staleWhileRevalidate: 1800 }, // Long TTL
    };
  }
  
  // Stats - fetch from analytics
  if (reqContext.path === '/api/stats') {
    const stats = await analytics.getStats();
    
    return {
      statusCode: 200,
      headers: {},
      body: stats,
      _cacheConfig: { ttl: 60, staleWhileRevalidate: 300 }, // Short TTL
    };
  }
  
  // Product data - fetch from API
  if (reqContext.path.startsWith('/api/products/')) {
    const productId = reqContext.path.split('/').pop();
    const product = await externalAPI.getProduct(productId);
    
    return {
      statusCode: 200,
      headers: {},
      body: product,
      _cacheConfig: { ttl: 600, staleWhileRevalidate: 3600 }, // Very long TTL
    };
  }
  
  return null; // Don't revalidate unknown routes
},
```

## Error Handling

Handle revalidation failures gracefully:

```javascript
const { middleware } = createCacheMiddleware({
  type: 'memory',
  defaultTTL: 60,
  staleWhileRevalidate: 300,
  
  onRevalidate: async (key, staleValue, reqContext) => {
    try {
      const freshData = await fetchFromAPI(reqContext.path);
      return {
        statusCode: 200,
        headers: {},
        body: freshData,
      };
    } catch (error) {
      // Log error but don't throw - stale data will continue to be served
      console.error(`Revalidation failed for ${reqContext.path}:`, error);
      
      // Return null to keep serving stale data
      return null;
    }
  },
  
  onError: (error, operation, key) => {
    if (operation === 'revalidate') {
      console.error(`Revalidation error for ${key}:`, error.message);
      // Send alert, increment error counter, etc.
      metrics.revalidationErrors.inc();
    }
  },
});
```

## Request Context

The `reqContext` parameter provides access to the original request:

```javascript
{
  method: 'GET',
  url: '/api/user/123?include=profile',
  originalUrl: '/api/user/123?include=profile',
  path: '/api/user/123',
  query: { include: 'profile' },
  body: {},
  headers: { 'authorization': 'Bearer token...' },
  params: { id: '123' },
}
```

Use this to:
- Extract route parameters
- Pass authentication headers
- Include query parameters
- Reconstruct the original request

## Advanced Patterns

### Conditional Revalidation

Only revalidate if certain conditions are met:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  // Check if data is too old
  const age = Date.now() - staleValue.body.timestamp;
  if (age > 3600000) { // 1 hour
    // Too old, fetch fresh data
    return await fetchFreshData(reqContext.path);
  }
  
  // Still acceptable, keep serving stale
  return null;
},
```

### Batch Revalidation

Revalidate multiple related entries:

```javascript
const revalidating = new Set();

onRevalidate: async (key, staleValue, reqContext) => {
  // Prevent duplicate revalidations
  if (revalidating.has(key)) {
    return null;
  }
  
  revalidating.add(key);
  
  try {
    // Fetch fresh data
    const freshData = await fetchFromAPI(reqContext.path);
    
    // Also revalidate related data
    if (reqContext.path.startsWith('/api/user/')) {
      const userId = reqContext.path.split('/').pop();
      // Trigger revalidation of user's posts, comments, etc.
      await revalidateRelatedData(userId);
    }
    
    return {
      statusCode: 200,
      headers: {},
      body: freshData,
    };
  } finally {
    revalidating.delete(key);
  }
},
```

### Incremental Updates

Update only changed fields:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  const freshData = await fetchFromAPI(reqContext.path);
  
  // Merge with stale data to preserve unchanged fields
  const merged = {
    ...staleValue.body,
    ...freshData,
    _lastUpdated: Date.now(),
  };
  
  return {
    statusCode: 200,
    headers: {},
    body: merged,
  };
},
```

## Monitoring

Track revalidation performance:

```javascript
let revalidationCount = 0;
let revalidationErrors = 0;
let revalidationTime = [];

const { middleware } = createCacheMiddleware({
  onRevalidate: async (key, staleValue, reqContext) => {
    revalidationCount++;
    const startTime = Date.now();
    
    try {
      const freshData = await fetchFromAPI(reqContext.path);
      const duration = Date.now() - startTime;
      revalidationTime.push(duration);
      
      console.log(`Revalidated ${reqContext.path} in ${duration}ms`);
      
      return {
        statusCode: 200,
        headers: {},
        body: freshData,
      };
    } catch (error) {
      revalidationErrors++;
      throw error;
    }
  },
});

// Expose metrics
app.get('/cache/metrics', (req, res) => {
  const avgTime = revalidationTime.length > 0
    ? revalidationTime.reduce((a, b) => a + b, 0) / revalidationTime.length
    : 0;
  
  res.json({
    revalidations: revalidationCount,
    errors: revalidationErrors,
    errorRate: revalidationCount > 0 ? (revalidationErrors / revalidationCount * 100).toFixed(2) + '%' : '0%',
    avgRevalidationTime: Math.round(avgTime) + 'ms',
  });
});
```

## Response Headers

When SWR is active, you'll see these headers:

### Fresh Data
```http
X-Cache: HIT
X-Cache-Store: memory
X-Cache-TTL: 45
```

### Stale Data (Revalidating)
```http
X-Cache: STALE
X-Cache-Store: memory
X-Cache-Status: revalidating
```

### After Revalidation
```http
X-Cache: HIT
X-Cache-Store: memory
X-Cache-TTL: 60
```

## Best Practices

### 1. Set Appropriate TTLs

```javascript
// Fast-changing data
{ ttl: 30, staleWhileRevalidate: 120 }

// Moderate data
{ ttl: 300, staleWhileRevalidate: 1800 }

// Slow-changing data
{ ttl: 3600, staleWhileRevalidate: 86400 }
```

### 2. Handle Errors Gracefully

Always catch errors in `onRevalidate` to prevent stale data from being removed:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  try {
    return await fetchFreshData(reqContext.path);
  } catch (error) {
    console.error('Revalidation failed:', error);
    return null; // Keep serving stale data
  }
},
```

### 3. Avoid Thundering Herd

Prevent multiple simultaneous revalidations:

```javascript
const revalidating = new Map();

onRevalidate: async (key, staleValue, reqContext) => {
  // Check if already revalidating
  if (revalidating.has(key)) {
    return null;
  }
  
  // Mark as revalidating
  revalidating.set(key, Date.now());
  
  try {
    const freshData = await fetchFromAPI(reqContext.path);
    return { statusCode: 200, headers: {}, body: freshData };
  } finally {
    revalidating.delete(key);
  }
},
```

### 4. Use Request Context

Leverage the request context for authentication and parameters:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  // Pass authentication
  const headers = {
    'Authorization': reqContext.headers.authorization,
  };
  
  // Include query parameters
  const url = `${API_BASE}${reqContext.path}?${new URLSearchParams(reqContext.query)}`;
  
  const response = await fetch(url, { headers });
  const freshData = await response.json();
  
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: freshData,
  };
},
```

### 5. Monitor Performance

Track revalidation metrics:

```javascript
onRevalidate: async (key, staleValue, reqContext) => {
  const start = Date.now();
  
  try {
    const freshData = await fetchFromAPI(reqContext.path);
    const duration = Date.now() - start;
    
    // Log slow revalidations
    if (duration > 1000) {
      console.warn(`Slow revalidation: ${reqContext.path} took ${duration}ms`);
    }
    
    metrics.revalidationDuration.observe(duration);
    
    return { statusCode: 200, headers: {}, body: freshData };
  } catch (error) {
    metrics.revalidationErrors.inc();
    throw error;
  }
},
```

## Testing

Test SWR behavior:

```javascript
import { createCacheMiddleware } from './src/lib/cache.js';

describe('Stale-While-Revalidate', () => {
  it('should serve stale data and revalidate in background', async () => {
    let fetchCount = 0;
    
    const { middleware } = createCacheMiddleware({
      defaultTTL: 1, // 1 second
      staleWhileRevalidate: 5,
      onRevalidate: async (key, staleValue, reqContext) => {
        fetchCount++;
        return {
          statusCode: 200,
          headers: {},
          body: { version: fetchCount },
        };
      },
    });
    
    // First request - cache miss
    const res1 = await request(app).get('/api/data');
    expect(res1.headers['x-cache']).toBe('MISS');
    
    // Second request - cache hit (fresh)
    const res2 = await request(app).get('/api/data');
    expect(res2.headers['x-cache']).toBe('HIT');
    
    // Wait for stale
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    // Third request - cache hit (stale)
    const res3 = await request(app).get('/api/data');
    expect(res3.headers['x-cache']).toBe('STALE');
    expect(res3.headers['x-cache-status']).toBe('revalidating');
    
    // Wait for revalidation
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Fourth request - cache hit (fresh)
    const res4 = await request(app).get('/api/data');
    expect(res4.headers['x-cache']).toBe('HIT');
    expect(res4.body.version).toBe(1); // Revalidated data
  });
});
```

## Comparison with Other Strategies

### Traditional Caching
```
Request → Cache Miss → Fetch → Cache → Response (slow)
Request → Cache Hit → Response (fast)
Request → Cache Expired → Fetch → Cache → Response (slow)
```

### Stale-While-Revalidate
```
Request → Cache Miss → Fetch → Cache → Response (slow)
Request → Cache Hit → Response (fast)
Request → Cache Stale → Response (fast) + Background Fetch → Cache
```

### Benefits
- ✅ Always fast responses (even with stale data)
- ✅ Data stays fresh (background updates)
- ✅ Reduced load (fewer synchronous fetches)
- ✅ Better UX (no loading states)
- ✅ Graceful degradation (errors don't block responses)

## Conclusion

The `onRevalidate` hook provides real stale-while-revalidate functionality, allowing you to:
- Serve stale data immediately for low latency
- Fetch fresh data in the background for high freshness
- Handle errors gracefully without blocking responses
- Customize revalidation logic per route
- Monitor and optimize revalidation performance

This pattern is perfect for APIs where freshness is important but latency is critical!
