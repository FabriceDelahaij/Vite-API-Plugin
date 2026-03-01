/**
 * WebSocket Implementation Test Suite
 * Tests RFC 6455 compliance, security features, and protocol handling
 */

import { WebSocketManager } from './src/lib/websocket.js';
import { EventEmitter } from 'events';
import crypto from 'crypto';

console.log('🧪 Testing WebSocket Implementation\n');

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
    if (error.stack) {
      console.log(`   ${error.stack.split('\n').slice(1, 3).join('\n   ')}`);
    }
    failed++;
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

// Mock socket for testing
class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.ended = false;
    this.destroyed = false;
  }

  write(data) {
    this.written.push(data);
    return true;
  }

  end() {
    this.ended = true;
    this.emit('close');
  }

  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

// =============================================================================
// Test Suite 1: WebSocketManager Initialization
// =============================================================================

console.log('📦 Test Suite 1: WebSocketManager Initialization\n');

test('WebSocketManager initializes with default options', () => {
  const manager = new WebSocketManager();
  assert(manager.options.maxConnections === 1000, 'Default maxConnections should be 1000');
  assert(manager.options.pingInterval === 30000, 'Default pingInterval should be 30000');
  assert(manager.options.validateOrigin === true, 'Origin validation should be enabled by default');
  assert(manager.options.validateUtf8 === true, 'UTF-8 validation should be enabled by default');
});

test('WebSocketManager accepts custom options', () => {
  const manager = new WebSocketManager({
    maxConnections: 500,
    pingInterval: 15000,
    validateOrigin: false,
  });
  assert(manager.options.maxConnections === 500, 'Custom maxConnections should be set');
  assert(manager.options.pingInterval === 15000, 'Custom pingInterval should be set');
  assert(manager.options.validateOrigin === false, 'Custom validateOrigin should be set');
});

test('WebSocketManager initializes stats correctly', () => {
  const manager = new WebSocketManager();
  assert(manager.stats.totalConnections === 0, 'Initial totalConnections should be 0');
  assert(manager.stats.activeConnections === 0, 'Initial activeConnections should be 0');
  assert(manager.stats.messagesReceived === 0, 'Initial messagesReceived should be 0');
  assert(manager.stats.messagesSent === 0, 'Initial messagesSent should be 0');
});

// =============================================================================
// Test Suite 2: Route Registration
// =============================================================================

console.log('\n📦 Test Suite 2: Route Registration\n');

test('registerRoute adds static routes', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  manager.registerRoute('/api/ws/echo', 'handler.js');
  assert(manager.routes.has('/api/ws/echo'), 'Route should be registered');
});

test('matchRoute handles static routes', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const match = manager.matchRoute('/api/ws/echo', '/api/ws/echo');
  assert(match !== null, 'Static route should match');
  assert(Object.keys(match.params).length === 0, 'Static route should have no params');
});

test('matchRoute handles dynamic routes with parameters', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const match = manager.matchRoute('/api/ws/:room', '/api/ws/lobby');
  assert(match !== null, 'Dynamic route should match');
  assert(match.params.room === 'lobby', 'Parameter should be extracted');
});

test('matchRoute handles multiple parameters', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const match = manager.matchRoute('/api/ws/:type/:id', '/api/ws/chat/123');
  assert(match !== null, 'Multi-param route should match');
  assert(match.params.type === 'chat', 'First parameter should be extracted');
  assert(match.params.id === '123', 'Second parameter should be extracted');
});

test('matchRoute rejects mismatched routes', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const match = manager.matchRoute('/api/ws/echo', '/api/ws/chat');
  assert(match === null, 'Mismatched route should not match');
});

// =============================================================================
// Test Suite 3: Origin Validation (CORS for WebSocket)
// =============================================================================

console.log('\n📦 Test Suite 3: Origin Validation (CSWSH Prevention)\n');

test('isOriginAllowed allows all origins when origins is null', () => {
  const manager = new WebSocketManager({ origins: null });
  assert(manager.isOriginAllowed('http://example.com'), 'Should allow any origin');
  assert(manager.isOriginAllowed('http://evil.com'), 'Should allow any origin');
});

test('isOriginAllowed denies all origins when origins is empty array', () => {
  const manager = new WebSocketManager({ origins: [] });
  assert(!manager.isOriginAllowed('http://example.com'), 'Should deny all origins');
});

