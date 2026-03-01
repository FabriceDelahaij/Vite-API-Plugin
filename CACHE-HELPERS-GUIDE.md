# Cache Helper Methods - Developer Guide

## Overview

The cache middleware provides developer-friendly helper methods that make cache control intuitive and readable. No more remembering header names or values!

## Helper Methods

### res.cache(ttl, options)

Cache the response with specified TTL and options.

**Parameters:**
- `ttl` (number) - Time to live in seconds
- `options` (object) - Optional cache configuration
  - `swr` (number) - Stale-while-revalidate period in seconds
  - `encrypt` (boolean) - Encrypt cached data
  - `public` (boolean) - Allow CDN caching (default: true)
  - `immutable` (boolean) - Mark as immutable

**Returns:** `this` (chainable)

**Example:**
```javascript
app.get('/api/products', (req, res) => {
  res.cache(3600).json({ products: [...] });
});
```

### res.noCache()

Disable caching completely.

**Returns:** `this` (chainable)

**Example:**
```javascript
app.get('/api/realtime', (req, res) => {
  res.noCache().json({ price: 123.45, timestamp: Date.now() });
});
```

### res.cachePrivate(ttl)

Cache privately (browser only, not CDN).

**Parameters:**
- `ttl` (number) - Time to live in seconds

**Returns:** `this` (chainable)

**Example:**
```javascript
app.get('/api/profile', (req, res) => {
  res.cachePrivate(300).json({ user: 'John', email: 'john@example.com' });
});
```

### res.cacheImmutable(ttl)

Cache as immutable (content never changes).

**Parameters:**
- `ttl` (number) - Time to live in seconds

**Returns:** `this` (chainable)

**Example:**
```javascript
app.get('/api/static/v1.0.0', (req, res) => {
  res.cacheImmutable(31536000).json({ version: '1.0.0', hash: 'abc123' });
});
```

## Usage Examples

### Basic Caching

```javascript
// Cache for 1 hour
app.get('/api/products', (req, res) => {
  res.cache(3600).json({
    products: ['Product A', 'Product B'],
  });
});
```

**Headers Set:**
```http
X-Cache-TTL: 3600
Cache-Control: max-age=3600, public
```

### Stale-While-Revalidate

```javascript
// Fresh for 1 minute, stale for 5 minutes
app.get('/api/news', (req, res) => {
  res.cache(60, { swr: 300 }).json({
    articles: ['Article 1', 'Article 2'],
  });
});
```

**Headers Set:**
```http
X-Cache-TTL: 60
X-Cache-SWR: 300
Cache-Control: max-age=60, stale-while-revalidate=300, public
```

### Encrypted Caching

```javascript
// Cache encrypted sensitive data
app.get('/api/sensitive', (req, res) => {
  res.cache(60, { encrypt: true }).json({
    ssn: '***-**-1234',
    creditCard: '****-****-****-5678',
  });
});
```

**Headers Set:**
```http
X-Cache-TTL: 60
X-Cache-Encrypt: true
Cache-Control: max-age=60, public
```

### No Caching

```javascript
// Disable caching for real-time data
app.get('/api/stock-price', (req, res) => {
  res.noCache().json({
    symbol: 'AAPL',
    price: 150.25,
    timestamp: Date.now(),
  });
});
```

**Headers Set:**
```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
X-Cache-Skip: true
```

### Private Caching

```javascript
// Cache in browser only, not CDN
app.get('/api/user/profile', (req, res) => {
  res.cachePrivate(300).json({
    name: 'John Doe',
    email: 'john@example.com',
  });
});
```

**Headers Set:**
```http
X-Cache-TTL: 300
Cache-Control: private, max-age=300
```

### Immutable Caching

```javascript
// Cache forever (content never changes)
app.get('/api/static/:version', (req, res) => {
  res.cacheImmutable(31536000).json({ // 1 year
    version: req.params.version,
    hash: 'abc123def456',
  });
});
```

**Headers Set:**
```http
X-Cache-TTL: 31536000
Cache-Control: public, max-age=31536000, immutable
```

