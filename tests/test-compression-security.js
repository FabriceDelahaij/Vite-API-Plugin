/**
 * Compression Security Tests
 * 
 * Tests for route-level compression control and cookie-based security
 */

import { createCompressionMiddleware, COMPRESSION_PRESETS } from './src/lib/compression.js';

// Test counter
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

// ============================================================================
// Test 1: Production Preset Has Cookies Disabled
// ============================================================================

console.log('\n📋 Test 1: Production Preset Configuration');

const productionConfig = COMPRESSION_PRESETS.production;
assert(
  productionConfig.security.disableOnCookies === true,
  'Production preset has disableOnCookies enabled'
);

// ============================================================================
// Test 2: Route-Level Override Detection
// ============================================================================

console.log('\n📋 Test 2: Route-Level Override');

const { middleware, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);

// Mock request and response
const mockReq = {
  method: 'POST',
  url: '/api/auth/login',
  headers: {
    'accept-encoding': 'br, gzip',
  },
};

const mockRes = {
  locals: {
    disableCompression: true, // Route-level override
  },
  getHeader: () => null,
  setHeader: () => {},
  on: () => {},
};

let nextCalled = false;
const mockNext = () => {
  nextCalled = true;
};

// Reset stats
compressionManager.resetStats();

// Call middleware
await middleware(mockReq, mockRes, mockNext);

assert(
  nextCalled === true,
  'Middleware calls next() when route-level override is set'
);

assert(
  compressionManager.stats.uncompressed === 1,
  'Uncompressed counter incremented for route-level override'
);

// ============================================================================
// Test 3: Cookie Detection (Request)
// ============================================================================

console.log('\n📋 Test 3: Cookie Detection (Request)');

const mockReqWithCookie = {
  method: 'GET',
  url: '/api/user/profile',
  headers: {
    'accept-encoding': 'br, gzip',
    'cookie': 'session=abc123',
  },
};

const mockResNoCookie = {
  locals: {},
  getHeader: (name) => {
    if (name === 'set-cookie') return null;
    return null;
  },
};

const hasConcerns = compressionManager.hasSecurityConcerns(
  mockReqWithCookie,
  mockResNoCookie,
  Buffer.from('{"user": "test"}')
);

assert(
  hasConcerns === true,
  'Security concerns detected when request has cookies'
);

// ============================================================================
// Test 4: Cookie Detection (Response Set-Cookie)
// ============================================================================

console.log('\n📋 Test 4: Cookie Detection (Response Set-Cookie)');

const mockReqNoCookie = {
  method: 'POST',
  url: '/api/auth/login',
  headers: {
    'accept-encoding': 'br, gzip',
  },
};

const mockResWithSetCookie = {
  locals: {},
  getHeader: (name) => {
    if (name === 'set-cookie') return 'session=xyz789; HttpOnly';
    return null;
  },
};

const hasConcernsSetCookie = compressionManager.hasSecurityConcerns(
  mockReqNoCookie,
  mockResWithSetCookie,
  Buffer.from('{"token": "secret"}')
);

assert(
  hasConcernsSetCookie === true,
  'Security concerns detected when response has Set-Cookie header'
);

// ============================================================================
// Test 5: No Security Concerns for Public Data
// ============================================================================

console.log('\n📋 Test 5: No Security Concerns for Public Data');

const mockReqPublic = {
  method: 'GET',
  url: '/api/public/products',
  headers: {
    'accept-encoding': 'br, gzip',
  },
};

const mockResPublic = {
  locals: {},
  getHeader: () => null,
};

const noConcerns = compressionManager.hasSecurityConcerns(
  mockReqPublic,
  mockResPublic,
  Buffer.from('{"products": []}')
);

assert(
  noConcerns === false,
  'No security concerns for public data without cookies'
);

// ============================================================================
// Test 6: Secure Preset Configuration
// ============================================================================

console.log('\n📋 Test 6: Secure Preset Configuration');

const secureConfig = COMPRESSION_PRESETS.secure;

assert(
  secureConfig.security.disableOnAuth === true,
  'Secure preset has disableOnAuth enabled'
);

assert(
  secureConfig.security.disableOnCookies === true,
  'Secure preset has disableOnCookies enabled'
);

assert(
  secureConfig.security.disableOnCSRF === true,
  'Secure preset has disableOnCSRF enabled'
);

// ============================================================================
// Test 7: HEAD Request Handling
// ============================================================================

console.log('\n📋 Test 7: HEAD Request Handling');

const mockHeadReq = {
  method: 'HEAD',
  url: '/api/products',
  headers: {
    'accept-encoding': 'br, gzip',
  },
};

const mockHeadRes = {
  locals: {},
  getHeader: () => null,
  setHeader: () => {},
  on: () => {},
};

compressionManager.resetStats();
let headNextCalled = false;

await middleware(mockHeadReq, mockHeadRes, () => {
  headNextCalled = true;
});

assert(
  headNextCalled === true,
  'HEAD requests skip compression'
);

assert(
  compressionManager.stats.uncompressed === 1,
  'HEAD requests counted as uncompressed'
);

// ============================================================================
// Test 8: Statistics Tracking
// ============================================================================

console.log('\n📋 Test 8: Statistics Tracking');

const stats = compressionManager.getStats();

assert(
  typeof stats.skippedForSecurity === 'number',
  'Stats include skippedForSecurity counter'
);

assert(
  typeof stats.uncompressed === 'number',
  'Stats include uncompressed counter'
);

assert(
  typeof stats.compressed === 'number',
  'Stats include compressed counter'
);

// ============================================================================
// Test Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total: ${passed + failed}`);
console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);
console.log('='.repeat(60));

if (failed === 0) {
  console.log('\n🎉 All tests passed! Security features working correctly.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.\n');
  process.exit(1);
}