test('isOriginAllowed checks allowlist', () => {
  const manager = new WebSocketManager({ 
    origins: ['http://localhost:3000', 'https://example.com'] 
  });
  assert(manager.isOriginAllowed('http://localhost:3000'), 'Should allow whitelisted origin');
  assert(manager.isOriginAllowed('https://example.com'), 'Should allow whitelisted origin');
  assert(!manager.isOriginAllowed('http://evil.com'), 'Should deny non-whitelisted origin');
});

test('isOriginAllowed rejects missing origin header', () => {
  const manager = new WebSocketManager({ origins: null });
  assert(!manager.isOriginAllowed(null), 'Should reject missing origin');
  assert(!manager.isOriginAllowed(undefined), 'Should reject undefined origin');
});

test('isOriginAllowed respects validateOrigin flag', () => {
  const manager = new WebSocketManager({ 
    validateOrigin: false,
    origins: []
  });
  assert(manager.isOriginAllowed('http://evil.com'), 'Should allow when validation disabled');
});

// =============================================================================
// Test Suite 4: UTF-8 Validation
// =============================================================================

console.log('\n📦 Test Suite 4: UTF-8 Validation (RFC 6455 Section 8.1)\n');

test('validateUtf8 accepts valid UTF-8', () => {
  const manager = new WebSocketManager();
  const buffer = Buffer.from('Hello, World! 🌍', 'utf8');
  const result = manager.validateUtf8(buffer);
  assert(result === 'Hello, World! 🌍', 'Should decode valid UTF-8');
});

test('validateUtf8 rejects invalid UTF-8', () => {
  const manager = new WebSocketManager();
  // Create invalid UTF-8 sequence
  const buffer = Buffer.from([0xFF, 0xFE, 0xFD]);
  const result = manager.validateUtf8(buffer);
  assert(result === null, 'Should reject invalid UTF-8');
  assert(manager.stats.utf8Errors === 1, 'Should increment utf8Errors counter');
});

test('validateUtf8 allows invalid UTF-8 when validation disabled', () => {
  const manager = new WebSocketManager({ validateUtf8: false });
  const buffer = Buffer.from([0xFF, 0xFE, 0xFD]);
  const result = manager.validateUtf8(buffer);
  assert(result !== null, 'Should allow invalid UTF-8 when validation disabled');
});

// =============================================================================
// Test Suite 5: WebSocket Accept Key Generation
// =============================================================================

console.log('\n📦 Test Suite 5: WebSocket Accept Key Generation (RFC 6455)\n');

test('generateAcceptKey produces correct hash', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  // Test vector from RFC 6455
  const key = 'dGhlIHNhbXBsZSBub25jZQ==';
  const expected = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
  const result = manager.generateAcceptKey(key);
  assertEquals(result, expected, 'Accept key should match RFC 6455 test vector');
});

test('generateAcceptKey uses correct GUID', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const key = 'test-key';
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const expected = crypto.createHash('sha1').update(key + GUID).digest('base64');
  const result = manager.generateAcceptKey(key);
  assertEquals(result, expected, 'Should use correct GUID');
});

// =============================================================================
// Test Suite 6: Frame Creation
// =============================================================================

console.log('\n📦 Test Suite 6: Frame Creation (Server-to-Client)\n');

test('createFrame creates text frame with small payload', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame = manager.createFrame('Hello');
  assert(frame[0] === 0x81, 'First byte should be FIN + text opcode (0x81)');
  assert(frame[1] === 5, 'Second byte should be payload length (5)');
  assert(frame.toString('utf8', 2) === 'Hello', 'Payload should be correct');
});

test('createFrame creates frame with 126-byte extended length', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const payload = 'A'.repeat(200);
  const frame = manager.createFrame(payload);
  assert(frame[0] === 0x81, 'First byte should be FIN + text opcode');
  assert(frame[1] === 126, 'Second byte should indicate 16-bit length');
  assert(frame.readUInt16BE(2) === 200, 'Extended length should be 200');
});

test('createFrame creates frame with 127-byte extended length', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const payload = 'A'.repeat(70000);
  const frame = manager.createFrame(payload);
  assert(frame[0] === 0x81, 'First byte should be FIN + text opcode');
  assert(frame[1] === 127, 'Second byte should indicate 64-bit length');
  assert(Number(frame.readBigUInt64BE(2)) === 70000, 'Extended length should be 70000');
});

