# Integration Tests

This folder contains integration tests for various features of the Vite API Routes Plugin.

## Test Categories

### Cache Tests
- `test-cache-helpers.js` - Cache helper methods (res.cache(), res.noCache(), etc.)
- `test-cache-http-semantics.js` - HTTP caching semantics and headers
- `test-cache-integration.js` - End-to-end cache integration tests
- `test-cache-observability.js` - Cache monitoring and observability hooks
- `test-cache-swr-revalidation.js` - Stale-while-revalidate pattern tests
- `test-response-cache-methods.js` - Response cache method tests

### Compression Tests
- `test-compression-api-enhancements.js` - Compression API enhancements
- `test-compression-full.js` - Full compression feature tests
- `test-compression-http-semantics.js` - HTTP compression semantics
- `test-compression-security-full.js` - Comprehensive compression security tests
- `test-compression-security.js` - Basic compression security tests
- `test-graphql-compression.js` - GraphQL response compression
- `test-per-response-ttl.js` - Per-response TTL configuration
- `test-zstd.js` - Zstd compression algorithm tests

### CORS Tests
- `test-cors-integration.js` - CORS integration tests
- `test-cors-manual.js` - Manual CORS testing

### WebSocket Tests
- `test-websocket.js` - WebSocket functionality tests
- `test-websocket-routing.js` - WebSocket routing tests

### Distribution Tests
- `test-dist-exports.js` - Test plugin exports and distribution build

## Running Tests

### Run All Tests
```bash
# From project root
node tests/test-cache-integration.js
node tests/test-compression-full.js
# ... etc
```

### Run Specific Test Category
```bash
# Cache tests
node tests/test-cache-integration.js

# Compression tests
node tests/test-compression-full.js

# WebSocket tests
node tests/test-websocket.js
```

### Run Unit Tests (Vitest)
```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Test Output Files

- `test-full-output.txt` - Full test output log
- `test-output-utf8.txt` - UTF-8 encoded test output
- `test-output.txt` - Standard test output

## Writing New Tests

When adding new integration tests:

1. **Name convention:** `test-{feature}-{aspect}.js`
2. **Location:** Place in this `tests/` folder
3. **Documentation:** Update this README with test description
4. **Output:** Test output files should also go in this folder

### Example Test Structure

```javascript
// tests/test-my-feature.js
import { createServer } from '../src/index.js';

async function runTests() {
  console.log('Testing My Feature...\n');
  
  // Test 1
  console.log('Test 1: Basic functionality');
  // ... test code
  
  // Test 2
  console.log('Test 2: Edge cases');
  // ... test code
  
  console.log('\n✅ All tests passed!');
}

runTests().catch(console.error);
```

## Test Dependencies

Most integration tests require:
- Node.js runtime
- Plugin source files in `src/`
- Test utilities from `src/testing/`

Some tests may require additional dependencies:
- Redis (for cache tests with Redis backend)
- WebSocket client libraries (for WebSocket tests)

## Continuous Integration

These tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Integration Tests
  run: |
    node tests/test-cache-integration.js
    node tests/test-compression-full.js
    node tests/test-websocket.js
```

## Troubleshooting

### Test Failures

1. **Check dependencies:** Ensure all required packages are installed
2. **Check ports:** Some tests may require specific ports to be available
3. **Check Redis:** Cache tests with Redis require a running Redis instance
4. **Check output files:** Review test output files for detailed error messages

### Common Issues

- **Port already in use:** Stop other services using the same port
- **Redis connection failed:** Start Redis server or skip Redis-specific tests
- **Module not found:** Run `npm install` to install dependencies

## Contributing

When contributing new tests:

1. Follow existing test patterns
2. Add clear console output for test progress
3. Include both success and failure cases
4. Update this README with test description
5. Ensure tests can run independently

## Related Documentation

- [TESTING-GUIDE.md](../TESTING-GUIDE.md) - Main testing guide
- [CACHE-GUIDE.md](../CACHE-GUIDE.md) - Cache feature documentation
- [COMPRESSION-GUIDE.md](../COMPRESSION-GUIDE.md) - Compression documentation
- [WEBSOCKET-GUIDE.md](../WEBSOCKET-GUIDE.md) - WebSocket documentation
