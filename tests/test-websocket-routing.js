/**
 * Test WebSocket Route Filtering
 * Verifies that only routes under /ws/ are registered as WebSocket routes
 */

console.log('🧪 Testing WebSocket Route Filtering\n');

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

// Mock WebSocketManager for testing
class MockWebSocketManager {
  constructor() {
    this.routes = new Map();
  }
  
  registerRoute(route, filePath) {
    this.routes.set(route, filePath);
  }
}

// Simulate the route filtering logic
function filterWebSocketRoutes(apiHandlers, apiPrefix, wsRoutePrefix) {
  const websocketManager = new MockWebSocketManager();
  const wsPath = apiPrefix + wsRoutePrefix;
  
  for (const [route, filePath] of apiHandlers.entries()) {
    // Only register routes that are under the WebSocket path
    if (route.startsWith(wsPath + '/') || route === wsPath) {
      websocketManager.registerRoute(route, filePath);
    }
  }
  
  return websocketManager;
}

// =============================================================================
// Test Suite: WebSocket Route Filtering
// =============================================================================

console.log('📦 Test Suite: WebSocket Route Filtering\n');

test('Only /api/ws/ routes are registered', () => {
  const apiHandlers = new Map([
    ['/api/hello', 'pages/api/hello.js'],
    ['/api/users', 'pages/api/users.js'],
    ['/api/ws/echo', 'pages/api/ws/echo.js'],
    ['/api/ws/chat', 'pages/api/ws/chat.js'],
    ['/api/admin/users', 'pages/api/admin/users.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 2, 'Should register exactly 2 WebSocket routes');
  assert(manager.routes.has('/api/ws/echo'), 'Should register /api/ws/echo');
  assert(manager.routes.has('/api/ws/chat'), 'Should register /api/ws/chat');
  assert(!manager.routes.has('/api/hello'), 'Should not register /api/hello');
  assert(!manager.routes.has('/api/users'), 'Should not register /api/users');
  assert(!manager.routes.has('/api/admin/users'), 'Should not register /api/admin/users');
});

test('Nested WebSocket routes are registered', () => {
  const apiHandlers = new Map([
    ['/api/ws/rooms/lobby', 'pages/api/ws/rooms/lobby.js'],
    ['/api/ws/rooms/general', 'pages/api/ws/rooms/general.js'],
    ['/api/ws/notifications', 'pages/api/ws/notifications.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 3, 'Should register all nested WebSocket routes');
  assert(manager.routes.has('/api/ws/rooms/lobby'), 'Should register nested route');
  assert(manager.routes.has('/api/ws/rooms/general'), 'Should register nested route');
  assert(manager.routes.has('/api/ws/notifications'), 'Should register top-level ws route');
});

test('Dynamic WebSocket routes are registered', () => {
  const apiHandlers = new Map([
    ['/api/ws/:room', 'pages/api/ws/[room].js'],
    ['/api/ws/user/:id', 'pages/api/ws/user/[id].js'],
    ['/api/users/:id', 'pages/api/users/[id].js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 2, 'Should register dynamic WebSocket routes');
  assert(manager.routes.has('/api/ws/:room'), 'Should register dynamic route');
  assert(manager.routes.has('/api/ws/user/:id'), 'Should register nested dynamic route');
  assert(!manager.routes.has('/api/users/:id'), 'Should not register non-ws dynamic route');
});

test('Base /api/ws route is registered', () => {
  const apiHandlers = new Map([
    ['/api/ws', 'pages/api/ws/index.js'],
    ['/api/ws/echo', 'pages/api/ws/echo.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 2, 'Should register base ws route');
  assert(manager.routes.has('/api/ws'), 'Should register /api/ws');
  assert(manager.routes.has('/api/ws/echo'), 'Should register /api/ws/echo');
});

test('Routes with similar names are not confused', () => {
  const apiHandlers = new Map([
    ['/api/ws/echo', 'pages/api/ws/echo.js'],
    ['/api/wss/echo', 'pages/api/wss/echo.js'],
    ['/api/websocket', 'pages/api/websocket.js'],
    ['/api/ws-test', 'pages/api/ws-test.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 1, 'Should only register exact /ws/ routes');
  assert(manager.routes.has('/api/ws/echo'), 'Should register /api/ws/echo');
  assert(!manager.routes.has('/api/wss/echo'), 'Should not register /api/wss/echo');
  assert(!manager.routes.has('/api/websocket'), 'Should not register /api/websocket');
  assert(!manager.routes.has('/api/ws-test'), 'Should not register /api/ws-test');
});

test('Custom WebSocket route prefix works', () => {
  const apiHandlers = new Map([
    ['/api/realtime/chat', 'pages/api/realtime/chat.js'],
    ['/api/realtime/notifications', 'pages/api/realtime/notifications.js'],
    ['/api/ws/echo', 'pages/api/ws/echo.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/realtime');
  
  assert(manager.routes.size === 2, 'Should register routes under custom prefix');
  assert(manager.routes.has('/api/realtime/chat'), 'Should register custom prefix route');
  assert(manager.routes.has('/api/realtime/notifications'), 'Should register custom prefix route');
  assert(!manager.routes.has('/api/ws/echo'), 'Should not register default /ws/ route');
});

test('Empty route list returns no WebSocket routes', () => {
  const apiHandlers = new Map();
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 0, 'Should register no routes when list is empty');
});

test('No WebSocket routes returns empty manager', () => {
  const apiHandlers = new Map([
    ['/api/hello', 'pages/api/hello.js'],
    ['/api/users', 'pages/api/users.js'],
    ['/api/admin/users', 'pages/api/admin/users.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/api', '/ws');
  
  assert(manager.routes.size === 0, 'Should register no routes when none match');
});

test('Different API prefix works correctly', () => {
  const apiHandlers = new Map([
    ['/v1/ws/echo', 'pages/v1/ws/echo.js'],
    ['/v1/ws/chat', 'pages/v1/ws/chat.js'],
    ['/v1/users', 'pages/v1/users.js'],
  ]);
  
  const manager = filterWebSocketRoutes(apiHandlers, '/v1', '/ws');
  
  assert(manager.routes.size === 2, 'Should work with custom API prefix');
  assert(manager.routes.has('/v1/ws/echo'), 'Should register with custom prefix');
  assert(manager.routes.has('/v1/ws/chat'), 'Should register with custom prefix');
  assert(!manager.routes.has('/v1/users'), 'Should not register non-ws route');
});

// =============================================================================
// Test Results
// =============================================================================

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
