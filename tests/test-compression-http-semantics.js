/**
 * Test HTTP Semantics Improvements for Compression Middleware
 * 
 * Tests:
 * 1. HEAD request handling (no compression)
 * 2. Status code handling (204, 304, 1xx)
 * 3. Cache-Control awareness (no-store, private)
 * 4. Zstd negotiation safety
 * 5. Brotli HTTPS preference
 */

import { CompressionManager, createCompressionMiddleware, COMPRESSION_PRESETS } from './src/lib/compression.js';

// Mock request/response helpers
function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/api/test',
    protocol: options.protocol || 'http',
    secure: options.secure || false,
    headers: {
      'accept-encoding': options.acceptEncoding || 'gzip, deflate, br',
      ...options.headers,
    },
  };
}

function createMockResponse() {
  const headers = {};
  let statusCode = 200;
  let ended = false;
  let sentData = null;
  
  return {
    statusCode,
    headersSent: false,
    getHeader: (name) => headers[name.toLowerCase()],
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    removeHeader: (name) => { delete headers[name.toLowerCase()]; },
    json: function(data) {
      sentData = data;
      ended = true;
      return this;
    },
    send: function(data) {
      sentData = data;
      ended = true;
      return this;
    },
    end: function(data) {
      if (data) sentData = data;
      ended = true;
      return this;
    },
    write: function() { return true; },
    on: function() { return this; },
    _getState: () => ({ headers, statusCode, ended, sentData }),
    _setStatusCode: (code) => { statusCode = code; },
  };
}

