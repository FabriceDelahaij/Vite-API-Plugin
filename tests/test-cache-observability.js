/**
 * Cache Observability Test
 * Demonstrates observability hooks and enhanced debug headers
 * Run with: node test-cache-observability.js
 */

import { createCacheMiddleware } from './src/lib/cache.js';
import crypto from 'crypto';

// Mock Express-like request/response
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

// Metrics collector
class CacheMetrics {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
    this.errors = 0;
    this.hitsByKey = new Map();
    this.missByKey = new Map();
    this.evictionReasons = new Map();
    this.totalBytesSet = 0;
    this.avgTTL = 0;
    this.ttlSum = 0;
  }

  recordHit(key, metadata) {
    this.hits++;
    this.hitsByKey.set(key, (this.hitsByKey.get(key) || 0) + 1);
    console.log(`[HIT] ${key.slice(0, 30)}... (stale: ${metadata.stale}, age: ${Math.round(metadata.age / 1000)}s)`);
  }

  recordMiss(key) {
    this.misses++;
    this.missByKey.set(key, (this.missByKey.get(key) || 0) + 1);
    console.log(`[MISS] ${key.slice(0, 30)}...`);
  }

  recordSet(key, size, ttl, metadata) {
    this.sets++;
    this.totalBytesSet += size;
    this.ttlSum += ttl;
    this.avgTTL = this.ttlSum / this.sets;
    console.log(`[SET] ${key.slice(0, 30)}... (size: ${size}B, ttl: ${ttl}s, compressed: ${metadata.compressed}, encrypted: ${metadata.encrypted})`);
  }

  recordEvict(key, reason) {
    this.evictions++;
    this.evictionReasons.set(reason, (this.evictionReasons.get(reason) || 0) + 1);
    console.log(`[EVICT] ${key.slice(0, 30)}... (reason: ${reason})`);
  }

  recordError(error, operation, key) {
    this.errors++;
    console.error(`[ERROR] ${operation} on ${key?.slice(0, 30) || 'unknown'}... - ${error.message}`);
  }

  getStats() {
    const hitRate = this.hits + this.misses > 0 
      ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(2)
      : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      errors: this.errors,
      hitRate: `${hitRate}%`,
      totalBytesSet: this.totalBytesSet,
      avgTTL: Math.round(this.avgTTL),
      evictionReasons: Object.fromEntries(this.evictionReasons),
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
    this.errors = 0;
    this.hitsByKey.clear();
    this.missByKey.clear();
    this.evictionReasons.clear();
    this.totalBytesSet = 0;
    this.avgTTL = 0;
    this.ttlSum = 0;
  }
}