## Advanced Patterns

### Conditional Caching

```javascript
app.get('/api/data', async (req, res) => {
  const data = await fetchData();
  
  if (data.status === 'success') {
    res.cache(60).json(data);
  } else {
    res.noCache().json(data);
  }
});
```

### Dynamic TTL

```javascript
app.get('/api/products/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);
  
  // Cache popular products longer
  const ttl = product.views > 1000 ? 3600 : 300;
  
  res.cache(ttl).json(product);
});
```

### Chaining Multiple Options

```javascript
app.get('/api/secure-news', (req, res) => {
  res
    .cache(60, { 
      swr: 300, 
      encrypt: true,
      public: false,
    })
    .json({
      articles: ['Sensitive Article 1'],
    });
});
```

### Route-Specific Caching

```javascript
// Public API - Long cache
app.get('/api/public/products', (req, res) => {
  res.cache(3600).json({ products: [...] });
});

// User data - Private cache
app.get('/api/user/profile', (req, res) => {
  res.cachePrivate(300).json({ user: {...} });
});

// Real-time - No cache
app.get('/api/realtime/price', (req, res) => {
  res.noCache().json({ price: 123.45 });
});

// Static - Immutable
app.get('/api/static/v1', (req, res) => {
  res.cacheImmutable(31536000).json({ version: '1.0.0' });
});
```

## Comparison: Before vs After

### Before (Manual Headers)

```javascript
app.get('/api/products', (req, res) => {
  res.setHeader('X-Cache-TTL', '3600');
  res.setHeader('X-Cache-SWR', '1800');
  res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=1800, public');
  res.json({ products: [...] });
});
```

### After (Helper Methods)

```javascript
app.get('/api/products', (req, res) => {
  res.cache(3600, { swr: 1800 }).json({ products: [...] });
});
```

**Benefits:**
- ✅ 3 lines → 1 line
- ✅ No header names to remember
- ✅ Type-safe (numbers, not strings)
- ✅ Chainable
- ✅ Self-documenting

## Real-World Examples

### E-commerce API

```javascript
// Product catalog - Long cache
app.get('/api/products', (req, res) => {
  res.cache(3600).json({ products: [...] });
});

// Product details - Medium cache with SWR
app.get('/api/products/:id', (req, res) => {
  res.cache(600, { swr: 1800 }).json({ product: {...} });
});

// Cart - Private cache
app.get('/api/cart', (req, res) => {
  res.cachePrivate(60).json({ items: [...] });
});

// Checkout - No cache
app.post('/api/checkout', (req, res) => {
  res.noCache().json({ orderId: '12345' });
});

// Static assets - Immutable
app.get('/api/assets/:hash', (req, res) => {
  res.cacheImmutable(31536000).json({ url: '...' });
});
```

### News API

```javascript
// Homepage - SWR for freshness
app.get('/api/news/homepage', (req, res) => {
  res.cache(60, { swr: 300 }).json({ articles: [...] });
});

// Article - Long cache
app.get('/api/news/article/:id', (req, res) => {
  res.cache(3600).json({ article: {...} });
});

// Breaking news - Short cache
app.get('/api/news/breaking', (req, res) => {
  res.cache(30).json({ breaking: [...] });
});

// Live updates - No cache
app.get('/api/news/live', (req, res) => {
  res.noCache().json({ updates: [...] });
});
```

### Social Media API

```javascript
// Public profile - Medium cache
app.get('/api/users/:username', (req, res) => {
  res.cache(300).json({ user: {...} });
});

// Own profile - Private cache
app.get('/api/me', (req, res) => {
  res.cachePrivate(60).json({ user: {...} });
});

// Feed - SWR
app.get('/api/feed', (req, res) => {
  res.cache(60, { swr: 300 }).json({ posts: [...] });
});

// Notifications - No cache
app.get('/api/notifications', (req, res) => {
  res.noCache().json({ notifications: [...] });
});

// Avatar - Immutable
app.get('/api/avatars/:hash', (req, res) => {
  res.cacheImmutable(31536000).json({ url: '...' });
});
```

