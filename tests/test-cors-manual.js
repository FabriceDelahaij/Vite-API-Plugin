/**
 * Manual CORS testing script
 * Run with: node test-cors-manual.js
 */

import {
  createCorsConfig,
  createEnvCorsConfig,
  createDomainCorsConfig,
  isOriginAllowed,
  CorsPresets,
  checkOrigin,
  corsMiddleware,
} from './src/lib/cors.js';

console.log('🧪 Testing CORS Implementation\n');

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

// Test 1: Basic CORS config creation
test('createCorsConfig - creates default config', () => {
  const config = createCorsConfig();
  assert(typeof config.origin === 'function', 'origin should be a function');
  assert(config.credentials === true, 'credentials should be true');
  assert(Array.isArray(config.methods), 'methods should be an array');
  assert(config.methods.includes('GET'), 'methods should include GET');
});

// Test 2: Allow no origin (same-origin)
test('createCorsConfig - allows no origin', () => {
  const config = createCorsConfig({ origins: ['https://example.com'] });
  const result = config.origin(null);
  assert(result === true, 'should allow null origin');
});

// Test 3: Whitelist exact match
test('createCorsConfig - allows whitelisted origins', () => {
  const config = createCorsConfig({ 
    origins: ['https://example.com', 'https://app.example.com'] 
  });
  
  assert(config.origin('https://example.com') === 'https://example.com', 'should allow example.com');
  assert(config.origin('https://app.example.com') === 'https://app.example.com', 'should allow app.example.com');
  assert(config.origin('https://evil.com') === false, 'should reject evil.com');
});

// Test 4: Wildcard support
test('createCorsConfig - handles wildcard', () => {
  const config = createCorsConfig({ origins: ['*'] });
  assert(config.origin('https://any-domain.com') === 'https://any-domain.com', 'should allow any domain');
});

// Test 5: Pattern matching
test('createCorsConfig - handles pattern matching', () => {
  const config = createCorsConfig({ origins: ['https://*.example.com'] });
  
  assert(config.origin('https://app.example.com') === 'https://app.example.com', 'should allow app.example.com');
  assert(config.origin('https://api.example.com') === 'https://api.example.com', 'should allow api.example.com');
  assert(config.origin('https://example.com') === false, 'should reject base domain');
  assert(config.origin('https://evil.com') === false, 'should reject evil.com');
});

// Test 6: Custom validator
test('createCorsConfig - uses custom validator', () => {
  const config = createCorsConfig({
    originValidator: (origin) => origin?.startsWith('https://trusted'),
  });
  
  assert(config.origin('https://trusted-site.com') === 'https://trusted-site.com', 'should allow trusted site');
  assert(config.origin('https://untrusted-site.com') === false, 'should reject untrusted site');
});

// Test 7: Environment-based config (development)
test('createEnvCorsConfig - development mode', () => {
  process.env.NODE_ENV = 'development';
  const config = createEnvCorsConfig();
  
  assert(config.origin('http://localhost:3000') === 'http://localhost:3000', 'should allow localhost:3000');
  assert(config.origin('http://localhost:5173') === 'http://localhost:5173', 'should allow localhost:5173');
});

// Test 8: Environment-based config (production)
test('createEnvCorsConfig - production mode', () => {
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';
  
  const config = createEnvCorsConfig();
  
  assert(config.origin('https://example.com') === 'https://example.com', 'should allow example.com');
  assert(config.origin('https://app.example.com') === 'https://app.example.com', 'should allow app.example.com');
  assert(config.origin('https://evil.com') === false, 'should reject evil.com');
});

// Test 9: Domain-based config
test('createDomainCorsConfig - allows domain and subdomains', () => {
  const config = createDomainCorsConfig('example.com');
  
  assert(config.origin('https://example.com') === 'https://example.com', 'should allow base domain');
  assert(config.origin('https://www.example.com') === 'https://www.example.com', 'should allow www');
  assert(config.origin('https://app.example.com') === 'https://app.example.com', 'should allow app subdomain');
  assert(config.origin('https://api.example.com') === 'https://api.example.com', 'should allow api subdomain');
});

