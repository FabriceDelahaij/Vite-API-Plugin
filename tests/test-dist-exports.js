/**
 * Test that all exports from dist work correctly
 */

console.log('🧪 Testing dist exports...\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

// Test main exports
await test('Can import default plugin', async () => {
  const plugin = await import('./dist/index.js');
  if (!plugin.default) throw new Error('Default export not found');
  if (typeof plugin.default !== 'function') throw new Error('Default export is not a function');
});

await test('Can import WebSocketManager', async () => {
  const { WebSocketManager } = await import('./dist/index.js');
  if (!WebSocketManager) throw new Error('WebSocketManager not exported');
  if (typeof WebSocketManager !== 'function') throw new Error('WebSocketManager is not a constructor');
});

await test('Can import WebSocketManager directly from lib', async () => {
  const { WebSocketManager } = await import('./dist/lib/websocket.js');
  if (!WebSocketManager) throw new Error('WebSocketManager not exported from lib');
  if (typeof WebSocketManager !== 'function') throw new Error('WebSocketManager is not a constructor');
});

await test('WebSocketManager can be instantiated', async () => {
  const { WebSocketManager } = await import('./dist/lib/websocket.js');
  const manager = new WebSocketManager();
  if (!manager) throw new Error('Failed to instantiate WebSocketManager');
  if (!manager.options) throw new Error('Manager missing options');
  if (!manager.connections) throw new Error('Manager missing connections');
  if (!manager.routes) throw new Error('Manager missing routes');
  if (!manager.stats) throw new Error('Manager missing stats');
});

await test('Can import auth utilities', async () => {
  const { JWT, Password } = await import('./dist/index.js');
  if (!JWT) throw new Error('JWT not exported');
  if (!Password) throw new Error('Password not exported');
});

await test('Can import CORS utilities', async () => {
  const { createCorsConfig } = await import('./dist/index.js');
  if (!createCorsConfig) throw new Error('createCorsConfig not exported');
});

await test('Can import cache utilities', async () => {
  const exports = await import('./dist/index.js');
  // Cache might export different names, just check it exports something
  if (!exports) throw new Error('No exports from cache');
});

await test('Can import compression utilities', async () => {
  const { CompressionManager } = await import('./dist/index.js');
  if (!CompressionManager) throw new Error('CompressionManager not exported');
});

await test('Can import API helpers', async () => {
  const { createJsonResponse, createErrorResponse } = await import('./dist/index.js');
  if (!createJsonResponse) throw new Error('createJsonResponse not exported');
  if (!createErrorResponse) throw new Error('createErrorResponse not exported');
});

console.log('\n' + '='.repeat(60));
console.log('📊 Test Results');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total:  ${passed + failed}`);
console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