// Test scenarios
async function runTests() {
  console.log('='.repeat(70));
  console.log('CACHE OBSERVABILITY & DEBUGGING TESTS');
  console.log('='.repeat(70));

  // Test 1: Basic Observability Hooks
  console.log('\n📊 Test 1: Observability Hooks (Hit/Miss/Set/Evict)');
  console.log('-'.repeat(70));
  {
    const metrics = new CacheMetrics();

    const { cacheManager, middleware } = createCacheMiddleware({
      type: 'memory',
      maxSize: 3,
      defaultTTL: 60,
      onHit: (key, metadata) => metrics.recordHit(key, metadata),
      onMiss: (key) => metrics.recordMiss(key),
      onSet: (key, size, ttl, metadata) => metrics.recordSet(key, size, ttl, metadata),
      onEvict: (key, reason) => metrics.recordEvict(key, reason),
      onError: (error, operation, key) => metrics.recordError(error, operation, key),
    });

    const handler = (route) => async (req, res) => {
      res.json({ route, timestamp: Date.now() });
    };

    // Request 1 - Cache miss
    console.log('\n[Request 1] GET /api/data');
    const req1 = new MockRequest('GET', '/api/data');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler('/api/data')(req1, res1));
    await new Promise(resolve => setTimeout(resolve, 50)); // Wait for cache set

    // Request 2 - Cache hit
    console.log('\n[Request 2] GET /api/data');
    const req2 = new MockRequest('GET', '/api/data');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler('/api/data')(req2, res2));

    // Fill cache to trigger eviction
    console.log('\n[Filling cache to trigger eviction]');
    await cacheManager.set('key1', { data: 'value1' });
    await cacheManager.set('key2', { data: 'value2' });
    await cacheManager.set('key3', { data: 'value3' });
    await cacheManager.set('key4', { data: 'value4' }); // Should evict oldest

    console.log('\n[Metrics Summary]');
    console.log(JSON.stringify(metrics.getStats(), null, 2));
  }

  // Test 2: Enhanced Response Headers
  console.log('\n\n🏷️  Test 2: Enhanced Response Headers');
  console.log('-'.repeat(70));
  {
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      encryptionKey,
      encryptByDefault: true,
      compressionThreshold: 100,
    });

    const handler = async (req, res) => {
      res.json({ data: 'x'.repeat(200), timestamp: Date.now() });
    };

    // First request - cache miss
    console.log('\n[Request 1] GET /api/secure');
    const req1 = new MockRequest('GET', '/api/secure');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache: ${res1.getHeader('x-cache')}`);
    console.log(`  X-Cache-Store: ${res1.getHeader('x-cache-store')}`);
    console.log(`  X-Cache-Key: ${res1.getHeader('x-cache-key')?.slice(0, 40)}...`);
    console.log(`  X-Cache-Encrypted: ${res1.getHeader('x-cache-encrypted')}`);
    console.log(`  X-Cache-TTL: ${res1.getHeader('x-cache-ttl')}`);

    // Wait for cache to be set
    await new Promise(resolve => setTimeout(resolve, 50));

    // Second request - cache hit
    console.log('\n[Request 2] GET /api/secure');
    const req2 = new MockRequest('GET', '/api/secure');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));

    console.log('\n[Response Headers]');
    console.log(`  X-Cache: ${res2.getHeader('x-cache')}`);
    console.log(`  X-Cache-Store: ${res2.getHeader('x-cache-store')}`);
    console.log(`  X-Cache-Key: ${res2.getHeader('x-cache-key')?.slice(0, 40)}...`);
    console.log(`  X-Cache-Encrypted: ${res2.getHeader('x-cache-encrypted')}`);
  }

  // Test 3: Prometheus-style Metrics
  console.log('\n\n📈 Test 3: Prometheus-style Metrics Export');
  console.log('-'.repeat(70));
  {
    const metrics = new CacheMetrics();

    const { cacheManager } = createCacheMiddleware({
      type: 'memory',
      maxSize: 100,
      defaultTTL: 60,
      onHit: (key, metadata) => metrics.recordHit(key, metadata),
      onMiss: (key) => metrics.recordMiss(key),
      onSet: (key, size, ttl, metadata) => metrics.recordSet(key, size, ttl, metadata),
      onEvict: (key, reason) => metrics.recordEvict(key, reason),
    });

    // Simulate traffic
    console.log('\n[Simulating traffic...]');
    for (let i = 0; i < 10; i++) {
      const key = `key${i % 3}`; // 3 unique keys, repeated
      const cached = await cacheManager.get(key);
      if (!cached) {
        await cacheManager.set(key, { data: `value${i}` }, 60);
      }
    }

    // Export Prometheus-style metrics
    console.log('\n[Prometheus Metrics]');
    const stats = metrics.getStats();
    console.log(`# HELP cache_hits_total Total number of cache hits`);
    console.log(`# TYPE cache_hits_total counter`);
    console.log(`cache_hits_total ${stats.hits}`);
    console.log();
    console.log(`# HELP cache_misses_total Total number of cache misses`);
    console.log(`# TYPE cache_misses_total counter`);
    console.log(`cache_misses_total ${stats.misses}`);
    console.log();
    console.log(`# HELP cache_hit_rate Cache hit rate percentage`);
    console.log(`# TYPE cache_hit_rate gauge`);
    console.log(`cache_hit_rate ${parseFloat(stats.hitRate)}`);
    console.log();
    console.log(`# HELP cache_sets_total Total number of cache sets`);
    console.log(`# TYPE cache_sets_total counter`);
    console.log(`cache_sets_total ${stats.sets}`);
    console.log();
    console.log(`# HELP cache_evictions_total Total number of cache evictions`);
    console.log(`# TYPE cache_evictions_total counter`);
    console.log(`cache_evictions_total ${stats.evictions}`);
    console.log();
    console.log(`# HELP cache_bytes_set_total Total bytes set in cache`);
    console.log(`# TYPE cache_bytes_set_total counter`);
    console.log(`cache_bytes_set_total ${stats.totalBytesSet}`);
    console.log();
    console.log(`# HELP cache_avg_ttl_seconds Average TTL in seconds`);
    console.log(`# TYPE cache_avg_ttl_seconds gauge`);
    console.log(`cache_avg_ttl_seconds ${stats.avgTTL}`);
  }

  // Test 4: Error Tracking
  console.log('\n\n❌ Test 4: Error Tracking');
  console.log('-'.repeat(70));
  {
    const metrics = new CacheMetrics();

    const { cacheManager } = createCacheMiddleware({
      type: 'memory',
      encryptionKey: crypto.randomBytes(32).toString('hex'),
      onError: (error, operation, key) => metrics.recordError(error, operation, key),
    });

    console.log('\n[Simulating decryption error with wrong key]');
    
    // Set with one key
    await cacheManager.set('encrypted-key', { secret: 'data' }, 60, { encrypt: true });
    
    // Rotate to a new key (old data becomes unreadable after grace period)
    const newKey = crypto.randomBytes(32).toString('hex');
    cacheManager.rotateEncryptionKey(newKey);
    
    // Try to read (should work with previous key)
    const result = await cacheManager.get('encrypted-key');
    console.log(`[Result] ${result ? 'Success (previous key worked)' : 'Failed'}`);
    
    console.log(`\n[Total Errors] ${metrics.errors}`);
  }

  // Test 5: Real-time Monitoring Dashboard
  console.log('\n\n📺 Test 5: Real-time Monitoring Dashboard');
  console.log('-'.repeat(70));
  {
    const metrics = new CacheMetrics();

    const { cacheManager } = createCacheMiddleware({
      type: 'memory',
      maxSize: 5,
      defaultTTL: 60,
      compressionThreshold: 100,
      onHit: (key, metadata) => metrics.recordHit(key, metadata),
      onMiss: (key) => metrics.recordMiss(key),
      onSet: (key, size, ttl, metadata) => metrics.recordSet(key, size, ttl, metadata),
      onEvict: (key, reason) => metrics.recordEvict(key, reason),
    });

    console.log('\n[Simulating 20 requests...]');
    for (let i = 0; i < 20; i++) {
      const key = `request-${i % 5}`;
      const cached = await cacheManager.get(key);
      if (!cached) {
        const data = { id: i, data: 'x'.repeat(i * 10) };
        await cacheManager.set(key, data, 60);
      }
      
      // Print dashboard every 5 requests
      if ((i + 1) % 5 === 0) {
        const stats = metrics.getStats();
        const cacheStats = await cacheManager.getStats();
        console.log(`\n[Dashboard @ Request ${i + 1}]`);
        console.log(`  Hit Rate: ${stats.hitRate}`);
        console.log(`  Hits: ${stats.hits} | Misses: ${stats.misses}`);
        console.log(`  Cache Size: ${cacheStats.size}/${cacheStats.maxSize}`);
        console.log(`  Total Bytes: ${stats.totalBytesSet}B`);
        console.log(`  Evictions: ${stats.evictions}`);
      }
    }

    console.log('\n[Final Metrics]');
    console.log(JSON.stringify(metrics.getStats(), null, 2));
  }

  // Test 6: OpenTelemetry Integration Example
  console.log('\n\n🔭 Test 6: OpenTelemetry Integration Pattern');
  console.log('-'.repeat(70));
  {
    // Simulate OpenTelemetry spans
    const spans = [];
    
    const createSpan = (name, attributes) => {
      const span = {
        name,
        startTime: Date.now(),
        attributes,
        events: [],
      };
      spans.push(span);
      return {
        addEvent: (event) => span.events.push({ time: Date.now(), ...event }),
        end: () => { span.endTime = Date.now(); span.duration = span.endTime - span.startTime; },
      };
    };

    const { cacheManager } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 60,
      onHit: (key, metadata) => {
        const span = createSpan('cache.hit', {
          'cache.key': key,
          'cache.stale': metadata.stale,
          'cache.age': metadata.age,
        });
        span.end();
      },
      onMiss: (key) => {
        const span = createSpan('cache.miss', {
          'cache.key': key,
        });
        span.end();
      },
      onSet: (key, size, ttl, metadata) => {
        const span = createSpan('cache.set', {
          'cache.key': key,
          'cache.size': size,
          'cache.ttl': ttl,
          'cache.compressed': metadata.compressed,
          'cache.encrypted': metadata.encrypted,
        });
        span.end();
      },
    });

    console.log('\n[Simulating requests with OpenTelemetry tracing...]');
    await cacheManager.set('user:123', { name: 'John' }, 60);
    await cacheManager.get('user:123');
    await cacheManager.get('user:456'); // miss

    console.log('\n[OpenTelemetry Spans]');
    spans.forEach(span => {
      console.log(`\n  Span: ${span.name}`);
      console.log(`    Duration: ${span.duration}ms`);
      console.log(`    Attributes:`, span.attributes);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL OBSERVABILITY TESTS COMPLETED');
  console.log('='.repeat(70));
}

// Run tests
runTests().catch(console.error);