test('createCloseFrame includes status code and reason', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame = manager.createCloseFrame(1000, 'Normal closure');
  assert(frame[0] === 0x88, 'First byte should be FIN + close opcode (0x88)');
  assert(frame.readUInt16BE(2) === 1000, 'Status code should be 1000');
  assert(frame.toString('utf8', 4) === 'Normal closure', 'Reason should be correct');
});

test('createPingFrame creates correct frame', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame = manager.createPingFrame();
  assert(frame[0] === 0x89, 'First byte should be FIN + ping opcode (0x89)');
  assert(frame[1] === 0x00, 'Payload length should be 0');
});

test('createPongFrame creates correct frame', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame = manager.createPongFrame('test');
  assert(frame[0] === 0x8A, 'First byte should be FIN + pong opcode (0x8A)');
  assert(frame[1] === 4, 'Payload length should be 4');
  assert(frame.toString('utf8', 2) === 'test', 'Payload should be correct');
});

// =============================================================================
// Test Suite 7: Frame Parsing (Client-to-Server)
// =============================================================================

console.log('\n📦 Test Suite 7: Frame Parsing (Client-to-Server)\n');

function createMaskedFrame(payload, opcode = 0x1, fin = true) {
  const payloadBuffer = Buffer.from(payload);
  const maskKey = crypto.randomBytes(4);
  
  const frame = Buffer.allocUnsafe(6 + payloadBuffer.length);
  frame[0] = (fin ? 0x80 : 0x00) | opcode;
  frame[1] = 0x80 | payloadBuffer.length; // MASK bit set
  maskKey.copy(frame, 2);
  
  // Mask payload
  for (let i = 0; i < payloadBuffer.length; i++) {
    frame[6 + i] = payloadBuffer[i] ^ maskKey[i % 4];
  }
  
  return frame;
}

test('parseFrames parses single masked text frame', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame = createMaskedFrame('Hello');
  const { frames, remaining } = manager.parseFrames(frame);
  
  assert(frames.length === 1, 'Should parse one frame');
  assert(frames[0].fin === true, 'FIN bit should be set');
  assert(frames[0].opcode === 0x1, 'Opcode should be text (0x1)');
  assert(frames[0].payload.toString('utf8') === 'Hello', 'Payload should be unmasked');
  assert(remaining.length === 0, 'No remaining data');
});

test('parseFrames handles partial frames (TCP buffering)', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame = createMaskedFrame('Hello');
  
  // Test with just 1 byte (incomplete header)
  const part1 = frame.slice(0, 1);
  const part2 = frame.slice(1);
  
  // Parse first part
  const result1 = manager.parseFrames(part1);
  assert(result1.frames.length === 0, 'Should not parse incomplete frame');
  assert(result1.remaining.length === 1, 'Should buffer incomplete data');
  
  // Parse second part with buffered data
  const combined = Buffer.concat([result1.remaining, part2]);
  const result2 = manager.parseFrames(combined);
  assert(result2.frames.length === 1, 'Should parse complete frame');
  assert(result2.frames[0].payload.toString('utf8') === 'Hello', 'Payload should be correct');
});

test('parseFrames rejects unmasked client frames', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  // Create unmasked frame (protocol violation)
  const frame = Buffer.from([0x81, 0x05, 0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
  
  try {
    manager.parseFrames(frame);
    throw new Error('Should have thrown error for unmasked frame');
  } catch (error) {
    assert(error.message.includes('Unmasked'), 'Should reject unmasked frames');
  }
});

test('parseFrames enforces control frame size limit', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  // Create close frame with payload > 125 bytes (protocol violation)
  const largePayload = 'A'.repeat(126);
  const maskKey = crypto.randomBytes(4);
  
  const frame = Buffer.allocUnsafe(6 + 126);
  frame[0] = 0x88; // FIN + Close opcode
  frame[1] = 0x80 | 126; // MASK bit + length
  maskKey.copy(frame, 2);
  
  for (let i = 0; i < 126; i++) {
    frame[6 + i] = largePayload.charCodeAt(i) ^ maskKey[i % 4];
  }
  
  try {
    manager.parseFrames(frame);
    throw new Error('Should have thrown error for oversized control frame');
  } catch (error) {
    assert(error.message.includes('Control frame payload too large'), 'Should reject oversized control frames');
  }
});

