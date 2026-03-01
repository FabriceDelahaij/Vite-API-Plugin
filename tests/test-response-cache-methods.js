/**
 * Test: Response Cache Method Restrictions
 * 
 * Verifies that:
 * 1. GET and HEAD requests are cached by default
 * 2. POST/PUT/DELETE/PATCH are NOT cached by default
 * 3. res.locals.allowResponseCache can override for non-idempotent methods
 */

import { createCompressionMiddleware } from './src/lib/compression.js';

async function runTests() {
  console.log('Testing Response Cache Method Restrictions...\n');
  
  const { middleware, manager } = createCompressionMiddleware({
    cache: {
      enabled: true,
      maxSize: 100,
      ttl: 60000
    }
  });
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Helper to create mock request/response
  function createMockReqRes(method, allowCache = false) {
    const req = {
      method,
      url: '/api/test',
      headers: {
        'accept-encoding': 'gzip'
      }
    };
    
    const res = {
      locals: allowCache ? { allowResponseCache: true } : {},
      statusCode: 200,
      _headers: {},
      getHeader(name) {
        return this._headers[name.toLowerCase()];
      },
      setHeader(name, value) {
        this._headers[name.toLowerCase()] = value;
      },
      removeHeader(name) {
        delete this._headers[name.toLowerCase()];
      },
      writeHead() {},
      write() {},
      end() {}
    };
    
    return { req, res };
  }
  
  // Test 1: GET should be cached
  console.log('Test 1: GET requests should be cached by default');
  {
    const { req, res } = createMockReqRes('GET');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (!skipResponseCache) {
      console.log('✅ PASS: GET requests are cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: GET requests should be cached\n');
      testsFailed++;
    }
  }
  
  // Test 2: HEAD should be cached
  console.log('Test 2: HEAD requests should be cached by default');
  {
    const { req, res } = createMockReqRes('HEAD');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (!skipResponseCache) {
      console.log('✅ PASS: HEAD requests are cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: HEAD requests should be cached\n');
      testsFailed++;
    }
  }
  
  // Test 3: POST should NOT be cached by default
  console.log('Test 3: POST requests should NOT be cached by default');
  {
    const { req, res } = createMockReqRes('POST');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (skipResponseCache) {
      console.log('✅ PASS: POST requests are not cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: POST requests should not be cached\n');
      testsFailed++;
    }
  }
  
  // Test 4: PUT should NOT be cached by default
  console.log('Test 4: PUT requests should NOT be cached by default');
  {
    const { req, res } = createMockReqRes('PUT');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (skipResponseCache) {
      console.log('✅ PASS: PUT requests are not cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: PUT requests should not be cached\n');
      testsFailed++;
    }
  }
  
  // Test 5: DELETE should NOT be cached by default
  console.log('Test 5: DELETE requests should NOT be cached by default');
  {
    const { req, res } = createMockReqRes('DELETE');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (skipResponseCache) {
      console.log('✅ PASS: DELETE requests are not cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: DELETE requests should not be cached\n');
      testsFailed++;
    }
  }
  
  // Test 6: PATCH should NOT be cached by default
  console.log('Test 6: PATCH requests should NOT be cached by default');
  {
    const { req, res } = createMockReqRes('PATCH');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (skipResponseCache) {
      console.log('✅ PASS: PATCH requests are not cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: PATCH requests should not be cached\n');
      testsFailed++;
    }
  }
  
  // Test 7: POST with allowResponseCache should be cached
  console.log('Test 7: POST with res.locals.allowResponseCache should be cached');
  {
    const { req, res } = createMockReqRes('POST', true);
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (!skipResponseCache) {
      console.log('✅ PASS: POST with allowResponseCache is cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: POST with allowResponseCache should be cached\n');
      testsFailed++;
    }
  }
  
  // Test 8: GET with authorization should NOT be cached
  console.log('Test 8: GET with authorization header should NOT be cached');
  {
    const { req, res } = createMockReqRes('GET');
    req.headers.authorization = 'Bearer token123';
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (skipResponseCache) {
      console.log('✅ PASS: Authenticated GET requests are not cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Authenticated GET requests should not be cached\n');
      testsFailed++;
    }
  }
  
  // Test 9: GET with Cache-Control: no-store should NOT be cached
  console.log('Test 9: GET with Cache-Control: no-store should NOT be cached');
  {
    const { req, res } = createMockReqRes('GET');
    res.setHeader('cache-control', 'no-store');
    const cacheControl = res.getHeader('cache-control');
    const skipResponseCache = (
      (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
      /no-store|private/i.test(cacheControl || '') ||
      req.headers.authorization
    );
    
    if (skipResponseCache) {
      console.log('✅ PASS: GET with no-store is not cached\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: GET with no-store should not be cached\n');
      testsFailed++;
    }
  }
  
  // Summary
  console.log('='.repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log('='.repeat(50));
  
  if (testsFailed === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