// Test 10: isOriginAllowed utility
test('isOriginAllowed - validates origins', () => {
  assert(isOriginAllowed(null, ['https://example.com']) === true, 'should allow null origin');
  assert(isOriginAllowed('https://any.com', ['*']) === true, 'should allow with wildcard');
  assert(isOriginAllowed('https://example.com', ['https://example.com']) === true, 'should allow exact match');
  assert(isOriginAllowed('https://evil.com', ['https://example.com']) === false, 'should reject non-match');
  assert(isOriginAllowed('https://app.example.com', ['https://*.example.com']) === true, 'should allow pattern match');
});

// Test 11: CorsPresets
test('CorsPresets - has correct presets', () => {
  assert(CorsPresets.allowAll.origin === '*', 'allowAll should have wildcard');
  assert(CorsPresets.allowAll.credentials === false, 'allowAll should not allow credentials');
  assert(Array.isArray(CorsPresets.localhost.origin), 'localhost should have array of origins');
  assert(CorsPresets.localhost.origin.includes('http://localhost:3000'), 'localhost should include 3000');
  assert(typeof CorsPresets.sameDomain.origin === 'function', 'sameDomain should have function');
});

// Test 12: sameDomain preset
test('CorsPresets.sameDomain - validates domain', () => {
  process.env.DOMAIN = 'example.com';
  const result = CorsPresets.sameDomain.origin('https://example.com');
  assert(result === true, 'should allow same domain');
  
  const invalidResult = CorsPresets.sameDomain.origin('not-a-url');
  assert(invalidResult === false, 'should reject invalid URL');
});

// Test 13: checkOrigin utility
test('checkOrigin - simple boolean check', () => {
  assert(checkOrigin('https://example.com', { origins: ['https://example.com'] }) === true, 'should return true for allowed');
  assert(checkOrigin('https://evil.com', { origins: ['https://example.com'] }) === false, 'should return false for disallowed');
  assert(checkOrigin(null, { origins: ['https://example.com'] }) === true, 'should return true for null origin');
});

// Test 14: corsMiddleware - sets headers
test('corsMiddleware - sets CORS headers', () => {
  const middleware = corsMiddleware({ origins: ['https://example.com'] });
  
  const req = {
    method: 'GET',
    headers: { origin: 'https://example.com' },
  };
  
  const headers = {};
  const res = {
    setHeader: (key, value) => { headers[key] = value; },
    statusCode: 200,
    end: () => {},
  };
  
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  
  middleware(req, res, next);
  
  assert(headers['Access-Control-Allow-Origin'] === 'https://example.com', 'should set origin header');
  assert(headers['Access-Control-Allow-Credentials'] === 'true', 'should set credentials header');
  assert(nextCalled === true, 'should call next');
});

// Test 15: corsMiddleware - handles OPTIONS
test('corsMiddleware - handles OPTIONS preflight', () => {
  const middleware = corsMiddleware({ origins: ['https://example.com'] });
  
  const req = {
    method: 'OPTIONS',
    headers: { origin: 'https://example.com' },
  };
  
  let statusCode = 200;
  let ended = false;
  const res = {
    setHeader: () => {},
    set statusCode(code) { statusCode = code; },
    get statusCode() { return statusCode; },
    end: () => { ended = true; },
  };
  
  const next = () => {};
  
  middleware(req, res, next);
  
  assert(statusCode === 204, 'should set 204 status');
  assert(ended === true, 'should end response');
});

// Test 16: corsMiddleware - rejects disallowed origin
test('corsMiddleware - rejects disallowed origin', () => {
  const middleware = corsMiddleware({ origins: ['https://example.com'] });
  
  const req = {
    method: 'GET',
    headers: { origin: 'https://evil.com' },
  };
  
  const headers = {};
  const res = {
    setHeader: (key, value) => { headers[key] = value; },
  };
  
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  
  middleware(req, res, next);
  
  assert(headers['Access-Control-Allow-Origin'] === undefined, 'should not set origin header');
  assert(nextCalled === true, 'should still call next');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed!');
  process.exit(1);
}
