# WebSocket Routes Guide

Complete guide to using WebSocket routes in your Vite API Routes application.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Creating WebSocket Routes](#creating-websocket-routes)
- [WebSocket API](#websocket-api)
- [Examples](#examples)
- [Client Connection](#client-connection)
- [Message Fragmentation](#message-fragmentation)
- [Security](#security)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

WebSocket support enables real-time, bidirectional communication between clients and your API routes. The framework provides:

- **File-based routing** - Same routing system as HTTP routes
- **Dynamic routes** - Support for parameterized WebSocket endpoints
- **Connection management** - Automatic ping/pong, connection limits
- **Type safety** - Full TypeScript support
- **Integration** - Works seamlessly with existing middleware

## Configuration

Enable WebSocket support in your `vite.config.js`:

```javascript
import apiRoutes from './vite-plugin-api-routes.js';

export default {
  plugins: [
    apiRoutes({
      websocket: {
        enabled: true,              // Enable WebSocket support
        maxConnections: 1000,       // Maximum concurrent connections
        pingInterval: 30000,        // Ping interval in ms (30s)
        pingTimeout: 5000,          // Ping timeout in ms (5s)
        maxPayloadSize: 1048576,    // Max message size (1MB)
      },
    }),
  ],
};
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable WebSocket support |
| `maxConnections` | number | `1000` | Maximum concurrent WebSocket connections |
| `pingInterval` | number | `30000` | Interval for sending ping frames (ms) |
| `pingTimeout` | number | `5000` | Timeout for pong response (ms) |
| `maxPayloadSize` | number | `1048576` | Maximum message payload size in bytes |

## Creating WebSocket Routes

WebSocket routes follow the same file-based routing as HTTP routes, but export a `WEBSOCKET` handler function.

### Basic WebSocket Route

Create a file in `pages/api/ws/`:

```javascript
// pages/api/ws/echo.js

export async function WEBSOCKET(ws, req) {
  console.log('Client connected:', ws.id);

  // Send welcome message
  ws.send('Welcome!');

  // Handle incoming messages
  ws.onmessage = (event) => {
    console.log('Received:', event.data);
    ws.send(`Echo: ${event.data}`);
  };

  // Handle close
  ws.onclose = (event) => {
    console.log('Client disconnected:', event.code);
  };

  // Handle errors
  ws.onerror = (event) => {
    console.error('Error:', event.error);
  };
}
```

### Dynamic WebSocket Routes

Use bracket notation for dynamic parameters:

```javascript
// pages/api/ws/[room].js

export async function WEBSOCKET(ws, req) {
  const roomId = ws.params.room; // Access dynamic parameter
  
  console.log(`Client joined room: ${roomId}`);
  
  ws.send(`Welcome to room ${roomId}`);
  
  ws.onmessage = (event) => {
    // Handle messages for this room
  };
}
```

## WebSocket API

### WebSocket Connection Object

The `ws` object passed to your handler provides:

#### Properties

- `id` (string) - Unique connection identifier
- `socket` (Socket) - Underlying Node.js socket
- `req` (IncomingMessage) - HTTP upgrade request
- `params` (object) - Dynamic route parameters
- `readyState` (number) - Connection state (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
- `isAlive` (boolean) - Connection health status

#### Methods

##### `send(data: string | object): void`

Send a message to the client. Objects are automatically JSON stringified.

```javascript
ws.send('Hello');
ws.send({ type: 'greeting', message: 'Hello' });
```

##### `json(data: any): void`

Send JSON data (alias for `send` with JSON.stringify).

```javascript
ws.json({ type: 'update', value: 42 });
```

##### `close(code?: number, reason?: string): void`

Close the connection with optional status code and reason.

```javascript
ws.close(1000, 'Normal closure');
ws.close(1008, 'Policy violation');
```

##### `ping(): void`

Send a ping frame to check connection health.

```javascript
ws.ping();
```

#### Event Handlers

##### `onmessage`

Called when a message is received from the client.

```javascript
ws.onmessage = (event) => {
  console.log('Data:', event.data);
  console.log('Type:', event.type); // 'text' or 'binary'
};
```

##### `onclose`

Called when the connection is closed.

```javascript
ws.onclose = (event) => {
  console.log('Code:', event.code);
  console.log('Reason:', event.reason);
};
```

##### `onerror`

Called when an error occurs.

```javascript
ws.onerror = (event) => {
  console.error('Error:', event.error);
};
```

## Examples

### Echo Server

Simple echo server that sends back received messages:

```javascript
// pages/api/ws/echo.js

export async function WEBSOCKET(ws, req) {
  ws.onmessage = (event) => {
    ws.send(`Echo: ${event.data}`);
  };
}
```

### Chat Room

Multi-user chat with broadcasting:

```javascript
// pages/api/ws/chat.js

const clients = new Set();

export async function WEBSOCKET(ws, req) {
  clients.add(ws);
  
  broadcast({ type: 'join', userId: ws.id });

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    broadcast({ type: 'message', userId: ws.id, text: data.text });
  };

  ws.onclose = () => {
    clients.delete(ws);
    broadcast({ type: 'leave', userId: ws.id });
  };
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}
```

### Real-time Data Stream

Stream data to clients at intervals:

```javascript
// pages/api/ws/stream.js

export async function WEBSOCKET(ws, req) {
  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.json({
        timestamp: Date.now(),
        data: Math.random(),
      });
    }
  }, 1000);

  ws.onclose = () => {
    clearInterval(interval);
  };
}
```

### Authenticated WebSocket

Require authentication before accepting connection:

```javascript
// pages/api/ws/private.js

export async function WEBSOCKET(ws, req) {
  // Check authentication
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  
  if (!isValidToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  const user = getUserFromToken(token);
  
  ws.send(`Welcome ${user.name}`);
  
  ws.onmessage = (event) => {
    // Handle authenticated user messages
  };
}

function isValidToken(token) {
  // Your authentication logic
  return token === 'valid-token';
}

function getUserFromToken(token) {
  return { name: 'User' };
}
```

## Client Connection

### JavaScript/Browser

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/api/ws/echo');

// Connection opened
ws.onopen = () => {
  console.log('Connected');
  ws.send('Hello server!');
};

// Receive messages
ws.onmessage = (event) => {
  console.log('Received:', event.data);
};

// Connection closed
ws.onclose = (event) => {
  console.log('Disconnected:', event.code, event.reason);
};

// Error handling
ws.onerror = (error) => {
  console.error('Error:', error);
};
```

### With Query Parameters

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws/chat?room=general&token=abc123');
```

### Dynamic Routes

```javascript
const roomId = 'lobby';
const ws = new WebSocket(`ws://localhost:3000/api/ws/${roomId}`);
```

### Node.js Client

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/api/ws/echo');

ws.on('open', () => {
  ws.send('Hello');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});
```

## Message Fragmentation

The WebSocket implementation fully supports message fragmentation per RFC 6455 Section 5.4, allowing large messages to be split across multiple frames.

### What is Fragmentation?

WebSocket fragmentation allows a single logical message to be split into multiple frames. This is handled transparently by both the client and server.

**Example:**
```
Message: "Hello World" (large message)

Frame 1: FIN=0, opcode=0x1 (text), payload="Hello "
Frame 2: FIN=0, opcode=0x0 (continuation), payload="Wor"
Frame 3: FIN=1, opcode=0x0 (continuation), payload="ld"
```

### Why Fragmentation Matters

1. **Large messages** - Split messages that exceed buffer sizes
2. **Streaming** - Send data as it becomes available
3. **Memory efficiency** - Process data in chunks
4. **Network optimization** - Better flow control

### How It Works

The implementation automatically handles fragmentation:

**Client side (Browser):**
```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws/echo');

ws.onopen = () => {
  // Send large message - browser may fragment automatically
  const largeMessage = 'x'.repeat(100000); // 100KB
  ws.send(largeMessage);
};
```

**Server side:**
```javascript
export async function WEBSOCKET(ws, req) {
  ws.onmessage = (event) => {
    // event.data contains the complete message
    // Fragmentation is handled transparently
    console.log('Complete message:', event.data);
    console.log('Size:', event.data.length);
  };
}
```

### Frame Types

| Opcode | Type | FIN | Description |
|--------|------|-----|-------------|
| 0x1 | Text | 0 | First frame of fragmented text message |
| 0x1 | Text | 1 | Complete text message (single frame) |
| 0x2 | Binary | 0 | First frame of fragmented binary message |
| 0x2 | Binary | 1 | Complete binary message (single frame) |
| 0x0 | Continuation | 0 | Middle frame of fragmented message |
| 0x0 | Continuation | 1 | Final frame of fragmented message |

### Size Limits

Configure maximum message size:

```javascript
// vite.config.js
apiRoutes({
  websocket: {
    maxPayloadSize: 1024 * 1024, // 1MB per frame and total message
  },
})
```

**Important:** Both individual frames and complete fragmented messages are limited by `maxPayloadSize`.

### Control Frames

Control frames (ping, pong, close) MUST NOT be fragmented and can be interleaved:

```javascript
// Valid sequence
Frame 1: FIN=0, opcode=0x1, payload="Hello"
Frame 2: FIN=1, opcode=0x9, payload=""        // Ping (interleaved)
Frame 3: FIN=1, opcode=0x0, payload=" World"  // Continuation
```

### Error Handling

The implementation validates fragmentation sequences:

**Unexpected continuation frame:**
```javascript
// Error: Continuation frame without initial frame
Result: Connection closed with code 1002 (Protocol error)
```

**Interrupted fragmentation:**
```javascript
// Error: New message before previous finished
Result: Connection closed with code 1002 (Protocol error)
```

**Message too large:**
```javascript
// Error: Total size exceeds limit
Result: Connection closed with code 1009 (Message too big)
```

### Best Practices for Fragmentation

1. **Let clients handle it** - Browser WebSocket API automatically fragments large messages
2. **Set appropriate limits** - Balance memory usage and message size needs
3. **Monitor message sizes** - Log warnings for unusually large messages
4. **Handle errors gracefully** - Implement proper error handling for size limits

## Security

Security is critical for WebSocket applications. This implementation includes comprehensive security features and follows RFC 6455 requirements.

### RFC 6455 Compliance

#### Client Frame Masking (REQUIRED)

Per RFC 6455 Section 5.1, all client-to-server frames MUST be masked. This is automatically enforced.

**Why masking is required:**
- Prevents cache poisoning attacks
- Protects against proxy vulnerabilities
- Required by WebSocket protocol specification

**For developers:**
- ✅ Browser WebSocket API automatically masks frames (no action needed)
- ✅ Standard WebSocket libraries handle masking automatically
- ❌ Custom implementations must implement masking
- ⚠️ Unmasked frames are rejected with code 1002 (Protocol Error)

#### Protocol Header Validation (REQUIRED)

All required WebSocket headers are validated during handshake:

1. **Sec-WebSocket-Version**: Must be "13"
2. **Upgrade**: Must be "websocket"
3. **Connection**: Must include "Upgrade"
4. **Sec-WebSocket-Key**: Must be present

**Invalid requests receive appropriate HTTP error responses:**
- 426 Upgrade Required (version mismatch)
- 400 Bad Request (missing/invalid headers)

#### UTF-8 Validation (REQUIRED)

Text frames must contain valid UTF-8 per RFC 6455 Section 8.1:

```javascript
// Automatic validation
// Invalid UTF-8 closes connection with code 1007
```

### Security Features

#### 1. Connection Limits

Prevent DoS attacks by limiting concurrent connections:

```javascript
// vite.config.js
apiRoutes({
  websocket: {
    maxConnections: 1000, // Adjust based on your needs
  },
})
```

**Per-user limits:**
```javascript
const userConnections = new Map();

export async function WEBSOCKET(ws, req) {
  const userId = getUserId(req);
  
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  
  const connections = userConnections.get(userId);
  
  if (connections.size >= 5) {
    ws.close(1008, 'Too many connections');
    return;
  }
  
  connections.add(ws);
  
  ws.onclose = () => {
    connections.delete(ws);
  };
}
```

#### 2. Payload Size Limits

Prevent memory exhaustion attacks:

```javascript
// vite.config.js
apiRoutes({
  websocket: {
    maxPayloadSize: 1024 * 1024, // 1MB default
  },
})
```

#### 3. Authentication

Always authenticate WebSocket connections:

```javascript
export async function WEBSOCKET(ws, req) {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  
  if (!validateToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  const user = getUserFromToken(token);
  ws.send(`Welcome ${user.name}`);
  
  ws.onmessage = (event) => {
    // Handle authenticated user messages
  };
}
```

**Best practices:**
- Validate tokens before accepting connection
- Use secure token transmission (query params or headers)
- Implement token expiration
- Close connection immediately on auth failure

#### 4. Origin Validation

Prevent Cross-Site WebSocket Hijacking (CSWSH):

```javascript
export async function WEBSOCKET(ws, req) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://yourdomain.com',
    'https://app.yourdomain.com'
  ];
  
  if (!allowedOrigins.includes(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  
  // Continue with connection
}
```

#### 5. Input Validation

Always validate incoming messages:

```javascript
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    
    // Validate message structure
    if (!data.type || typeof data.type !== 'string') {
      ws.json({ error: 'Invalid message format' });
      return;
    }
    
    // Validate message content
    if (data.type === 'message' && !data.content) {
      ws.json({ error: 'Message content required' });
      return;
    }
    
    // Sanitize user input
    const sanitized = sanitizeInput(data.content);
    
    // Process valid message
    handleMessage({ ...data, content: sanitized });
  } catch (error) {
    ws.json({ error: 'Invalid JSON' });
  }
};
```

#### 6. Rate Limiting

Prevent message flooding:

```javascript
const messageRates = new Map();
const RATE_LIMIT = 100; // messages per minute
const RATE_WINDOW = 60000; // 1 minute

ws.onmessage = (event) => {
  const now = Date.now();
  const rate = messageRates.get(ws.id) || { count: 0, resetAt: now + RATE_WINDOW };
  
  if (now > rate.resetAt) {
    rate.count = 0;
    rate.resetAt = now + RATE_WINDOW;
  }
  
  rate.count++;
  messageRates.set(ws.id, rate);
  
  if (rate.count > RATE_LIMIT) {
    ws.close(1008, 'Rate limit exceeded');
    return;
  }
  
  // Process message
};
```

#### 7. Connection Timeout

Implement connection timeouts:

```javascript
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function WEBSOCKET(ws, req) {
  let lastActivity = Date.now();
  
  const timeoutCheck = setInterval(() => {
    if (Date.now() - lastActivity > CONNECTION_TIMEOUT) {
      ws.close(1001, 'Connection timeout');
      clearInterval(timeoutCheck);
    }
  }, 60000); // Check every minute
  
  ws.onmessage = (event) => {
    lastActivity = Date.now();
    // Handle message
  };
  
  ws.onclose = () => {
    clearInterval(timeoutCheck);
  };
}
```

#### 8. Resource Cleanup

Always clean up resources:

```javascript
export async function WEBSOCKET(ws, req) {
  const interval = setInterval(() => {
    ws.send('ping');
  }, 30000);
  
  const subscription = subscribeToEvents((event) => {
    ws.json(event);
  });
  
  // Clean up on close
  ws.onclose = () => {
    clearInterval(interval);
    subscription.unsubscribe();
    // Remove from collections
    // Close database connections
    // Cancel pending operations
  };
}
```

### Common Vulnerabilities

#### Cross-Site WebSocket Hijacking (CSWSH)

**Attack:** Attacker tricks user's browser into opening WebSocket connection to your server.

**Prevention:**
- Validate Origin header
- Use authentication tokens
- Implement CSRF-like tokens for WebSocket connections

#### Denial of Service (DoS)

**Attack:** Overwhelming server with connections or messages.

**Prevention:**
- Connection limits
- Rate limiting
- Payload size limits
- Connection timeouts

#### Message Injection

**Attack:** Sending malicious data in messages.

**Prevention:**
- Input validation
- Output encoding
- Content Security Policy
- Sanitize all user input

#### Resource Exhaustion

**Attack:** Keeping connections open without activity.

**Prevention:**
- Implement ping/pong
- Connection timeouts
- Maximum connection duration
- Resource cleanup

### Security Checklist

Before deploying to production:

- [ ] Authentication implemented
- [ ] Origin validation enabled
- [ ] Rate limiting configured
- [ ] Payload size limits set
- [ ] Connection limits configured
- [ ] Input validation on all messages
- [ ] Resource cleanup on disconnect
- [ ] Error handling implemented
- [ ] Logging and monitoring enabled
- [ ] HTTPS/WSS in production
- [ ] Token expiration implemented
- [ ] Connection timeouts configured

### Monitoring Security

Monitor WebSocket security metrics:

```javascript
// Check stats endpoint
fetch('http://localhost:3000/__hmr_status')
  .then(r => r.json())
  .then(data => {
    console.log('WebSocket stats:', data.websocket);
    // Monitor: errors, activeConnections, messagesReceived
  });
```

**Key metrics to monitor:**
- Active connections
- Error rate
- Messages per second
- Connection duration
- Failed authentication attempts

## Best Practices

### 1. Connection Limits

Implement per-user connection limits:

```javascript
const userConnections = new Map();

export async function WEBSOCKET(ws, req) {
  const userId = getUserId(req);
  
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  
  const connections = userConnections.get(userId);
  
  if (connections.size >= 5) {
    ws.close(1008, 'Too many connections');
    return;
  }
  
  connections.add(ws);
  
  ws.onclose = () => {
    connections.delete(ws);
  };
}
```

### 2. Message Validation

Always validate incoming messages:

```javascript
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    
    if (!data.type || !data.payload) {
      ws.json({ error: 'Invalid message format' });
      return;
    }
    
    // Process valid message
    handleMessage(data);
  } catch (error) {
    ws.json({ error: 'Invalid JSON' });
  }
};
```

### 3. Resource Cleanup

Clean up resources on disconnect:

```javascript
export async function WEBSOCKET(ws, req) {
  const interval = setInterval(() => {
    ws.send('ping');
  }, 5000);
  
  const subscription = subscribeToEvents((event) => {
    ws.json(event);
  });
  
  ws.onclose = () => {
    clearInterval(interval);
    subscription.unsubscribe();
  };
}
```

### 4. Error Handling

Handle errors gracefully:

```javascript
ws.onerror = (event) => {
  console.error('WebSocket error:', event.error);
  
  // Notify monitoring service
  captureError(event.error, { connectionId: ws.id });
  
  // Close connection
  ws.close(1011, 'Internal error');
};
```

### 5. Rate Limiting

Implement message rate limiting:

```javascript
const messageRates = new Map();

ws.onmessage = (event) => {
  const now = Date.now();
  const rate = messageRates.get(ws.id) || { count: 0, resetAt: now + 60000 };
  
  if (now > rate.resetAt) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  
  rate.count++;
  messageRates.set(ws.id, rate);
  
  if (rate.count > 100) {
    ws.close(1008, 'Rate limit exceeded');
    return;
  }
  
  // Process message
};
```

## Troubleshooting

### Connection Fails

**Problem**: WebSocket connection fails to establish

**Solutions**:
- Verify WebSocket is enabled in config
- Check that route file exports `WEBSOCKET` function
- Ensure server is running and accessible
- Check for proxy/firewall blocking WebSocket connections

### Messages Not Received

**Problem**: Messages sent but not received

**Solutions**:
- Check `readyState` before sending: `if (ws.readyState === 1)`
- Verify message format (text vs binary)
- Check for errors in browser console
- Ensure proper event handler setup

### Connection Drops

**Problem**: Connections drop unexpectedly

**Solutions**:
- Implement proper ping/pong handling
- Check network stability
- Verify server resources (memory, CPU)
- Review connection timeout settings

### Memory Leaks

**Problem**: Memory usage grows over time

**Solutions**:
- Clean up event listeners on close
- Remove connections from collections
- Clear intervals and timeouts
- Implement connection limits

### Protocol Error (Code 1002)

**Problem**: Connection closes immediately with code 1002

**Solutions**:
- **Most common**: Client frames must be masked per RFC 6455 (browser WebSocket API handles this automatically)
- If using custom WebSocket client, ensure masking is enabled
- Check for malformed frames or invalid opcodes
- Verify payload length encoding is correct
- Browser clients should work without issues (masking is automatic)

## WebSocket Status Codes

Common close codes:

| Code | Name | Description |
|------|------|-------------|
| 1000 | Normal Closure | Successful operation |
| 1001 | Going Away | Server shutdown or browser navigation |
| 1002 | Protocol Error | Protocol violation |
| 1003 | Unsupported Data | Unsupported data type |
| 1006 | Abnormal Closure | Connection lost without close frame |
| 1008 | Policy Violation | Policy violation (e.g., auth failure) |
| 1011 | Internal Error | Server error |

## Next Steps

- Review [Quick Start Guide](./WEBSOCKET-QUICKSTART.md) for getting started in 5 minutes
- Check [Implementation Summary](./WEBSOCKET-IMPLEMENTATION-SUMMARY.md) for architecture details
- See [Security Fixes Summary](./WEBSOCKET-SECURITY-FIXES-SUMMARY.md) for RFC 6455 compliance details
- Review [example routes](./pages/api/ws/) for more patterns
- Check [API types](./src/types/api.ts) for TypeScript definitions
- Monitor [HMR status endpoint](http://localhost:3000/__hmr_status) for WebSocket stats

## Additional Resources

- [RFC 6455 - WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [OWASP WebSocket Security](https://owasp.org/www-community/vulnerabilities/WebSocket_security)
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

## Support

For issues or questions:
- Start with the [Quick Start Guide](./WEBSOCKET-QUICKSTART.md)
- Review this complete guide
- Check example implementations in `pages/api/ws/`
- Test with the test client at `/websocket-test.html`
- Verify configuration settings
- Check server logs for errors
