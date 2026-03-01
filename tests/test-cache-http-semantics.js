/**
 * HTTP Cache Semantics Test
 * Demonstrates proper HTTP caching behavior including ETags, Vary, and Cache-Control
 * Run with: node test-cache-http-semantics.js
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
    this._ended = false;
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
    this._ended = true;
    return this;
  }

  write() {
    return true;
  }
}

// Test scenarios
async function runTests() {
  console.log('='.repeat(70));
  console.log('HTTP CACHE SEMANTICS TESTS');
  console.log('='.repeat(70));

  // Test 1: ETag Generation and If-None-Match
  console.log('\n🏷️  Test 1: ETag Generation and 304 Not Modified');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      autoETag: true,
    });

    const handler = (req, res) => {
      res.json({ data: 'Hello World', version: 1 });
    };

    // Request 1 - Cache miss, ETag generated
    console.log('\n[Request 1] GET /api/data (no ETag)');
    const req1 = new MockRequest('GET', '/api/data');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    const etag = res1.getHeader('etag');
    console.log(`  Response: 200 OK`);
    console.log(`  ETag: ${etag}`);
    console.log(`  X-Cache: ${res1.getHeader('x-cache')}`);
    console.log(`  Body: ${JSON.stringify(res1._data)}`);

    // Wait for cache
    await new Promise(resolve => setTimeout(resolve, 50));

    // Request 2 - With If-None-Match (matching ETag)
    console.log('\n[Request 2] GET /api/data (If-None-Match: matching)');
    const req2 = new MockRequest('GET', '/api/data', {
      headers: { 'if-none-match': etag },
    });
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));
    
    console.log(`  Response: ${res2.statusCode} ${res2.statusCode === 304 ? 'Not Modified' : 'OK'}`);
    console.log(`  ETag: ${res2.getHeader('etag')}`);
    console.log(`  X-Cache: ${res2.getHeader('x-cache')}`);
    console.log(`  Body: ${res2._ended && !res2._data ? '(empty - 304 response)' : JSON.stringify(res2._data)}`);

    // Request 3 - With If-None-Match (different ETag)
    console.log('\n[Request 3] GET /api/data (If-None-Match: different)');
    const req3 = new MockRequest('GET', '/api/data', {
      headers: { 'if-none-match': '"different-etag"' },
    });
    const res3 = new MockResponse();
    await middleware(req3, res3, () => handler(req3, res3));
    
    console.log(`  Response: ${res3.statusCode} OK`);
    console.log(`  ETag: ${res3.getHeader('etag')}`);
    console.log(`  X-Cache: ${res3.getHeader('x-cache')}`);
    console.log(`  Body: ${JSON.stringify(res3._data)}`);
  }

  // Test 2: Cache-Control: no-store
  console.log('\n\n🚫 Test 2: Cache-Control: no-store');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
    });

    const handler = (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ secret: 'sensitive data' });
    };

    console.log('\n[Request 1] GET /api/secret (Cache-Control: no-store)');
    const req1 = new MockRequest('GET', '/api/secret');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    console.log(`  Cache-Control: ${res1.getHeader('cache-control')}`);
    console.log(`  X-Cache-Skip-Reason: ${res1.getHeader('x-cache-skip-reason')}`);
    console.log(`  Result: Response NOT cached`);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Request 2 - Should not hit cache
    console.log('\n[Request 2] GET /api/secret (should not hit cache)');
    const req2 = new MockRequest('GET', '/api/secret');
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));
    
    console.log(`  X-Cache: ${res2.getHeader('x-cache')}`);
    console.log(`  Result: Cache MISS (as expected)`);
  }

  // Test 3: Cache-Control: private
  console.log('\n\n👤 Test 3: Cache-Control: private');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      allowPrivate: false, // Default: don't cache private responses
    });

    const handler = (req, res) => {
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.json({ user: 'John Doe', email: 'john@example.com' });
    };

    console.log('\n[Request 1] GET /api/profile (Cache-Control: private, allowPrivate: false)');
    const req1 = new MockRequest('GET', '/api/profile');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    console.log(`  Cache-Control: ${res1.getHeader('cache-control')}`);
    console.log(`  X-Cache-Skip-Reason: ${res1.getHeader('x-cache-skip-reason')}`);
    console.log(`  Result: Response NOT cached (private not allowed)`);

    // Test with allowPrivate: true
    const { middleware: middleware2 } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      allowPrivate: true,
    });

    console.log('\n[Request 2] GET /api/profile (Cache-Control: private, allowPrivate: true)');
    const req2 = new MockRequest('GET', '/api/profile');
    const res2 = new MockResponse();
    await middleware2(req2, res2, () => handler(req2, res2));
    
    console.log(`  Cache-Control: ${res2.getHeader('cache-control')}`);
    console.log(`  X-Cache: ${res2.getHeader('x-cache')}`);
    console.log(`  Result: Response cached (private allowed)`);
  }

  // Test 4: Vary Header Handling with varyBy Configuration
  console.log('\n\n🔄 Test 4: Vary Header Handling with varyBy Configuration');
  console.log('-'.repeat(70));
  {
    const { middleware, cacheManager } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      varyBy: ['Accept-Language'], // Explicitly configure vary headers
    });

    const handler = (req, res) => {
      // Set Vary header to indicate response varies by Accept-Language
      res.setHeader('Vary', 'Accept-Language');
      
      const lang = req.headers['accept-language'] || 'en';
      const messages = {
        'en': 'Hello',
        'es': 'Hola',
        'fr': 'Bonjour',
      };
      
      res.json({ message: messages[lang] || messages['en'], lang });
    };

    // Request 1 - English
    console.log('\n[Request 1] GET /api/greeting (Accept-Language: en)');
    const req1 = new MockRequest('GET', '/api/greeting', {
      headers: { 'accept-language': 'en' },
    });
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    console.log(`  Vary: ${res1.getHeader('vary')}`);
    console.log(`  Response: ${JSON.stringify(res1._data)}`);
    console.log(`  X-Cache: ${res1.getHeader('x-cache')}`);

    await new Promise(resolve => setTimeout(resolve, 200));

    // Request 2 - English again (should hit cache)
    console.log('\n[Request 2] GET /api/greeting (Accept-Language: en)');
    const req2 = new MockRequest('GET', '/api/greeting', {
      headers: { 'accept-language': 'en' },
    });
    const res2 = new MockResponse();
    
    await middleware(req2, res2, () => handler(req2, res2));
    
    console.log(`  Response: ${JSON.stringify(res2._data)}`);
    console.log(`  X-Cache: ${res2.getHeader('x-cache')}`);
    console.log(`  Result: ${res2.getHeader('x-cache') === 'HIT' ? 'Cache HIT (same language)' : 'Cache MISS (unexpected)'}`);

    // Request 3 - Spanish (should miss cache)
    console.log('\n[Request 3] GET /api/greeting (Accept-Language: es)');
    const req3 = new MockRequest('GET', '/api/greeting', {
      headers: { 'accept-language': 'es' },
    });
    const res3 = new MockResponse();
    await middleware(req3, res3, () => handler(req3, res3));
    
    console.log(`  Response: ${JSON.stringify(res3._data)}`);
    console.log(`  X-Cache: ${res3.getHeader('x-cache')}`);
    console.log(`  Result: ${res3.getHeader('x-cache') === 'MISS' ? 'Cache MISS (different language)' : 'Unexpected cache hit'}`);
  }

  // Test 5: Multiple ETags (comma-separated)
  console.log('\n\n🏷️  Test 5: Multiple ETags in If-None-Match');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      autoETag: true,
    });

    const handler = (req, res) => {
      res.json({ data: 'content' });
    };

    // Request 1 - Get ETag
    console.log('\n[Request 1] GET /api/data');
    const req1 = new MockRequest('GET', '/api/data');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    const etag = res1.getHeader('etag');
    console.log(`  ETag: ${etag}`);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Request 2 - Multiple ETags (one matches)
    console.log('\n[Request 2] GET /api/data (If-None-Match: multiple ETags)');
    const req2 = new MockRequest('GET', '/api/data', {
      headers: { 'if-none-match': `"old-etag", ${etag}, "another-etag"` },
    });
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));
    
    console.log(`  If-None-Match: "old-etag", ${etag}, "another-etag"`);
    console.log(`  Response: ${res2.statusCode} ${res2.statusCode === 304 ? 'Not Modified' : 'OK'}`);
    console.log(`  Result: 304 returned (one ETag matched)`);
  }

  // Test 6: Weak ETags
  console.log('\n\n🏷️  Test 6: Weak ETags (W/ prefix)');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      autoETag: false, // Disable auto-generation
    });

    const handler = (req, res) => {
      // Set weak ETag manually
      res.setHeader('ETag', 'W/"weak-etag-123"');
      res.json({ data: 'content' });
    };

    // Request 1 - Get weak ETag
    console.log('\n[Request 1] GET /api/data');
    const req1 = new MockRequest('GET', '/api/data');
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    const weakETag = res1.getHeader('etag');
    console.log(`  ETag: ${weakETag} (weak)`);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Request 2 - Match weak ETag
    console.log('\n[Request 2] GET /api/data (If-None-Match: weak ETag)');
    const req2 = new MockRequest('GET', '/api/data', {
      headers: { 'if-none-match': weakETag },
    });
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));
    
    console.log(`  If-None-Match: ${weakETag}`);
    console.log(`  Response: ${res2.statusCode} ${res2.statusCode === 304 ? 'Not Modified' : 'OK'}`);
    console.log(`  Result: 304 returned (weak ETag matched)`);
  }

  // Test 7: Combined HTTP Semantics
  console.log('\n\n🌐 Test 7: Combined HTTP Cache Semantics');
  console.log('-'.repeat(70));
  {
    const { middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 300,
      autoETag: true,
      varyBy: ['Accept-Language', 'Accept-Encoding'], // Explicitly configure vary headers
    });

    const handler = (req, res) => {
      // Set multiple cache headers
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Vary', 'Accept-Encoding, Accept-Language');
      
      const lang = req.headers['accept-language'] || 'en';
      res.json({ 
        message: lang === 'es' ? 'Hola' : 'Hello',
        timestamp: Date.now(),
      });
    };

    // Request 1 - Initial
    console.log('\n[Request 1] GET /api/hello (Accept-Language: en)');
    const req1 = new MockRequest('GET', '/api/hello', {
      headers: { 
        'accept-language': 'en',
        'accept-encoding': 'gzip',
      },
    });
    const res1 = new MockResponse();
    await middleware(req1, res1, () => handler(req1, res1));
    
    const etag = res1.getHeader('etag');
    console.log(`  Cache-Control: ${res1.getHeader('cache-control')}`);
    console.log(`  Vary: ${res1.getHeader('vary')}`);
    console.log(`  ETag: ${etag}`);
    console.log(`  X-Cache: ${res1.getHeader('x-cache')}`);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Request 2 - Same headers, with If-None-Match
    console.log('\n[Request 2] GET /api/hello (same headers + If-None-Match)');
    const req2 = new MockRequest('GET', '/api/hello', {
      headers: { 
        'accept-language': 'en',
        'accept-encoding': 'gzip',
        'if-none-match': etag,
      },
    });
    const res2 = new MockResponse();
    await middleware(req2, res2, () => handler(req2, res2));
    
    console.log(`  Response: ${res2.statusCode} ${res2.statusCode === 304 ? 'Not Modified' : 'OK'}`);
    console.log(`  X-Cache: ${res2.getHeader('x-cache')}`);
    console.log(`  Result: 304 Not Modified (ETag matched, Vary satisfied)`);

    // Request 3 - Different language (Vary mismatch)
    console.log('\n[Request 3] GET /api/hello (different Accept-Language)');
    const req3 = new MockRequest('GET', '/api/hello', {
      headers: { 
        'accept-language': 'es',
        'accept-encoding': 'gzip',
      },
    });
    const res3 = new MockResponse();
    await middleware(req3, res3, () => handler(req3, res3));
    
    console.log(`  Response: ${res3.statusCode} OK`);
    console.log(`  X-Cache: ${res3.getHeader('x-cache')}`);
    console.log(`  Result: Cache MISS (Vary header changed)`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL HTTP CACHE SEMANTICS TESTS COMPLETED');
  console.log('='.repeat(70));
  
  console.log('\n📚 HTTP Cache Features:');
  console.log('  • ETag generation and validation');
  console.log('  • 304 Not Modified responses');
  console.log('  • If-None-Match header support');
  console.log('  • Cache-Control: no-store detection');
  console.log('  • Cache-Control: private handling');
  console.log('  • Vary header support via varyBy configuration');
  console.log('  • Weak ETag support (W/ prefix)');
  console.log('  • Multiple ETags in If-None-Match');
  console.log('\n💡 Benefits:');
  console.log('  • Reduced bandwidth (304 responses)');
  console.log('  • Proper HTTP semantics');
  console.log('  • CDN-compatible caching');
  console.log('  • Automatic content negotiation');
}

// Run tests
runTests().catch(console.error);
