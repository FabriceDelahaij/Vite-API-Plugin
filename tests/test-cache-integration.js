/**
 * Cache Integration Test
 * Demonstrates real-world cache usage with Express-like server
 * Run with: node test-cache-integration.js
 */

import { createCacheMiddleware } from './src/lib/cache.js';
import crypto from 'crypto';

// Simulate Express-like request/response
class MockRequest {
  constructor(method, url, options = {}) {
    this.method = method;
    this.url = url;
    this.originalUrl = url;
    this.query = options.query || {};
    this.body = options.body || {};
    this.headers = options.headers || {};
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
    console.log(`[Response] Status: ${this.statusCode}, Cache: ${this.getHeader('x-cache') || 'N/A'}`);
    if (this.getHeader('x-cache-status')) {
      console.log(`[Response] Cache Status: ${this.getHeader('x-cache-status')}`);
    }
    console.log(`[Response] Data:`, data);
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
  console.log('='.repeat(60));
  console.log('CACHE INTEGRATION TESTS');
  console.log('='.repeat(60));

  // Test 1: Basic caching
  console.log('\n📦 Test 1: Basic Memory Caching');
  console.log('-'.repeat(60));
  {
    const { cacheManager, middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 5,
      maxSize: 100,
    });

    const handler = async (req, res) => {
      res.json({ message: 'Hello World', timestamp: Date.now() });
    };

    // First request - cache miss
    console.log('\n[Request 1] GET /api/hello');
    const req1 = new MockRequest('GET', '/api/hello');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));

    // Second request - cache hit
    console.log('\n[Request 2] GET /api/hello');
    const req2 = new MockRequest('GET', '/api/hello');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));

    const stats = await cacheManager.getStats();
    console.log('\n[Stats]', {
      size: stats.size,
      type: stats.type,
      entries: stats.entries.length,
    });
  }

  // Test 2: Compression
  console.log('\n\n🗜️  Test 2: Compression (Gzip vs Zstd)');
  console.log('-'.repeat(60));
  {
    const largeData = { data: 'x'.repeat(5000), items: Array(100).fill({ id: 1, name: 'test' }) };

    // Gzip compression
    const { cacheManager: gzipCache } = createCacheMiddleware({
      type: 'memory',
      compressionThreshold: 1024,
      compressionAlgorithm: 'gzip',
    });

    await gzipCache.set('large-data', largeData);
    const gzipStats = await gzipCache.getStats();
    const gzipEntry = gzipStats.entries[0];

    console.log('\n[Gzip]', {
      compressed: gzipEntry.compressed,
      size: gzipEntry.size,
      algorithm: gzipEntry.compressionAlgorithm,
    });

    // Zstd compression
    const { cacheManager: zstdCache } = createCacheMiddleware({
      type: 'memory',
      compressionThreshold: 1024,
      compressionAlgorithm: 'zstd',
      zstdLevel: 3,
    });

    await zstdCache.set('large-data', largeData);
    const zstdStats = await zstdCache.getStats();
    const zstdEntry = zstdStats.entries[0];

    console.log('[Zstd]', {
      compressed: zstdEntry.compressed,
      size: zstdEntry.size,
      algorithm: zstdEntry.compressionAlgorithm,
    });

    console.log(`\n[Comparison] Zstd is ${((1 - zstdEntry.size / gzipEntry.size) * 100).toFixed(1)}% smaller than Gzip`);
  }

  // Test 3: Encryption
  console.log('\n\n🔐 Test 3: Encryption with Key Rotation');
  console.log('-'.repeat(60));
  {
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const { cacheManager } = createCacheMiddleware({
      type: 'memory',
      encryptionKey,
      encryptByDefault: true,
    });

    const sensitiveData = { 
      userId: 12345, 
      email: 'user@example.com',
      token: 'secret-token-xyz',
    };

    console.log('\n[Storing] Sensitive data with encryption');
    await cacheManager.set('user-session', sensitiveData);

    const result = await cacheManager.get('user-session');
    console.log('[Retrieved]', result.value);

    const stats = await cacheManager.getStats();
    console.log('[Encrypted]', stats.entries[0].encrypted);

    // Key rotation
    console.log('\n[Rotating] Encryption key');
    const newKey = crypto.randomBytes(32).toString('hex');
    cacheManager.rotateEncryptionKey(newKey);

    const status = cacheManager.getEncryptionStatus();
    console.log('[Key Status]', {
      hasActiveKey: status.hasActiveKey,
      previousKeyCount: status.previousKeyCount,
    });

    // Old data still readable
    const oldData = await cacheManager.get('user-session');
    console.log('[Old Data Still Readable]', oldData.value.userId === 12345);

    // New data uses new key
    await cacheManager.set('new-session', { userId: 67890 });
    const newData = await cacheManager.get('new-session');
    console.log('[New Data]', newData.value);
  }

  // Test 4: Stale-While-Revalidate
  console.log('\n\n⏱️  Test 4: Stale-While-Revalidate');
  console.log('-'.repeat(60));
  {
    const { cacheManager, middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 2, // 2 seconds fresh
      staleWhileRevalidate: 5, // 5 seconds stale
    });

    let requestCount = 0;
    const handler = async (req, res) => {
      requestCount++;
      res.json({ 
        message: 'Dynamic data',
        requestNumber: requestCount,
        timestamp: Date.now(),
      });
    };

    // First request
    console.log('\n[Request 1] Fresh data');
    const req1 = new MockRequest('GET', '/api/data');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));

    // Wait 2.5 seconds (past fresh TTL, within stale period)
    console.log('\n[Waiting] 2.5 seconds for data to become stale...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Second request - should serve stale
    console.log('\n[Request 2] Should serve stale data');
    const req2 = new MockRequest('GET', '/api/data');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));

    console.log(`\n[Handler Called] ${requestCount} times (should be 1 - stale served without calling handler)`);
  }

  // Test 5: Per-Route TTL
  console.log('\n\n⚙️  Test 5: Per-Route TTL Configuration');
  console.log('-'.repeat(60));
  {
    const { cacheManager, middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 60,
      shouldCache: (req, res, data) => {
        if (req.url.includes('/api/static')) {
          return { cache: true, ttl: 3600 }; // 1 hour
        }
        if (req.url.includes('/api/dynamic')) {
          return { cache: true, ttl: 10 }; // 10 seconds
        }
        return false; // Don't cache
      },
    });

    const handler = (route, ttl) => async (req, res) => {
      res.json({ route, ttl, timestamp: Date.now() });
    };

    // Static route - long TTL
    console.log('\n[Request] GET /api/static (TTL: 3600s)');
    const req1 = new MockRequest('GET', '/api/static');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler('/api/static', 3600)(req1, res1));

    // Dynamic route - short TTL
    console.log('\n[Request] GET /api/dynamic (TTL: 10s)');
    const req2 = new MockRequest('GET', '/api/dynamic');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler('/api/dynamic', 10)(req2, res2));

    const stats = await cacheManager.getStats();
    console.log('\n[Cache Stats]', {
      totalEntries: stats.size,
      entries: stats.entries.map(e => ({
        key: e.key.slice(0, 20) + '...',
        expiresIn: Math.round(e.expiresIn / 1000) + 's',
      })),
    });
  }

  // Test 6: Skip Conditions
  console.log('\n\n🚫 Test 6: Skip Conditions (Range, SSE, Chunked)');
  console.log('-'.repeat(60));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 60,
    });

    // Range request
    console.log('\n[Request] GET /api/video (Range header)');
    const req1 = new MockRequest('GET', '/api/video', {
      headers: { range: 'bytes=0-1023' },
    });
    const res1 = new MockResponse();
    await middleware(req1, res1, () => {
      res1.json({ data: 'video chunk' });
    });

    // Server-Sent Events
    console.log('\n[Request] GET /api/events (SSE)');
    const req2 = new MockRequest('GET', '/api/events');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => {
      res2.setHeader('Content-Type', 'text/event-stream');
      res2.json({ data: 'event' });
    });

    // Chunked encoding
    console.log('\n[Request] GET /api/stream (Chunked)');
    const req3 = new MockRequest('GET', '/api/stream');
    const res3 = new MockResponse();
    await middleware(req3, res3, () => {
      res3.setHeader('Transfer-Encoding', 'chunked');
      res3.json({ data: 'stream' });
    });
  }

  // Test 7: X-Cache-TTL Header
  console.log('\n\n🏷️  Test 7: X-Cache-TTL Header Override');
  console.log('-'.repeat(60));
  {
    const { cacheManager, middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300, // 5 minutes default
    });

    const handler = async (req, res) => {
      // Override TTL per response
      if (req.url.includes('short')) {
        res.setHeader('X-Cache-TTL', '10'); // 10 seconds
      } else if (req.url.includes('long')) {
        res.setHeader('X-Cache-TTL', '3600'); // 1 hour
      }
      res.json({ url: req.url, timestamp: Date.now() });
    };

    console.log('\n[Request] GET /api/short (X-Cache-TTL: 10)');
    const req1 = new MockRequest('GET', '/api/short');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));

    console.log('\n[Request] GET /api/long (X-Cache-TTL: 3600)');
    const req2 = new MockRequest('GET', '/api/long');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));

    const stats = await cacheManager.getStats();
    console.log('\n[Cache Entries]');
    stats.entries.forEach(e => {
      console.log(`  - ${e.key.slice(0, 30)}... expires in ${Math.round(e.expiresIn / 1000)}s`);
    });
  }

  // Test 8: LRU Eviction
  console.log('\n\n♻️  Test 8: LRU Eviction');
  console.log('-'.repeat(60));
  {
    const { cacheManager } = createCacheMiddleware({
      type: 'memory',
      maxSize: 3, // Only 3 entries
      defaultTTL: 60,
    });

    console.log('\n[Adding] 3 entries to fill cache');
    await cacheManager.set('key1', { data: 'value1' });
    await cacheManager.set('key2', { data: 'value2' });
    await cacheManager.set('key3', { data: 'value3' });

    console.log('[Cache Full] Size:', (await cacheManager.getStats()).size);

    // Access key1 to make it recently used
    console.log('\n[Accessing] key1 to update LRU');
    await cacheManager.get('key1');

    // Add new entry - should evict key2 (least recently used)
    console.log('[Adding] key4 (should evict key2)');
    await cacheManager.set('key4', { data: 'value4' });

    console.log('\n[Checking] Which keys remain:');
    console.log('  key1:', await cacheManager.has('key1') ? '✓ exists' : '✗ evicted');
    console.log('  key2:', await cacheManager.has('key2') ? '✓ exists' : '✗ evicted');
    console.log('  key3:', await cacheManager.has('key3') ? '✓ exists' : '✗ evicted');
    console.log('  key4:', await cacheManager.has('key4') ? '✓ exists' : '✗ evicted');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS COMPLETED');
  console.log('='.repeat(60));
}

// Run tests
runTests().catch(console.error);
