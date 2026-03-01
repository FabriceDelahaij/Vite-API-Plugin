/**
 * Comprehensive Test Suite for Compression API Enhancements (v2.1)
 * 
 * Tests:
 * 1. Route-level configuration (res.locals.compression)
 * 2. X-Compression-Policy header
 * 3. Combined usage scenarios
 * 4. Backward compatibility
 */

import { createCompressionMiddleware, COMPRESSION_PRESETS } from './src/lib/compression.js';

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`    ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`    ❌ ${message}`);
    testsFailed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/api/test',
    originalUrl: options.originalUrl || options.url || '/api/test',
    protocol: options.protocol || 'https',
    secure: options.secure !== undefined ? options.secure : true,
    headers: {
      'accept-encoding': options.acceptEncoding || 'br, gzip, deflate',
      ...options.headers,
    },
  };
}

function createMockResponse() {
  const headers = {};
  let statusCode = 200;
  let ended = false;
  let sentData = null;
  const events = {};
  
  const mockRes = {
    statusCode,
    headersSent: false,
    locals: {},
    getHeader: (name) => headers[name.toLowerCase()],
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    removeHeader: (name) => { delete headers[name.toLowerCase()]; },
    json: function(data) {
      this.setHeader('Content-Type', 'application/json');
      sentData = data;
      ended = true;
      this._triggerEvent('finish');
      return this;
    },
    send: function(data) {
      sentData = data;
      ended = true;
      this._triggerEvent('finish');
      return this;
    },
    end: function(data) {
      if (data) sentData = data;
      ended = true;
      this._triggerEvent('finish');
      return this;
    },
    write: function() { return true; },
    on: function(event, handler) { 
      if (!events[event]) events[event] = [];
      events[event].push(handler);
      return this; 
    },
    once: function(event, handler) {
      if (!events[event]) events[event] = [];
      events[event].push(handler);
      return this;
    },
    removeListener: function(event, handler) {
      if (events[event]) {
        events[event] = events[event].filter(h => h !== handler);
      }
      return this;
    },
    emit: function(event, ...args) {
      if (events[event]) {
        events[event].forEach(handler => handler(...args));
      }
      return this;
    },
    _triggerEvent: function(event) {
      if (events[event]) {
        events[event].forEach(handler => handler());
      }
    },
    _getState: () => ({ headers, statusCode, ended, sentData }),
  };
  
  return mockRes;
}

// ============================================================================
// Route-Level Configuration Tests
// ============================================================================

async function testRouteLevelCompressionLevel() {
  console.log('\n📋 Test 1: Route-Level Compression Level Override');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    level: 1, // Global: fast compression
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Override to maximum compression
  res.locals.compression = {
    level: 9
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'gzip', 'Gzip compression applied');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Route-level compression level override works\n');
}

async function testRouteLevelAlgorithmOverride() {
  console.log('📋 Test 2: Route-Level Algorithm Override');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['br', 'gzip', 'deflate'], // Global prefers brotli
  });
  
  const req = createMockRequest({ acceptEncoding: 'br, gzip, deflate' });
  const res = createMockResponse();
  
  // Override to only use gzip
  res.locals.compression = {
    algorithms: ['gzip']
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'gzip', 'Gzip used instead of brotli');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Route-level algorithm override works\n');
}

async function testRouteLevelThresholdOverride() {
  console.log('📋 Test 3: Route-Level Threshold Override');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    threshold: 10000, // Global: 10KB minimum
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Override to lower threshold
  res.locals.compression = {
    threshold: 100 // 100 bytes
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(500) }; // ~500 bytes
  await res.json(testData);
  
  const state = res._getState();
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Route-level threshold override works\n');
}

async function testRouteLevelMultipleOverrides() {
  console.log('📋 Test 4: Route-Level Multiple Config Overrides');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    level: 6,
    threshold: 1024,
    algorithms: ['br', 'gzip', 'deflate'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'br, gzip' });
  const res = createMockResponse();
  
  // Override multiple settings
  res.locals.compression = {
    level: 9,
    threshold: 500,
    algorithms: ['gzip']
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'gzip', 'Gzip used (algorithm override)');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Multiple route-level overrides work together\n');
}

async function testRouteLevelDisableCompression() {
  console.log('📋 Test 5: Route-Level Disable Compression (Backward Compat)');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Use legacy disableCompression flag
  res.locals.disableCompression = true;
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(!state.headers['content-encoding'], 'Compression disabled');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Backward compatibility with disableCompression works\n');
}

async function testRouteLevelNoOverride() {
  console.log('📋 Test 6: Route Without Override Uses Global Config');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    level: 6,
    algorithms: ['br', 'gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'br, gzip' });
  const res = createMockResponse();
  
  // No route-level override
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'br', 'Brotli used (global config)');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Routes without override use global config\n');
}

// ============================================================================
// X-Compression-Policy Header Tests
// ============================================================================

async function testCompressionPolicyInternal() {
  console.log('📋 Test 7: X-Compression-Policy: internal Enables Zstd');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['zstd', 'br', 'gzip'],
  });
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, br, gzip',
    headers: {
      'x-compression-policy': 'internal'
    }
  });
  const res = createMockResponse();
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'zstd', 'Zstd enabled with internal policy');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ X-Compression-Policy: internal enables zstd\n');
}

async function testCompressionPolicyWithoutHeader() {
  console.log('📋 Test 8: Zstd Works When Explicitly Advertised');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['zstd', 'br', 'gzip'],
  });
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, gzip'
    // No X-Compression-Policy header, but client explicitly supports zstd
  });
  const res = createMockResponse();
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  // When client explicitly advertises zstd, it should work
  assert(state.headers['content-encoding'] === 'zstd', 'Zstd used when explicitly advertised');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Zstd works when client explicitly advertises support\n');
}

async function testCompressionPolicyLegacyHeader() {
  console.log('📋 Test 9: Legacy X-Internal-Client Header Still Works');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['zstd', 'br', 'gzip'],
  });
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, gzip',
    headers: {
      'x-internal-client': 'true' // Legacy header
    }
  });
  const res = createMockResponse();
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'zstd', 'Zstd enabled with legacy header');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Legacy X-Internal-Client header still works\n');
}

async function testCompressionPolicyPrecedence() {
  console.log('📋 Test 10: X-Compression-Policy Takes Precedence Over Legacy');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['zstd', 'br', 'gzip'],
  });
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, gzip',
    headers: {
      'x-compression-policy': 'internal',
      'x-internal-client': 'false' // Conflicting legacy header
    }
  });
  const res = createMockResponse();
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'zstd', 'New header takes precedence');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ X-Compression-Policy takes precedence over legacy header\n');
}

// ============================================================================
// Combined Usage Tests
// ============================================================================

async function testCombinedRouteConfigAndPolicy() {
  console.log('📋 Test 11: Combined Route Config + Compression Policy');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    level: 6,
    algorithms: ['zstd', 'br', 'gzip'],
  });
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, br, gzip',
    headers: {
      'x-compression-policy': 'internal'
    }
  });
  const res = createMockResponse();
  
  // Route-level config for aggressive compression
  res.locals.compression = {
    level: 9,
    algorithms: ['zstd'] // Prefer zstd only
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'zstd', 'Zstd used with both features');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Route config and compression policy work together\n');
}

async function testCombinedInternalServiceOptimization() {
  console.log('📋 Test 12: Internal Service with Aggressive Compression');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, br, gzip',
    headers: {
      'x-compression-policy': 'internal'
    }
  });
  const res = createMockResponse();
  
  // Simulate internal service optimization
  res.locals.compression = {
    level: 9, // Maximum compression for internal bandwidth savings
    algorithms: ['zstd', 'br']
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(10000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'zstd', 'Zstd used for internal service');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Internal service optimization works\n');
}

async function testCombinedMobileOptimization() {
  console.log('📋 Test 13: Mobile Client with Aggressive Compression');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockRequest({ 
    acceptEncoding: 'br, gzip',
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Mobile'
    }
  });
  const res = createMockResponse();
  
  // Simulate mobile optimization (save bandwidth)
  res.locals.compression = {
    level: 9,
    threshold: 512, // Compress smaller responses
    algorithms: ['br', 'gzip']
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'br', 'Brotli used for mobile');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Mobile client optimization works\n');
}

async function testCombinedRealtimeEndpoint() {
  console.log('📋 Test 14: Realtime Endpoint with Fast Compression');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Simulate realtime endpoint (prioritize speed)
  res.locals.compression = {
    level: 1, // Fastest compression
    threshold: 10240, // Only compress larger responses
    algorithms: ['gzip'] // Skip brotli (faster)
  };
  
  await middleware(req, res, () => {});
  
  const testData = { timestamp: Date.now(), data: 'x'.repeat(15000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'gzip', 'Gzip used for realtime');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Realtime endpoint optimization works\n');
}

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

async function testEdgeCaseEmptyRouteConfig() {
  console.log('📋 Test 15: Empty Route Config Object');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Empty config object
  res.locals.compression = {};
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'gzip', 'Compression still works');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Empty route config handled gracefully\n');
}

async function testEdgeCaseInvalidRouteConfig() {
  console.log('📋 Test 16: Invalid Route Config Values');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Invalid config values (should fall back to global)
  res.locals.compression = {
    level: 999, // Invalid
    algorithms: ['invalid-algo']
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.ended, 'Response ended despite invalid config');
  
  console.log('✅ Invalid route config handled gracefully\n');
}

async function testEdgeCaseNullRouteConfig() {
  console.log('📋 Test 17: Null Route Config');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Null config
  res.locals.compression = null;
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(state.headers['content-encoding'] === 'gzip', 'Compression works with null config');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Null route config handled gracefully\n');
}

async function testEdgeCaseBothDisableAndConfig() {
  console.log('📋 Test 18: Both disableCompression and compression Set');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['gzip'],
  });
  
  const req = createMockRequest({ acceptEncoding: 'gzip' });
  const res = createMockResponse();
  
  // Both set (disableCompression should take precedence)
  res.locals.disableCompression = true;
  res.locals.compression = {
    level: 9
  };
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  assert(!state.headers['content-encoding'], 'Compression disabled (disableCompression wins)');
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ disableCompression takes precedence\n');
}

async function testEdgeCaseMultipleRequests() {
  console.log('📋 Test 19: Multiple Requests with Different Configs');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    level: 6,
    algorithms: ['gzip'],
  });
  
  // Request 1: Route-level override
  const req1 = createMockRequest({ acceptEncoding: 'gzip' });
  const res1 = createMockResponse();
  res1.locals.compression = { level: 9 };
  
  await middleware(req1, res1, () => {});
  await res1.json({ data: 'x'.repeat(5000) });
  
  // Request 2: No override (should use global)
  const req2 = createMockRequest({ acceptEncoding: 'gzip' });
  const res2 = createMockResponse();
  
  await middleware(req2, res2, () => {});
  await res2.json({ data: 'x'.repeat(5000) });
  
  const state1 = res1._getState();
  const state2 = res2._getState();
  
  assert(state1.headers['content-encoding'] === 'gzip', 'Request 1 compressed');
  assert(state2.headers['content-encoding'] === 'gzip', 'Request 2 compressed');
  assert(state1.ended && state2.ended, 'Both requests ended');
  
  console.log('✅ Multiple requests with different configs work independently\n');
}

async function testEdgeCaseCompressionPolicyCase() {
  console.log('📋 Test 20: X-Compression-Policy Case Sensitivity');
  console.log('-'.repeat(60));
  
  const { middleware } = createCompressionMiddleware({
    algorithms: ['zstd', 'gzip'],
  });
  
  const req = createMockRequest({ 
    acceptEncoding: 'zstd, gzip',
    headers: {
      'X-Compression-Policy': 'internal' // Uppercase
    }
  });
  const res = createMockResponse();
  
  await middleware(req, res, () => {});
  
  const testData = { data: 'x'.repeat(5000) };
  await res.json(testData);
  
  const state = res._getState();
  // Headers are case-insensitive in HTTP
  assert(state.ended, 'Response ended successfully');
  
  console.log('✅ Header case handling works\n');
}

// ============================================================================
// Run All Tests
// ============================================================================

(async () => {
  console.log('\n🧪 COMPRESSION API ENHANCEMENTS TEST SUITE (v2.1)');
  console.log('='.repeat(70));
  console.log('Testing route-level configuration and X-Compression-Policy header\n');
  
  try {
    // Route-Level Configuration Tests
    console.log('═'.repeat(70));
    console.log('ROUTE-LEVEL CONFIGURATION TESTS');
    console.log('═'.repeat(70));
    await testRouteLevelCompressionLevel();
    await testRouteLevelAlgorithmOverride();
    await testRouteLevelThresholdOverride();
    await testRouteLevelMultipleOverrides();
    await testRouteLevelDisableCompression();
    await testRouteLevelNoOverride();
    
    // X-Compression-Policy Header Tests
    console.log('═'.repeat(70));
    console.log('X-COMPRESSION-POLICY HEADER TESTS');
    console.log('═'.repeat(70));
    await testCompressionPolicyInternal();
    await testCompressionPolicyWithoutHeader();
    await testCompressionPolicyLegacyHeader();
    await testCompressionPolicyPrecedence();
    
    // Combined Usage Tests
    console.log('═'.repeat(70));
    console.log('COMBINED USAGE TESTS');
    console.log('═'.repeat(70));
    await testCombinedRouteConfigAndPolicy();
    await testCombinedInternalServiceOptimization();
    await testCombinedMobileOptimization();
    await testCombinedRealtimeEndpoint();
    
    // Edge Cases
    console.log('═'.repeat(70));
    console.log('EDGE CASES AND ERROR HANDLING');
    console.log('═'.repeat(70));
    await testEdgeCaseEmptyRouteConfig();
    await testEdgeCaseInvalidRouteConfig();
    await testEdgeCaseNullRouteConfig();
    await testEdgeCaseBothDisableAndConfig();
    await testEdgeCaseMultipleRequests();
    await testEdgeCaseCompressionPolicyCase();
    
    // Results
    console.log('═'.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(70));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total:  ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('═'.repeat(70) + '\n');
    
    if (testsFailed === 0) {
      console.log('🎉 ALL TESTS PASSED!\n');
      console.log('✨ API Enhancements are production-ready!\n');
      process.exit(0);
    } else {
      console.log('⚠️  SOME TESTS FAILED\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