test('parseFrames enforces control frame fragmentation rule', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  // Create fragmented close frame (protocol violation)
  const frame = createMaskedFrame('test', 0x8, false); // Close opcode, FIN=false
  
  try {
    manager.parseFrames(frame);
    throw new Error('Should have thrown error for fragmented control frame');
  } catch (error) {
    assert(error.message.includes('Control frame must not be fragmented'), 'Should reject fragmented control frames');
  }
});

test('parseFrames handles multiple frames in single buffer', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  const frame1 = createMaskedFrame('Hello');
  const frame2 = createMaskedFrame('World');
  const combined = Buffer.concat([frame1, frame2]);
  
  const { frames, remaining } = manager.parseFrames(combined);
  assert(frames.length === 2, 'Should parse two frames');
  assert(frames[0].payload.toString('utf8') === 'Hello', 'First payload should be correct');
  assert(frames[1].payload.toString('utf8') === 'World', 'Second payload should be correct');
  assert(remaining.length === 0, 'No remaining data');
});

test('parseFrames enforces payload size limit', () => {
  const manager = new WebSocketManager({ 
    enableLogging: false,
    maxPayloadSize: 100 
  });
  
  // Create frame with extended length > maxPayloadSize
  const maskKey = crypto.randomBytes(4);
  const frame = Buffer.allocUnsafe(8);
  frame[0] = 0x81; // FIN + text opcode
  frame[1] = 0xFE; // MASK bit + 126 (16-bit length follows)
  frame.writeUInt16BE(200, 2); // Payload length = 200
  maskKey.copy(frame, 4);
  
  try {
    manager.parseFrames(frame);
    throw new Error('Should have thrown error for oversized payload');
  } catch (error) {
    assert(error.message.includes('Payload too large'), 'Should reject oversized payloads');
  }
});

// =============================================================================
// Test Suite 8: Statistics and Management
// =============================================================================

console.log('\n📦 Test Suite 8: Statistics and Management\n');

test('getStats returns correct statistics', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  manager.registerRoute('/api/ws/echo', 'handler.js');
  manager.registerRoute('/api/ws/chat', 'handler.js');
  
  const stats = manager.getStats();
  assert(stats.totalConnections === 0, 'Initial totalConnections should be 0');
  assert(stats.routes === 2, 'Should count registered routes');
});

test('broadcast sends to all connections', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  
  // Create mock connections
  const ws1 = { readyState: 1, sent: [], send: function(data) { this.sent.push(data); } };
  const ws2 = { readyState: 1, sent: [], send: function(data) { this.sent.push(data); } };
  
  manager.connections.set('conn1', ws1);
  manager.connections.set('conn2', ws2);
  
  manager.broadcast('test message');
  
  assert(ws1.sent.length === 1, 'First connection should receive message');
  assert(ws2.sent.length === 1, 'Second connection should receive message');
  assert(ws1.sent[0] === 'test message', 'Message should be correct');
});

test('broadcast respects filter function', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  
  const ws1 = { readyState: 1, room: 'lobby', sent: [], send: function(data) { this.sent.push(data); } };
  const ws2 = { readyState: 1, room: 'chat', sent: [], send: function(data) { this.sent.push(data); } };
  
  manager.connections.set('conn1', ws1);
  manager.connections.set('conn2', ws2);
  
  manager.broadcast('test', (ws) => ws.room === 'lobby');
  
  assert(ws1.sent.length === 1, 'Filtered connection should receive message');
  assert(ws2.sent.length === 0, 'Non-filtered connection should not receive message');
});

test('closeAll closes all connections', () => {
  const manager = new WebSocketManager({ enableLogging: false });
  
  const ws1 = { readyState: 1, closed: false, close: function() { this.closed = true; } };
  const ws2 = { readyState: 1, closed: false, close: function() { this.closed = true; } };
  
  manager.connections.set('conn1', ws1);
  manager.connections.set('conn2', ws2);
  
  manager.closeAll(1001, 'Server shutdown');
  
  assert(ws1.closed === true, 'First connection should be closed');
  assert(ws2.closed === true, 'Second connection should be closed');
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