// Test 1: HEAD Request Handling
async function testHeadRequest() {
  console.log('\n📋 Test 1: HEAD Request Handling');
  console.log('-'.repeat(60));
  
  const { compressionManager, middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockRequest({ method: 'HEAD' });
  const res = createMockResponse();
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  const stats = compressionManager.getStats();
  
  console.log('✓ HEAD request processed');
  console.log('  Next called:', nextCalled);
  console.log('  Uncompressed count:', stats.uncompressed);
  console.log('  Total requests:', stats.totalRequests);
  
  if (nextCalled && stats.uncompressed === 1) {
    console.log('✅ PASS: HEAD request skipped compression');
  } else {
    console.log('❌ FAIL: HEAD request not handled correctly');
  }
}

// Test 2: Status Code Handling
async function testStatusCodes() {
  console.log('\n📋 Test 2: Status Code Handling (204, 304, 1xx)');
  console.log('-'.repeat(60));
  
  const statusCodes = [
    { code: 204, name: 'No Content' },
    { code: 304, name: 'Not Modified' },
    { code: 100, name: 'Continue' },
    { code: 101, name: 'Switching Protocols' },
  ];
  
  for (const { code, name } of statusCodes) {
    const { compressionManager, middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
    
    const req = createMockRequest();
    const res = createMockResponse();
    res._setStatusCode(code);
    
    await middleware(req, res, () => {});
    
    // Trigger compression attempt
    await res.json({ message: 'test' });
    
    const state = res._getState();
    const stats = compressionManager.getStats();
    
    console.log(`\n  Status ${code} (${name}):`);
    console.log('    Uncompressed:', stats.uncompressed);
    console.log('    Content-Encoding:', state.headers['content-encoding'] || 'none');
    
    if (stats.uncompressed > 0 && !state.headers['content-encoding']) {
      console.log(`    ✅ PASS: ${code} skipped compression`);
    } else {
      console.log(`    ❌ FAIL: ${code} should skip compression`);
    }
  }
}

// Test 3: Cache-Control Awareness
async function testCacheControlAwareness() {
  console.log('\n📋 Test 3: Cache-Control Awareness');
  console.log('-'.repeat(60));
  
  const scenarios = [
    { cacheControl: 'no-store', shouldCache: false },
    { cacheControl: 'private', shouldCache: false },
    { cacheControl: 'public, max-age=3600', shouldCache: true },
    { cacheControl: null, shouldCache: true },
  ];
  
  for (const { cacheControl, shouldCache } of scenarios) {
    const { compressionManager, middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
    
    const req = createMockRequest();
    const res = createMockResponse();
    
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }
    
    await middleware(req, res, () => {});
    
    // Trigger compression
    const testData = { message: 'x'.repeat(2000) }; // Large enough to compress
    await res.json(testData);
    
    const stats = compressionManager.getStats();
    
    console.log(`\n  Cache-Control: ${cacheControl || 'none'}`);
    console.log('    Response cache size:', stats.responseCacheSize);
    console.log('    Should cache:', shouldCache);
    
    if ((stats.responseCacheSize > 0) === shouldCache) {
      console.log('    ✅ PASS: Cache behavior correct');
    } else {
      console.log('    ❌ FAIL: Cache behavior incorrect');
    }
  }
  
  // Test Authorization header
  console.log('\n  With Authorization header:');
  const { compressionManager, middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockRequest({
    headers: { authorization: 'Bearer token123' },
  });
  const res = createMockResponse();
  
  await middleware(req, res, () => {});
  await res.json({ message: 'x'.repeat(2000) });
  
  const stats = compressionManager.getStats();
  console.log('    Response cache size:', stats.responseCacheSize);
  
  if (stats.responseCacheSize === 0) {
    console.log('    ✅ PASS: Authorization header prevents caching');
  } else {
    console.log('    ❌ FAIL: Should not cache with Authorization header');
  }
}

// Test 4: Zstd Negotiation Safety
async function testZstdNegotiation() {
  console.log('\n📋 Test 4: Zstd Negotiation Safety');
  console.log('-'.repeat(60));
  
  const manager = new CompressionManager({
    algorithms: ['zstd', 'br', 'gzip', 'deflate'],
    zstdLevel: 3,
  });
  
  // Scenario 1: Browser without zstd support
  console.log('\n  Scenario 1: Browser (no zstd in Accept-Encoding)');
  const req1 = createMockRequest({ acceptEncoding: 'gzip, deflate, br' });
  const algorithm1 = manager.selectAlgorithm(req1.headers['accept-encoding']);
  const validated1 = manager._validateAlgorithm(algorithm1, req1);
  
  console.log('    Selected:', algorithm1);
  console.log('    Validated:', validated1);
  console.log('    Expected: br or gzip (not zstd)');
  
  if (validated1 !== 'zstd') {
    console.log('    ✅ PASS: Zstd not used without explicit support');
  } else {
    console.log('    ❌ FAIL: Should not use zstd');
  }
  
  // Scenario 2: Client with explicit zstd support
  console.log('\n  Scenario 2: Client with zstd in Accept-Encoding');
  const req2 = createMockRequest({ acceptEncoding: 'zstd, gzip, deflate' });
  const algorithm2 = manager.selectAlgorithm(req2.headers['accept-encoding']);
  const validated2 = manager._validateAlgorithm(algorithm2, req2);
  
  console.log('    Selected:', algorithm2);
  console.log('    Validated:', validated2);
  
  if (validated2 === 'zstd') {
    console.log('    ✅ PASS: Zstd used when explicitly supported');
  } else {
    console.log('    ❌ FAIL: Should use zstd when advertised');
  }
  
  // Scenario 3: Internal client without zstd in Accept-Encoding
  console.log('\n  Scenario 3: Internal client (X-Internal-Client header)');
  const req3 = createMockRequest({
    acceptEncoding: 'gzip, deflate',
    headers: { 'x-internal-client': 'true' },
  });
  const algorithm3 = manager.selectAlgorithm(req3.headers['accept-encoding']);
  const validated3 = manager._validateAlgorithm(algorithm3, req3);
  
  console.log('    Selected:', algorithm3);
  console.log('    Validated:', validated3);
  
  if (validated3 === 'zstd' || validated3 === 'gzip') {
    console.log('    ✅ PASS: Internal client can use zstd or fallback');
  } else {
    console.log('    ⚠️  INFO: Fallback to other algorithm');
  }
}

// Test 5: Brotli HTTPS Preference
async function testBrotliHttpsPreference() {
  console.log('\n📋 Test 5: Brotli HTTPS Preference');
  console.log('-'.repeat(60));
  
  const manager = new CompressionManager({
    algorithms: ['br', 'gzip', 'deflate'],
    level: 6,
  });
  
  // Scenario 1: HTTP request (should fallback from Brotli)
  console.log('\n  Scenario 1: HTTP request');
  const req1 = createMockRequest({
    protocol: 'http',
    secure: false,
    acceptEncoding: 'br, gzip, deflate',
  });
  const algorithm1 = manager.selectAlgorithm(req1.headers['accept-encoding']);
  const validated1 = manager._validateAlgorithm(algorithm1, req1);
  
  console.log('    Selected:', algorithm1);
  console.log('    Validated:', validated1);
  console.log('    Protocol:', req1.protocol);
  
  if (validated1 !== 'br') {
    console.log('    ✅ PASS: Brotli avoided over HTTP');
  } else {
    console.log('    ❌ FAIL: Should not use Brotli over HTTP');
  }
  
  // Scenario 2: HTTPS request (should use Brotli)
  console.log('\n  Scenario 2: HTTPS request');
  const req2 = createMockRequest({
    protocol: 'https',
    secure: true,
    acceptEncoding: 'br, gzip, deflate',
  });
  const algorithm2 = manager.selectAlgorithm(req2.headers['accept-encoding']);
  const validated2 = manager._validateAlgorithm(algorithm2, req2);
  
  console.log('    Selected:', algorithm2);
  console.log('    Validated:', validated2);
  console.log('    Protocol:', req2.protocol);
  
  if (validated2 === 'br') {
    console.log('    ✅ PASS: Brotli used over HTTPS');
  } else {
    console.log('    ❌ FAIL: Should use Brotli over HTTPS');
  }
  
  // Scenario 3: HTTP with X-Forwarded-Proto: https
  console.log('\n  Scenario 3: HTTP with X-Forwarded-Proto: https');
  const req3 = createMockRequest({
    protocol: 'http',
    secure: false,
    acceptEncoding: 'br, gzip, deflate',
    headers: { 'x-forwarded-proto': 'https' },
  });
  const algorithm3 = manager.selectAlgorithm(req3.headers['accept-encoding']);
  const validated3 = manager._validateAlgorithm(algorithm3, req3);
  
  console.log('    Selected:', algorithm3);
  console.log('    Validated:', validated3);
  console.log('    X-Forwarded-Proto:', req3.headers['x-forwarded-proto']);
  
  if (validated3 === 'br') {
    console.log('    ✅ PASS: Brotli used with X-Forwarded-Proto: https');
  } else {
    console.log('    ❌ FAIL: Should use Brotli when behind HTTPS proxy');
  }
}

// Run all tests
(async () => {
  console.log('\n🧪 HTTP Semantics Compression Tests');
  console.log('='.repeat(60));
  
  try {
    await testHeadRequest();
    await testStatusCodes();
    await testCacheControlAwareness();
    await testZstdNegotiation();
    await testBrotliHttpsPreference();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
})();