## Headers Reference

### res.cache(ttl, options)

**Sets:**
- `X-Cache-TTL: <ttl>`
- `X-Cache-SWR: <swr>` (if swr option provided)
- `X-Cache-Encrypt: true|false` (if encrypt option provided)
- `Cache-Control: max-age=<ttl>[, stale-while-revalidate=<swr>][, public|private][, immutable]`

### res.noCache()

**Sets:**
- `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`
- `Pragma: no-cache`
- `Expires: 0`
- `X-Cache-Skip: true`

### res.cachePrivate(ttl)

**Sets:**
- `X-Cache-TTL: <ttl>`
- `Cache-Control: private, max-age=<ttl>`

### res.cacheImmutable(ttl)

**Sets:**
- `X-Cache-TTL: <ttl>`
- `Cache-Control: public, max-age=<ttl>, immutable`

## Best Practices

### 1. Use Appropriate TTLs

```javascript
// Fast-changing data
res.cache(30); // 30 seconds

// Moderate data
res.cache(300); // 5 minutes

// Slow-changing data
res.cache(3600); // 1 hour

// Static data
res.cacheImmutable(31536000); // 1 year
```

### 2. Use SWR for Better UX

```javascript
// Always fresh, but serve stale if needed
res.cache(60, { swr: 300 });
```

### 3. Encrypt Sensitive Data

```javascript
// User data, payment info, etc.
res.cache(60, { encrypt: true });
```

### 4. Use Private for User-Specific Data

```javascript
// Profile, settings, preferences
res.cachePrivate(300);
```

### 5. Disable Cache for Real-Time Data

```javascript
// Stock prices, live scores, etc.
res.noCache();
```

### 6. Use Immutable for Versioned Assets

```javascript
// /api/static/v1.0.0, /api/assets/abc123
res.cacheImmutable(31536000);
```

## TypeScript Support

```typescript
import { Request, Response } from 'express';

interface CacheOptions {
  swr?: number;
  encrypt?: boolean;
  public?: boolean;
  immutable?: boolean;
}

declare module 'express' {
  interface Response {
    cache(ttl: number, options?: CacheOptions): this;
    noCache(): this;
    cachePrivate(ttl: number): this;
    cacheImmutable(ttl: number): this;
  }
}

// Usage
app.get('/api/data', (req: Request, res: Response) => {
  res.cache(60, { swr: 300 }).json({ data: 'value' });
});
```

## Testing

```javascript
import request from 'supertest';
import app from './app';

describe('Cache Helpers', () => {
  it('should set cache headers', async () => {
    const res = await request(app).get('/api/products');
    
    expect(res.headers['x-cache-ttl']).toBe('3600');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });

  it('should disable caching', async () => {
    const res = await request(app).get('/api/realtime');
    
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-cache-skip']).toBe('true');
  });
});
```

## Migration Guide

### From Manual Headers

**Before:**
```javascript
res.setHeader('X-Cache-TTL', '60');
res.setHeader('Cache-Control', 'max-age=60, public');
```

**After:**
```javascript
res.cache(60);
```

### From shouldCache Callback

**Before:**
```javascript
createCacheMiddleware({
  shouldCache: (req, res) => {
    if (req.path === '/api/products') {
      return { cache: true, ttl: 3600 };
    }
    return false;
  },
});
```

**After:**
```javascript
// In route handler
app.get('/api/products', (req, res) => {
  res.cache(3600).json({ products: [...] });
});

app.get('/api/realtime', (req, res) => {
  res.noCache().json({ data: [...] });
});
```

## Conclusion

The cache helper methods provide a clean, intuitive API for cache control:

- ✅ **Simple** - One method call instead of multiple headers
- ✅ **Readable** - Self-documenting code
- ✅ **Type-safe** - Numbers instead of strings
- ✅ **Chainable** - Fluent API
- ✅ **Standard** - Sets proper Cache-Control headers
- ✅ **Flexible** - Works with all cache features

No more remembering header names or values - just use the helpers! 🚀
