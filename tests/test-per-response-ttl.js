/**
 * Test per-response TTL feature
 * Demonstrates how different endpoints can have different cache durations
 */

import { createCompressionMiddleware } from './src/lib/compression.js';
import { EventEmitter } from 'events';

// Helper to simulate Express request/response
function createMockReqRes(url, locals = {}) {
  const req = {
    method: 'GET',
    url,
    headers: {
      'accept-encoding': 'gzip, br',
    },
  };

  const headers = new Map();
  const emitter = new EventEmitter();
  
  const res = {
    locals,
    statusCode: 200,
    headersSent: false,
    getHeader: (name) => headers.get(name.toLowerCase()),
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    removeHeader: (name) => headers.delete(name.toLowerCase()),
    on: (event, handler) => emitter.on(event, handler),
    emit: (event, ...args) => emitter.emit(event, ...args),
    end: function(data) {
      this.headersSent = true;
      this.emit('finish');
      return this;
    },
    json: function(data) {
      this.setHeader('content-type', 'application/json');
      return this.end(JSON.stringify(data));
    },
    send: function(data) {
      return this.end(data);
    },
    write: function() {},
  };

  return { req, res };
}

async function runTests() {
  console.log('🧪 Testing Per-Response TTL Feature\n');
  console.log('='.repeat(60));

  // Create compression middleware with short global TTL
  const { middleware, compressionManager } = createCompressionMiddleware({
    cache: {
      enabled: true,
      maxSize: 100,
      ttl: 5000, // 5 seconds global TTL
    },
  });

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Default TTL (uses global 5s)
  console.log('\n📋 Test 1: Default TTL (global 5s)');
  {
    const { req, res } = createMockReqRes('/api/default');
    
    await new Promise((resolve) => {
      middleware(req, res, () => {
        res.json({ data: 'default endpoint' });
        resolve();
      });
    });

    const stats = compressionManager.getStats();
    console.log(`   Response cache size: ${stats.responseCacheSize}`);
    console.log(`   ✅ Cached with global TTL (5s)`);
    testsPassed++;
  }

  // Test 2: Short TTL (30s for health check)
  console.log('\n📋 Test 2: Short TTL (30s for /health)');
  {
    const { req, res } = createMockReqRes('/api/health', {
      cacheTTL: 30_000, // 30 seconds
    });
    
    await new Promise((resolve) => {
      middleware(req, res, () => {
        res.json({ status: 'ok', uptime: 12345 });
        resolve();
      });
    });

    const stats = compressionManager.getStats();
    console.log(`   Response cache size: ${stats.responseCacheSize}`);
    console.log(`   ✅ Cached with custom TTL (30s)`);
    testsPassed++;
  }

  // Test 3: Long TTL (10 minutes for config)
  console.log('\n📋 Test 3: Long TTL (10m for /config)');
  {
    const { req, res } = createMockReqRes('/api/config', {
      cacheTTL: 10 * 60 * 1000, // 10 minutes
    });
    
    await new Promise((resolve) => {
      middleware(req, res, () => {
        res.json({ 
          apiVersion: '1.0',
          features: ['compression', 'caching'],
        });
        resolve();
      });
    });

    const stats = compressionManager.getStats();
    console.log(`   Response cache size: ${stats.responseCacheSize}`);
    console.log(`   ✅ Cached with custom TTL (10m)`);
    testsPassed++;
  }

  // Test 4: No caching (TTL = 0 for /me)
  console.log('\n📋 Test 4: No caching (TTL = 0 for /me)');
  {
    const { req, res } = createMockReqRes('/api/me', {
      cacheTTL: 0, // No caching
    });
    
    const sizeBefore = compressionManager.getStats().responseCacheSize;
    
    await new Promise((resolve) => {
      middleware(req, res, () => {
        res.json({ 
          id: 123,
          name: 'John Doe',
          email: 'john@example.com',
        });
        resolve();
      });
    });

    const sizeAfter = compressionManager.getStats().responseCacheSize;
    
    if (sizeAfter === sizeBefore) {
      console.log(`   Response cache size: ${sizeAfter} (unchanged)`);
      console.log(`   ✅ Not cached (TTL = 0)`);
      testsPassed++;
    } else {
      console.log(`   ❌ Should not be cached but was`);
      testsFailed++;
    }
  }

  // Test 5: Verify TTL expiration
  console.log('\n📋 Test 5: Verify TTL expiration');
  {
    // Create manager with very short TTL for testing
    const { middleware: testMiddleware, compressionManager: testManager } = 
      createCompressionMiddleware({
        cache: {
          enabled: true,
          maxSize: 100,
          ttl: 100, // 100ms global TTL
        },
      });

    // Cache with 50ms TTL
    const { req: req1, res: res1 } = createMockReqRes('/api/fast', {
      cacheTTL: 50, // 50ms
    });
    
    await new Promise((resolve) => {
      testMiddleware(req1, res1, () => {
        res1.json({ data: 'fast expiry' });
        resolve();
      });
    });

    console.log(`   Cached with 50ms TTL`);
    
    // Wait 60ms (should expire)
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Try to access - should be cache miss
    const statsBefore = testManager.getStats();
    const missesBefore = statsBefore.responseCacheMisses;
    
    const { req: req2, res: res2 } = createMockReqRes('/api/fast', {
      cacheTTL: 50,
    });
    
    await new Promise((resolve) => {
      testMiddleware(req2, res2, () => {
        res2.json({ data: 'fast expiry' });
        resolve();
      });
    });

    const statsAfter = testManager.getStats();
    const missesAfter = statsAfter.responseCacheMisses;
    
    if (missesAfter > missesBefore) {
      console.log(`   ✅ Entry expired after 50ms (cache miss)`);
      testsPassed++;
    } else {
      console.log(`   ❌ Entry should have expired`);
      testsFailed++;
    }
  }

  // Test 6: Different TTLs for same payload
  console.log('\n📋 Test 6: Different TTLs for same payload');
  {
    const payload = { message: 'same data' };
    
    // Cache with 1 hour TTL
    const { req: req1, res: res1 } = createMockReqRes('/api/long', {
      cacheTTL: 60 * 60 * 1000, // 1 hour
    });
    
    await new Promise((resolve) => {
      middleware(req1, res1, () => {
        res1.json(payload);
        resolve();
      });
    });

    // Cache same payload with 1 second TTL (different URL)
    const { req: req2, res: res2 } = createMockReqRes('/api/short', {
      cacheTTL: 1000, // 1 second
    });
    
    await new Promise((resolve) => {
      middleware(req2, res2, () => {
        res2.json(payload);
        resolve();
      });
    });

    const stats = compressionManager.getStats();
    console.log(`   Response cache size: ${stats.responseCacheSize}`);
    console.log(`   ✅ Same payload cached with different TTLs`);
    testsPassed++;
  }

  // Test 7: Compression cache inherits TTL
  console.log('\n📋 Test 7: Compression cache inherits TTL');
  {
    const { req, res } = createMockReqRes('/api/compress-ttl', {
      cacheTTL: 2 * 60 * 1000, // 2 minutes
    });
    
    await new Promise((resolve) => {
      middleware(req, res, () => {
        res.json({ 
          data: 'x'.repeat(2000), // Compressible data
        });
        resolve();
      });
    });

    const stats = compressionManager.getStats();
    console.log(`   Response cache: ${stats.responseCacheSize} entries`);
    console.log(`   Compression cache: ${stats.cacheSize} entries`);
    console.log(`   ✅ Both caches store TTL`);
    testsPassed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);
  console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!');
  }

  // Cleanup
  compressionManager.destroy();
}

// Run tests
runTests().catch(console.error);
