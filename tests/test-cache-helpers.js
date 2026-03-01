/**
 * Cache Helper Methods Test
 * Demonstrates developer-friendly cache control helpers
 * Run with: node test-cache-helpers.js
 */

import { createCacheMiddleware } from './src/lib/cache.js';

// Mock Express-like request/response
class MockRequest {
  constructor(method, url, options = {}) {
    this.method = method;
    this.url = url;
    this.originalUrl = url;
    this.path = url;
    this.query = options.query || {};
    this.body = options.body || {};
    this.headers = options.headers || {};
    this.params = options.params || {};
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this._headers = {};
    this._data = null;
  }

  setHeader(name, value) {
    this._headers[name.toLowerCase()] = value;
  }

  getHeader(name) {
    return this._headers[name.toLowerCase()];
  }

  getHeaders() {
    return { ...this._headers };
  }

  removeHeader(name) {
    delete this._headers[name.toLowerCase()];
  }

  json(data) {
    this._data = data;
    return this;
  }

  send(data) {
    return this.json(data);
  }

  end(data) {
    if (data) this._data = data;
    return this;
  }

  write() {
    return true;
  }
}

// Test scenarios
async function runTests() {
  console.log('='.repeat(70));
  console.log('CACHE HELPER METHODS TESTS');
  console.log('='.repeat(70));

  // Test 1: res.cache() - Basic Usage
  console.log('\n📦 Test 1: res.cache() - Basic Usage');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      // Simple cache control
      res.cache(60).json({ data: 'cached for 60 seconds' });
    };

    console.log('\n[Request] GET /api/data');
    const req = new MockRequest('GET', '/api/data');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache-TTL: ${res.getHeader('x-cache-ttl')}`);
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
    console.log(`  X-Cache: ${res.getHeader('x-cache')}`);
  }

  // Test 2: res.cache() with SWR
  console.log('\n\n⏱️  Test 2: res.cache() with Stale-While-Revalidate');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      // Cache with SWR
      res.cache(60, { swr: 300 }).json({ 
        data: 'fresh for 60s, stale for 5min' 
      });
    };

    console.log('\n[Request] GET /api/data');
    const req = new MockRequest('GET', '/api/data');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache-TTL: ${res.getHeader('x-cache-ttl')}`);
    console.log(`  X-Cache-SWR: ${res.getHeader('x-cache-swr')}`);
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
  }

  // Test 3: res.cache() with Encryption
  console.log('\n\n🔐 Test 3: res.cache() with Encryption');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      encryptionKey: 'test-key-32-chars-long-secret',
    });

    const handler = (req, res) => {
      // Cache with encryption
      res.cache(60, { encrypt: true }).json({ 
        secret: 'sensitive data',
        userId: 12345,
      });
    };

    console.log('\n[Request] GET /api/secure');
    const req = new MockRequest('GET', '/api/secure');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache-TTL: ${res.getHeader('x-cache-ttl')}`);
    console.log(`  X-Cache-Encrypt: ${res.getHeader('x-cache-encrypt')}`);
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
  }

  // Test 4: res.noCache()
  console.log('\n\n🚫 Test 4: res.noCache() - Disable Caching');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      // Explicitly disable caching
      res.noCache().json({ 
        data: 'never cached',
        timestamp: Date.now(),
      });
    };

    console.log('\n[Request] GET /api/realtime');
    const req = new MockRequest('GET', '/api/realtime');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
    console.log(`  Pragma: ${res.getHeader('pragma')}`);
    console.log(`  Expires: ${res.getHeader('expires')}`);
    console.log(`  X-Cache-Skip: ${res.getHeader('x-cache-skip')}`);
    console.log(`  X-Cache-Skip-Reason: ${res.getHeader('x-cache-skip-reason')}`);
  }

  // Test 5: res.cachePrivate()
  console.log('\n\n👤 Test 5: res.cachePrivate() - User-Specific Data');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      // Cache privately (browser only, not CDN)
      res.cachePrivate(120).json({ 
        user: 'John Doe',
        email: 'john@example.com',
      });
    };

    console.log('\n[Request] GET /api/profile');
    const req = new MockRequest('GET', '/api/profile');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache-TTL: ${res.getHeader('x-cache-ttl')}`);
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
    console.log('  Note: "private" means only browser caches, not CDN');
  }

  // Test 6: res.cacheImmutable()
  console.log('\n\n💎 Test 6: res.cacheImmutable() - Static Assets');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      // Cache immutable (never changes)
      res.cacheImmutable(31536000).json({ // 1 year
        version: '1.0.0',
        hash: 'abc123def456',
        content: 'static content',
      });
    };

    console.log('\n[Request] GET /api/static/v1.0.0');
    const req = new MockRequest('GET', '/api/static/v1.0.0');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache-TTL: ${res.getHeader('x-cache-ttl')}`);
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
    console.log('  Note: "immutable" means content will never change');
  }

  // Test 7: Chaining Helpers
  console.log('\n\n🔗 Test 7: Chaining Helpers');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      encryptionKey: 'test-key-32-chars-long-secret',
    });

    const handler = (req, res) => {
      // Chain multiple cache options
      res
        .cache(60, { swr: 300, encrypt: true })
        .json({ 
          data: 'cached, stale-while-revalidate, encrypted',
        });
    };

    console.log('\n[Request] GET /api/advanced');
    const req = new MockRequest('GET', '/api/advanced');
    const res = new MockResponse();
    await middleware(req, res, () => handler(req, res));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache-TTL: ${res.getHeader('x-cache-ttl')}`);
    console.log(`  X-Cache-SWR: ${res.getHeader('x-cache-swr')}`);
    console.log(`  X-Cache-Encrypt: ${res.getHeader('x-cache-encrypt')}`);
    console.log(`  Cache-Control: ${res.getHeader('cache-control')}`);
  }

  // Test 8: Conditional Caching
  console.log('\n\n🎯 Test 8: Conditional Caching Based on Data');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      const data = {
        status: 'success',
        cached: true,
        timestamp: Date.now(),
      };

      // Conditionally cache based on data
      if (data.status === 'success') {
        res.cache(60);
      } else {
        res.noCache();
      }

      res.json(data);
    };

    console.log('\n[Request 1] GET /api/conditional (success)');
    const req1 = new MockRequest('GET', '/api/conditional');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    console.log(`  Cache-Control: ${res1.getHeader('cache-control')}`);

    console.log('\n[Request 2] GET /api/conditional (error simulation)');
    const handler2 = (req, res) => {
      const data = { status: 'error', message: 'Something went wrong' };
      res.noCache().json(data);
    };
    const req2 = new MockRequest('GET', '/api/conditional');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler2(req2, res2));
    console.log(`  Cache-Control: ${res2.getHeader('cache-control')}`);
  }

  // Test 9: Real-World Examples
  console.log('\n\n🌍 Test 9: Real-World Usage Examples');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      encryptionKey: 'test-key-32-chars-long-secret',
    });

    // Example 1: Public API endpoint
    console.log('\n[Example 1] Public API - Long cache');
    const publicHandler = (req, res) => {
      res.cache(3600).json({ // 1 hour
        products: ['Product A', 'Product B'],
        lastUpdated: '2024-01-01',
      });
    };
    const req1 = new MockRequest('GET', '/api/products');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => publicHandler(req1, res1));
    console.log(`  Cache-Control: ${res1.getHeader('cache-control')}`);

    // Example 2: User profile - Private cache
    console.log('\n[Example 2] User Profile - Private cache');
    const profileHandler = (req, res) => {
      res.cachePrivate(300).json({ // 5 minutes
        name: 'John Doe',
        email: 'john@example.com',
      });
    };
    const req2 = new MockRequest('GET', '/api/profile');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => profileHandler(req2, res2));
    console.log(`  Cache-Control: ${res2.getHeader('cache-control')}`);

    // Example 3: Sensitive data - Encrypted cache
    console.log('\n[Example 3] Sensitive Data - Encrypted cache');
    const sensitiveHandler = (req, res) => {
      res.cache(60, { encrypt: true }).json({
        ssn: '***-**-1234',
        creditCard: '****-****-****-5678',
      });
    };
    const req3 = new MockRequest('GET', '/api/sensitive');
    const res3 = new MockResponse();
    await middleware(req3, res3, () => sensitiveHandler(req3, res3));
    console.log(`  Cache-Control: ${res3.getHeader('cache-control')}`);
    console.log(`  X-Cache-Encrypt: ${res3.getHeader('x-cache-encrypt')}`);

    // Example 4: Real-time data - No cache
    console.log('\n[Example 4] Real-time Data - No cache');
    const realtimeHandler = (req, res) => {
      res.noCache().json({
        price: 123.45,
        timestamp: Date.now(),
      });
    };
    const req4 = new MockRequest('GET', '/api/stock-price');
    const res4 = new MockResponse();
    await middleware(req4, res4, () => realtimeHandler(req4, res4));
    console.log(`  Cache-Control: ${res4.getHeader('cache-control')}`);

    // Example 5: Static assets - Immutable
    console.log('\n[Example 5] Static Assets - Immutable');
    const staticHandler = (req, res) => {
      res.cacheImmutable(31536000).json({ // 1 year
        version: '1.0.0',
        hash: 'abc123',
      });
    };
    const req5 = new MockRequest('GET', '/api/static/v1.0.0');
    const res5 = new MockResponse();
    await middleware(req5, res5, () => staticHandler(req5, res5));
    console.log(`  Cache-Control: ${res5.getHeader('cache-control')}`);

    // Example 6: News feed - SWR
    console.log('\n[Example 6] News Feed - Stale-While-Revalidate');
    const newsHandler = (req, res) => {
      res.cache(60, { swr: 300 }).json({ // Fresh 1min, stale 5min
        articles: ['Article 1', 'Article 2'],
        lastUpdated: Date.now(),
      });
    };
    const req6 = new MockRequest('GET', '/api/news');
    const res6 = new MockResponse();
    await middleware(req6, res6, () => newsHandler(req6, res6));
    console.log(`  Cache-Control: ${res6.getHeader('cache-control')}`);
    console.log(`  X-Cache-SWR: ${res6.getHeader('x-cache-swr')}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL CACHE HELPER TESTS COMPLETED');
  console.log('='.repeat(70));
  
  console.log('\n📚 Helper Methods Summary:');
  console.log('  • res.cache(ttl, { swr, encrypt }) - Cache with options');
  console.log('  • res.noCache() - Disable caching');
  console.log('  • res.cachePrivate(ttl) - Private cache (browser only)');
  console.log('  • res.cacheImmutable(ttl) - Immutable cache (never changes)');
  console.log('\n💡 Benefits:');
  console.log('  • Clean, readable API');
  console.log('  • Chainable methods');
  console.log('  • Standard Cache-Control headers');
  console.log('  • Internal X-Cache-* headers for control');
  console.log('  • No need to remember header names');
}

// Run tests
runTests().catch(console.error);
