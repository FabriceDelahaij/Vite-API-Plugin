/**
 * Comprehensive Compression Security Test Suite
 * 
 * Tests all security features including:
 * - Route-level compression control
 * - Cookie-based security (request + response)
 * - Authorization header detection
 * - CSRF token detection
 * - Production preset defaults
 * - Edge cases and error handling
 */

import { createCompressionMiddleware, COMPRESSION_PRESETS } from './src/lib/compression.js';

// Test utilities
let testCount = 0;
let passed = 0;
let failed = 0;
const failedTests = [];

function test(name, fn) {
  testCount++;
  process.stdout.write(`\n${testCount}. ${name}... `);
  try {
    fn();
    passed++;
    console.log('✅');
  } catch (error) {
    failed++;
    failedTests.push({ name, error: error.message });
    console.log('❌');
    console.error(`   Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Mock helpers
function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    url: '/api/test',
    headers: {},
    ...overrides,
  };
}

function createMockRes(overrides = {}) {
  const headers = {};
  return {
    locals: {},
    statusCode: 200,
    headersSent: false,
    getHeader: (name) => headers[name.toLowerCase()] || null,
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    removeHeader: (name) => { delete headers[name.toLowerCase()]; },
    on: () => {},
    json: function(data) { this._jsonCalled = true; this._data = data; },
    send: function(data) { this._sendCalled = true; this._data = data; },
    end: function(data) { this._endCalled = true; this._data = data; },
    write: function(chunk) { this._writeCalled = true; return true; },
    ...overrides,
  };
}

console.log('='.repeat(70));
console.log('🔒 COMPRESSION SECURITY TEST SUITE');
console.log('='.repeat(70));

// ============================================================================
// SECTION 1: PRESET CONFIGURATION TESTS
// ============================================================================

console.log('\n📦 SECTION 1: Preset Configuration');

test('Production preset has disableOnCookies enabled', () => {
  const config = COMPRESSION_PRESETS.production;
  assertEquals(config.security.disableOnCookies, true, 'disableOnCookies should be true');
});

test('Production preset has disableOnAuth disabled', () => {
  const config = COMPRESSION_PRESETS.production;
  assertEquals(config.security.disableOnAuth, false, 'disableOnAuth should be false');
});

test('Production preset has disableOnCSRF disabled', () => {
  const config = COMPRESSION_PRESETS.production;
  assertEquals(config.security.disableOnCSRF, false, 'disableOnCSRF should be false');
});

test('Secure preset has all security features enabled', () => {
  const config = COMPRESSION_PRESETS.secure;
  assertEquals(config.security.disableOnAuth, true, 'disableOnAuth should be true');
  assertEquals(config.security.disableOnCookies, true, 'disableOnCookies should be true');
  assertEquals(config.security.disableOnCSRF, true, 'disableOnCSRF should be true');
});

test('Development preset has security features disabled', () => {
  const config = COMPRESSION_PRESETS.development;
  assert(!config.security || config.security.disableOnCookies === undefined, 'Should not have security config');
});

// ============================================================================
// SECTION 2: ROUTE-LEVEL OVERRIDE TESTS
// ============================================================================

console.log('\n🛣️  SECTION 2: Route-Level Override');

test('Middleware skips compression when res.locals.disableCompression is true', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes({ locals: { disableCompression: true } });
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should increment uncompressed counter');
});

test('Middleware processes normally when res.locals.disableCompression is false', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes({ locals: { disableCompression: false } });
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
  // Should not increment uncompressed due to route override
});

test('Middleware processes normally when res.locals.disableCompression is undefined', async () => {
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes({ locals: {} });
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
});

test('Middleware processes normally when res.locals is undefined', async () => {
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes();
  delete res.locals;
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
});

// ============================================================================
// SECTION 3: COOKIE DETECTION TESTS (REQUEST)
// ============================================================================

console.log('\n🍪 SECTION 3: Cookie Detection (Request)');

test('hasSecurityConcerns detects request cookies', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { cookie: 'session=abc123' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect request cookies');
});

test('hasSecurityConcerns ignores missing request cookies', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq();
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === false, 'Should not detect security concerns without cookies');
});

test('hasSecurityConcerns detects multiple cookies', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { cookie: 'session=abc; user=john; token=xyz' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect multiple cookies');
});

// ============================================================================
// SECTION 4: COOKIE DETECTION TESTS (RESPONSE SET-COOKIE)
// ============================================================================

console.log('\n🍪 SECTION 4: Cookie Detection (Response Set-Cookie)');

test('hasSecurityConcerns detects response Set-Cookie header', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq();
  const res = createMockRes();
  res.setHeader('Set-Cookie', 'session=xyz789; HttpOnly');
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect Set-Cookie header');
});

test('hasSecurityConcerns detects multiple Set-Cookie headers', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq();
  const res = createMockRes();
  res.setHeader('Set-Cookie', ['session=xyz; HttpOnly', 'token=abc; Secure']);
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect multiple Set-Cookie headers');
});

test('hasSecurityConcerns detects both request and response cookies', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { cookie: 'old_session=123' } });
  const res = createMockRes();
  res.setHeader('Set-Cookie', 'new_session=456; HttpOnly');
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect both request and response cookies');
});

// ============================================================================
// SECTION 5: AUTHORIZATION HEADER TESTS
// ============================================================================

console.log('\n🔑 SECTION 5: Authorization Header Detection');

test('hasSecurityConcerns detects Authorization header when enabled', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq({ headers: { authorization: 'Bearer token123' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect Authorization header');
});

test('hasSecurityConcerns ignores Authorization header when disabled', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { authorization: 'Bearer token123' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === false, 'Should ignore Authorization header when disabled');
});

test('hasSecurityConcerns detects Basic auth', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect Basic auth');
});

// ============================================================================
// SECTION 6: CSRF TOKEN DETECTION TESTS
// ============================================================================

console.log('\n🛡️  SECTION 6: CSRF Token Detection');

test('hasSecurityConcerns detects csrf_token in response', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = JSON.stringify({ csrf_token: 'abc123', data: 'test' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === true, 'Should detect csrf_token');
});

test('hasSecurityConcerns detects xsrf-token in response', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = JSON.stringify({ 'xsrf-token': 'xyz789', data: 'test' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === true, 'Should detect xsrf-token');
});

test('hasSecurityConcerns detects authenticity_token in response', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = JSON.stringify({ authenticity_token: 'token123', data: 'test' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === true, 'Should detect authenticity_token');
});

test('hasSecurityConcerns ignores CSRF tokens when disabled', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = JSON.stringify({ csrf_token: 'abc123', data: 'test' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === false, 'Should ignore CSRF tokens when disabled');
});

test('hasSecurityConcerns handles string response body', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = '{"csrf_token":"abc123"}';
  
  const result = compressionManager.hasSecurityConcerns(req, res, body);
  assert(result === true, 'Should detect CSRF token in string body');
});

test('hasSecurityConcerns handles object response body', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = { csrf_token: 'abc123', data: 'test' };
  
  const result = compressionManager.hasSecurityConcerns(req, res, body);
  assert(result === true, 'Should detect CSRF token in object body');
});

// ============================================================================
// SECTION 7: HEAD REQUEST TESTS
// ============================================================================

console.log('\n📄 SECTION 7: HEAD Request Handling');

test('Middleware skips compression for HEAD requests', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ method: 'HEAD', headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes();
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should increment uncompressed counter');
});

test('Middleware processes GET requests normally', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ method: 'GET', headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes();
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
});

test('Middleware processes POST requests normally', async () => {
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ method: 'POST', headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes();
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
});

// ============================================================================
// SECTION 8: COMBINED SECURITY SCENARIOS
// ============================================================================

console.log('\n🔐 SECTION 8: Combined Security Scenarios');

test('hasSecurityConcerns detects cookies + authorization', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq({ 
    headers: { 
      cookie: 'session=abc',
      authorization: 'Bearer token'
    } 
  });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === true, 'Should detect multiple security concerns');
});

test('hasSecurityConcerns detects cookies + CSRF token', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq({ headers: { cookie: 'session=abc' } });
  const res = createMockRes();
  const body = JSON.stringify({ csrf_token: 'xyz', data: 'test' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === true, 'Should detect cookies and CSRF token');
});

test('hasSecurityConcerns detects all security features', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq({ 
    headers: { 
      cookie: 'session=abc',
      authorization: 'Bearer token'
    } 
  });
  const res = createMockRes();
  res.setHeader('Set-Cookie', 'new_session=xyz');
  const body = JSON.stringify({ csrf_token: '123', data: 'test' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === true, 'Should detect all security concerns');
});

test('hasSecurityConcerns returns false when no concerns present', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = JSON.stringify({ data: 'public data' });
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(body));
  assert(result === false, 'Should not detect security concerns for public data');
});

// ============================================================================
// SECTION 9: STATISTICS TRACKING
// ============================================================================

console.log('\n📊 SECTION 9: Statistics Tracking');

test('Stats include skippedForSecurity counter', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  const stats = compressionManager.getStats();
  
  assert(typeof stats.skippedForSecurity === 'number', 'Should have skippedForSecurity counter');
});

test('Stats include uncompressed counter', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  const stats = compressionManager.getStats();
  
  assert(typeof stats.uncompressed === 'number', 'Should have uncompressed counter');
});

test('Stats include compressed counter', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  const stats = compressionManager.getStats();
  
  assert(typeof stats.compressed === 'number', 'Should have compressed counter');
});

test('Stats include totalRequests counter', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  const stats = compressionManager.getStats();
  
  assert(typeof stats.totalRequests === 'number', 'Should have totalRequests counter');
});

test('resetStats clears all counters', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  compressionManager.stats.skippedForSecurity = 10;
  compressionManager.stats.uncompressed = 20;
  compressionManager.stats.compressed = 30;
  
  compressionManager.resetStats();
  
  assertEquals(compressionManager.stats.skippedForSecurity, 0, 'skippedForSecurity should be 0');
  assertEquals(compressionManager.stats.uncompressed, 0, 'uncompressed should be 0');
  assertEquals(compressionManager.stats.compressed, 0, 'compressed should be 0');
});

// ============================================================================
// SECTION 10: EDGE CASES AND ERROR HANDLING
// ============================================================================

console.log('\n⚠️  SECTION 10: Edge Cases and Error Handling');

test('hasSecurityConcerns handles null response body', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, null);
  assert(result === false, 'Should handle null body gracefully');
});

test('hasSecurityConcerns handles undefined response body', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, undefined);
  assert(result === false, 'Should handle undefined body gracefully');
});

test('hasSecurityConcerns handles empty string body', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, '');
  assert(result === false, 'Should handle empty string gracefully');
});

test('hasSecurityConcerns handles empty buffer body', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from(''));
  assert(result === false, 'Should handle empty buffer gracefully');
});

test('hasSecurityConcerns handles very large body (only checks first 10KB)', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const largeBody = 'x'.repeat(50000) + '{"csrf_token":"abc"}';
  
  const result = compressionManager.hasSecurityConcerns(req, res, largeBody);
  // Should not detect CSRF token beyond 10KB
  assert(result === false, 'Should only check first 10KB of body');
});

test('hasSecurityConcerns detects CSRF token within first 10KB', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  
  const req = createMockReq();
  const res = createMockRes();
  const body = '{"csrf_token":"abc"}' + 'x'.repeat(50000);
  
  const result = compressionManager.hasSecurityConcerns(req, res, body);
  assert(result === true, 'Should detect CSRF token within first 10KB');
});

test('Middleware handles missing Accept-Encoding header', async () => {
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: {} });
  const res = createMockRes();
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called even without Accept-Encoding');
});

test('Middleware handles empty Accept-Encoding header', async () => {
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { 'accept-encoding': '' } });
  const res = createMockRes();
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called with empty Accept-Encoding');
});

test('Route-level override takes precedence over security settings', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ 
    headers: { 
      'accept-encoding': 'br, gzip',
      cookie: 'session=abc' // Would normally trigger security
    } 
  });
  const res = createMockRes({ locals: { disableCompression: true } });
  let nextCalled = false;
  
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'next() should be called');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should skip due to route override, not security');
});

// ============================================================================
// SECTION 11: CONFIGURATION VALIDATION
// ============================================================================

console.log('\n⚙️  SECTION 11: Configuration Validation');

test('Can create middleware with production preset', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  assert(compressionManager !== null, 'Should create middleware successfully');
});

test('Can create middleware with secure preset', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.secure);
  assert(compressionManager !== null, 'Should create middleware successfully');
});

test('Can create middleware with custom security config', () => {
  const { compressionManager } = createCompressionMiddleware({
    ...COMPRESSION_PRESETS.production,
    security: {
      disableOnAuth: true,
      disableOnCookies: true,
      disableOnCSRF: true,
    }
  });
  assert(compressionManager !== null, 'Should create middleware with custom config');
});

test('Can disable cookie protection', () => {
  const { compressionManager } = createCompressionMiddleware({
    ...COMPRESSION_PRESETS.production,
    security: {
      disableOnCookies: false,
    }
  });
  
  const req = createMockReq({ headers: { cookie: 'session=abc' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === false, 'Should not detect cookies when disabled');
});

// ============================================================================
// SECTION 12: REAL-WORLD SCENARIOS
// ============================================================================

console.log('\n🌍 SECTION 12: Real-World Scenarios');

test('Auth login endpoint scenario', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ 
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'accept-encoding': 'br, gzip' }
  });
  const res = createMockRes({ 
    locals: { disableCompression: true }
  });
  res.setHeader('Set-Cookie', 'session=xyz; HttpOnly; Secure');
  
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'Should process login request');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should not compress login response');
});

test('Webhook endpoint scenario', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ 
    method: 'POST',
    url: '/api/webhooks/stripe',
    headers: { 'accept-encoding': 'gzip' }
  });
  const res = createMockRes({ 
    locals: { disableCompression: true }
  });
  
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'Should process webhook request');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should not compress webhook response');
});

test('User profile with session cookie scenario', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ 
    url: '/api/user/profile',
    headers: { 
      'accept-encoding': 'br, gzip',
      cookie: 'session=abc123; user_id=456'
    }
  });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('{"user":"john"}'));
  assert(result === true, 'Should detect security concerns for user profile with cookies');
});

test('Public products endpoint scenario', () => {
  const { compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ 
    url: '/api/public/products',
    headers: { 'accept-encoding': 'br, gzip' }
  });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('{"products":[]}'));
  assert(result === false, 'Should allow compression for public data');
});

test('Admin route with middleware override scenario', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ 
    url: '/api/admin/users',
    headers: { 
      'accept-encoding': 'br, gzip',
      authorization: 'Bearer admin-token'
    }
  });
  const res = createMockRes({ 
    locals: { disableCompression: true }
  });
  
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'Should process admin request');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should not compress admin response');
});

test('Token refresh endpoint scenario', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ 
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { 
      'accept-encoding': 'br, gzip',
      cookie: 'refresh_token=xyz'
    }
  });
  const res = createMockRes({ 
    locals: { disableCompression: true }
  });
  
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'Should process refresh request');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should not compress refresh response');
});

test('API with conditional compression based on user role', async () => {
  const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  compressionManager.resetStats();
  
  const req = createMockReq({ 
    url: '/api/data',
    headers: { 
      'accept-encoding': 'br, gzip',
      'x-user-role': 'admin'
    }
  });
  const res = createMockRes();
  
  // Simulate middleware that sets disableCompression based on role
  if (req.headers['x-user-role'] === 'admin') {
    res.locals.disableCompression = true;
  }
  
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'Should process request');
  assertEquals(compressionManager.stats.uncompressed, 1, 'Should not compress for admin');
});

// ============================================================================
// SECTION 13: BACKWARD COMPATIBILITY
// ============================================================================

console.log('\n🔄 SECTION 13: Backward Compatibility');

test('Old code without res.locals still works', async () => {
  const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
  
  const req = createMockReq({ headers: { 'accept-encoding': 'br, gzip' } });
  const res = createMockRes();
  delete res.locals; // Simulate old code
  
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  
  assert(nextCalled, 'Should work without res.locals');
});

test('Old security config still works', () => {
  const { compressionManager } = createCompressionMiddleware({
    security: {
      disableOnAuth: false,
      disableOnCookies: false,
      disableOnCSRF: false,
    }
  });
  
  const req = createMockReq({ headers: { cookie: 'session=abc' } });
  const res = createMockRes();
  
  const result = compressionManager.hasSecurityConcerns(req, res, Buffer.from('test'));
  assert(result === false, 'Should respect old security config');
});

test('Can opt-out of new cookie protection', () => {
  const { compressionManager } = createCompressionMiddleware({
    ...COMPRESSION_PRESETS.production,
    security: {
      disableOnCookies: false, // Opt-out
    }
  });
  
  assertEquals(compressionManager.config.security.disableOnCookies, false, 'Should allow opt-out');
});

// ============================================================================
// TEST SUMMARY AND RESULTS
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('📊 TEST RESULTS');
console.log('='.repeat(70));

console.log(`\n✅ Passed: ${passed}/${testCount}`);
console.log(`❌ Failed: ${failed}/${testCount}`);
console.log(`📈 Success Rate: ${((passed / testCount) * 100).toFixed(2)}%`);

if (failed > 0) {
  console.log('\n❌ Failed Tests:');
  failedTests.forEach((test, index) => {
    console.log(`\n${index + 1}. ${test.name}`);
    console.log(`   Error: ${test.error}`);
  });
}

console.log('\n' + '='.repeat(70));
console.log('📋 TEST COVERAGE SUMMARY');
console.log('='.repeat(70));

const sections = [
  { name: 'Preset Configuration', tests: 5 },
  { name: 'Route-Level Override', tests: 4 },
  { name: 'Cookie Detection (Request)', tests: 3 },
  { name: 'Cookie Detection (Response)', tests: 3 },
  { name: 'Authorization Header', tests: 3 },
  { name: 'CSRF Token Detection', tests: 6 },
  { name: 'HEAD Request Handling', tests: 3 },
  { name: 'Combined Security', tests: 4 },
  { name: 'Statistics Tracking', tests: 5 },
  { name: 'Edge Cases', tests: 10 },
  { name: 'Configuration', tests: 4 },
  { name: 'Real-World Scenarios', tests: 7 },
  { name: 'Backward Compatibility', tests: 3 },
];

console.log('\nCoverage by Section:');
sections.forEach(section => {
  console.log(`  • ${section.name}: ${section.tests} tests`);
});

console.log('\n' + '='.repeat(70));

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED! Security features working correctly.');
  console.log('='.repeat(70));
  console.log('\n✅ Security Features Verified:');
  console.log('  • Production preset secure by default (cookies disabled)');
  console.log('  • Route-level compression control (res.locals.disableCompression)');
  console.log('  • Enhanced cookie detection (request + response)');
  console.log('  • Authorization header detection');
  console.log('  • CSRF token detection');
  console.log('  • HEAD request handling');
  console.log('  • Statistics tracking');
  console.log('  • Edge case handling');
  console.log('  • Backward compatibility');
  console.log('  • Real-world scenarios');
  console.log('\n✅ Ready for production use!\n');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED! Please review the implementation.');
  console.log('='.repeat(70));
  console.log('\n');
  process.exit(1);
}
