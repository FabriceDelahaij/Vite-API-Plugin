/**
 * Integration test for CORS with vite plugin
 * Tests that createEnvCorsConfig works with the vite plugin
 */

import { createEnvCorsConfig, createCorsConfig } from './src/lib/cors.js';

console.log('🧪 Testing CORS Integration with Vite Plugin\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Simulate vite plugin's setCorsHeaders function
function setCorsHeaders(req, res, cors) {
  const origin = req.headers.origin;
  
  // Handle different cors config types
  let allowedOrigin = null;
  
  if (typeof cors.origin === 'function') {
    // Function-based origin validation (from createCorsConfig)
    allowedOrigin = cors.origin(origin);
  } else if (cors.origin === '*') {
    allowedOrigin = origin || '*';
  } else if (Array.isArray(cors.origin)) {
    if (cors.origin.includes(origin)) {
      allowedOrigin = origin;
    }
  } else if (typeof cors.origin === 'string') {
    allowedOrigin = cors.origin;
  }
  
  // Set origin header if allowed
  if (allowedOrigin && allowedOrigin !== false) {
    if (typeof allowedOrigin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    } else if (allowedOrigin === true && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }

  // Ensure methods is always an array
  const methods = Array.isArray(cors.methods) ? cors.methods : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.setHeader('Access-Control-Max-Age', (cors.maxAge || 86400).toString());
  
  if (cors.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

// Test 1: Development environment with createEnvCorsConfig
test('Integration - development environment', () => {
  process.env.NODE_ENV = 'development';
  const corsConfig = createEnvCorsConfig();
  
  const req = { headers: { origin: 'http://localhost:3000' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  assert(headers['Access-Control-Allow-Origin'] === 'http://localhost:3000', 'should allow localhost:3000');
  assert(headers['Access-Control-Allow-Credentials'] === 'true', 'should allow credentials');
});

// Test 2: Production environment with createEnvCorsConfig
test('Integration - production environment', () => {
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';
  const corsConfig = createEnvCorsConfig();
  
  const req = { headers: { origin: 'https://example.com' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  assert(headers['Access-Control-Allow-Origin'] === 'https://example.com', 'should allow example.com');
});

// Test 3: Production blocks unauthorized origin
test('Integration - production blocks unauthorized', () => {
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://example.com';
  const corsConfig = createEnvCorsConfig();
  
  const req = { headers: { origin: 'https://evil.com' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  assert(headers['Access-Control-Allow-Origin'] === undefined, 'should not set origin header for evil.com');
});

// Test 4: Pattern matching with wildcards
test('Integration - wildcard pattern matching', () => {
  const corsConfig = createCorsConfig({ origins: ['https://*.example.com'] });
  
  const req = { headers: { origin: 'https://app.example.com' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  assert(headers['Access-Control-Allow-Origin'] === 'https://app.example.com', 'should allow app.example.com');
});

// Test 5: Pattern matching rejects non-matching
test('Integration - wildcard pattern rejects non-match', () => {
  const corsConfig = createCorsConfig({ origins: ['https://*.example.com'] });
  
  const req = { headers: { origin: 'https://evil.com' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  assert(headers['Access-Control-Allow-Origin'] === undefined, 'should not allow evil.com');
});

// Test 6: Custom validator integration
test('Integration - custom validator', () => {
  const corsConfig = createCorsConfig({
    originValidator: (origin) => origin?.endsWith('.trusted.com'),
  });
  
  const req1 = { headers: { origin: 'https://app.trusted.com' } };
  const headers1 = {};
  const res1 = { setHeader: (k, v) => { headers1[k] = v; } };
  
  setCorsHeaders(req1, res1, corsConfig);
  assert(headers1['Access-Control-Allow-Origin'] === 'https://app.trusted.com', 'should allow trusted domain');
  
  const req2 = { headers: { origin: 'https://app.untrusted.com' } };
  const headers2 = {};
  const res2 = { setHeader: (k, v) => { headers2[k] = v; } };
  
  setCorsHeaders(req2, res2, corsConfig);
  assert(headers2['Access-Control-Allow-Origin'] === undefined, 'should reject untrusted domain');
});

// Test 7: No origin (same-origin requests)
test('Integration - no origin header', () => {
  const corsConfig = createCorsConfig({ origins: ['https://example.com'] });
  
  const req = { headers: {} };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  // Should still set other CORS headers
  assert(headers['Access-Control-Allow-Methods'] !== undefined, 'should set methods header');
  assert(headers['Access-Control-Allow-Credentials'] === 'true', 'should set credentials header');
});

// Test 8: Wildcard origin
test('Integration - wildcard origin', () => {
  const corsConfig = createCorsConfig({ origins: ['*'] });
  
  const req = { headers: { origin: 'https://any-domain.com' } };
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  
  setCorsHeaders(req, res, corsConfig);
  
  assert(headers['Access-Control-Allow-Origin'] === 'https://any-domain.com', 'should allow any domain');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 All integration tests passed!');
  console.log('\n✨ CORS is working correctly in the system!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some integration tests failed!');
  process.exit(1);
}
