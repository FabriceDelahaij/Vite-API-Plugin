# Request ID Tracing Guide

Request ID tracing provides unique identifiers for each API request, enabling better debugging, logging, and request correlation across distributed systems.

## Features

- **Automatic ID Generation**: Generates unique request IDs for every API request
- **Header Propagation**: Accepts and propagates existing request IDs from clients
- **Multiple ID Formats**: Supports UUID, short, timestamp, and NanoID formats
- **Request Tracking**: Tracks active requests and maintains request history
- **Child Request IDs**: Create hierarchical IDs for sub-operations
- **Structured Logging**: Built-in logger with request ID context
- **Performance Metrics**: Track request duration and success rates

## Configuration

### Plugin Configuration

Add request ID configuration to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import apiRoutes from './vite-plugin-api-routes';

export default defineConfig({
  plugins: [
    apiRoutes({
      // ... other options
      
      requestId: {
        enabled: true,
        format: 'uuid', // 'uuid', 'short', 'timestamp', 'nanoid'
        prefix: 'req',
        headerName: 'X-Request-ID',
        includeInResponse: true,
        logRequestId: true,
      },
    }),
  ],
});
```

### Environment Variables

Configure request ID behavior via environment variables:

```bash
# Request ID format
REQUEST_ID_FORMAT=uuid

# Request ID prefix
REQUEST_ID_PREFIX=req

# Enable/disable logging
LOG_REQUEST_ID=true

# Include in response headers
INCLUDE_REQUEST_ID_IN_RESPONSE=true
```

## Request ID Formats

### UUID (Default)
```
req_550e8400-e29b-41d4-a716-446655440000
```
- Standard UUID v4 format
- Globally unique
- 36 characters (plus prefix)

### Short
```
req_a1b2c3d4e5f6g7h8
```
- 16-character hexadecimal
- Compact and URL-safe
- Good for logs

### Timestamp
```
req_l8x9k2-a1b2c3d4
```
- Timestamp-based with random suffix
- Sortable by creation time
- Useful for time-based analysis

### NanoID
```
req_V1StGXR8_Z5jdHi6B-myT
```
- URL-safe, 21 characters
- Collision-resistant
- Compact and readable

## Usage in API Handlers

### Basic Usage

```javascript
import { getRequestId } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const requestId = getRequestId(req);
  
  console.log(`Processing request: ${requestId}`);
  
  res.status(200).json({
    message: 'Success',
    requestId,
  });
}
```

### Structured Logging

```javascript
import { createRequestLogger } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req.requestId);
  
  logger.info('Starting request processing');
  logger.debug('User data', { userId: req.user?.id });
  
  try {
    // Your logic here
    logger.info('Request completed successfully');
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Request failed', { error: error.message });
    res.status(500).json({ error: 'Internal error' });
  }
}
```

### Child Request IDs

Create hierarchical request IDs for sub-operations:

```javascript
import { 
  getRequestId, 
  createChildRequestId 
} from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const requestId = getRequestId(req);
  
  // Create child IDs for different operations
  const dbRequestId = createChildRequestId(requestId, 'db');
  const cacheRequestId = createChildRequestId(requestId, 'cache');
  const apiRequestId = createChildRequestId(requestId, 'external-api');
  
  console.log(`[${dbRequestId}] Querying database...`);
  console.log(`[${cacheRequestId}] Checking cache...`);
  console.log(`[${apiRequestId}] Calling external API...`);
  
  res.status(200).json({
    requestId,
    operations: {
      database: dbRequestId,
      cache: cacheRequestId,
      externalApi: apiRequestId,
    },
  });
}
```

## Request Tracking

### Global Request Manager

Track active requests and view statistics:

```javascript
import { globalRequestIdManager } from '../../../src/lib/request-id.js';

// Get statistics
const stats = globalRequestIdManager.getStats();
console.log(stats);
// {
//   totalRequests: 1234,
//   activeRequests: 5,
//   averageDuration: 145,
//   successRate: '98.5%',
//   slowestRequest: 2500,
//   fastestRequest: 12
// }

// Get active requests
const active = globalRequestIdManager.getActiveRequests();
console.log(active);
// [
//   { requestId: 'req_...', method: 'GET', url: '/api/users', startTime: ... },
//   ...
// ]

// Get request history
const history = globalRequestIdManager.getHistory(50);
console.log(history);
```

### Manual Tracking

```javascript
import { globalRequestIdManager } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const requestId = req.requestId;
  
  // Start tracking (already done by middleware, but you can add metadata)
  globalRequestIdManager.startRequest(requestId, {
    userId: req.user?.id,
    endpoint: req.url,
  });
  
  try {
    // Your logic here
    
    // End tracking with success
    globalRequestIdManager.endRequest(requestId, {
      statusCode: 200,
      itemsProcessed: 42,
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    // End tracking with error
    globalRequestIdManager.endRequest(requestId, {
      statusCode: 500,
      error: error.message,
    });
    
    res.status(500).json({ error: 'Failed' });
  }
}
```

## Client-Side Usage

### Sending Request IDs

Clients can send their own request IDs:

```javascript
// JavaScript/TypeScript
fetch('/api/users', {
  headers: {
    'X-Request-ID': 'client_generated_id_123',
  },
});
```

```bash
# cURL
curl -H "X-Request-ID: my-custom-id" http://localhost:5173/api/users
```

### Receiving Request IDs

The server includes the request ID in response headers:

```javascript
fetch('/api/users')
  .then(response => {
    const requestId = response.headers.get('X-Request-ID');
    console.log('Request ID:', requestId);
    return response.json();
  });
```

## Monitoring Endpoint

View request ID statistics at the HMR status endpoint:

```bash
curl http://localhost:5173/__hmr_status
```

Response includes:
```json
{
  "requestId": {
    "enabled": true,
    "stats": {
      "totalRequests": 1234,
      "activeRequests": 5,
      "averageDuration": 145,
      "successRate": "98.5%",
      "slowestRequest": 2500,
      "fastestRequest": 12
    },
    "activeRequests": 5
  }
}
```

## Log Format

Request ID logs follow this format:

```
[2026-02-08T10:30:45.123Z] [req_550e8400-e29b-41d4-a716-446655440000] GET /api/users
[2026-02-08T10:30:45.234Z] [INFO] [req_550e8400-e29b-41d4-a716-446655440000] Processing request
[2026-02-08T10:30:45.345Z] [req_550e8400-e29b-41d4-a716-446655440000] GET /api/users - 200 (222ms)
```

## Best Practices

### 1. Always Use Request Logger

```javascript
// Good
const logger = createRequestLogger(req.requestId);
logger.info('User logged in', { userId: user.id });

// Avoid
console.log(`[${req.requestId}] User logged in`);
```

### 2. Create Child IDs for Sub-Operations

```javascript
// Good - hierarchical tracking
const dbId = createChildRequestId(requestId, 'db');
const cacheId = createChildRequestId(requestId, 'cache');

// Avoid - flat tracking
console.log(`[${requestId}] Database query`);
console.log(`[${requestId}] Cache lookup`);
```

### 3. Include Request ID in Error Context

```javascript
try {
  // Your logic
} catch (error) {
  logger.error('Operation failed', {
    error: error.message,
    stack: error.stack,
    userId: req.user?.id,
  });
  
  res.status(500).json({
    error: 'Internal error',
    requestId: req.requestId, // Include for client reference
  });
}
```

### 4. Propagate Request IDs to External Services

```javascript
// When calling external APIs
const response = await fetch('https://api.example.com/data', {
  headers: {
    'X-Request-ID': createChildRequestId(req.requestId, 'external'),
  },
});
```

## Integration with Error Tracking

Request IDs are automatically included in Sentry error context:

```javascript
// Errors captured with Sentry include request ID
captureError(error, {
  method: req.method,
  url: req.url,
  requestId: req.requestId, // Automatically included
});
```

## Performance Considerations

- Request ID generation is fast (< 1ms)
- Minimal memory overhead per request
- Automatic cleanup of old request history
- Configurable history size (default: 1000 requests)

## Troubleshooting

### Request ID Not Appearing in Logs

Check configuration:
```javascript
requestId: {
  enabled: true,
  logRequestId: true, // Must be true
}
```

### Request ID Not in Response Headers

Check configuration:
```javascript
requestId: {
  includeInResponse: true, // Must be true
}
```

### Invalid Request ID Format

The middleware validates incoming request IDs. Invalid IDs are rejected and new ones are generated. Valid format:
- 8-128 characters
- Alphanumeric, hyphens, underscores only

## Example API Endpoint

See `pages/api/examples/request-id-demo.js` for a complete example demonstrating:
- Request ID retrieval
- Structured logging
- Child request IDs
- Response formatting

Test it:
```bash
curl http://localhost:5173/api/examples/request-id-demo
```

## API Reference

### Functions

#### `generateRequestId(format, prefix)`
Generate a new request ID.

#### `extractRequestId(headers, config)`
Extract request ID from request headers.

#### `isValidRequestId(requestId)`
Validate request ID format.

#### `getRequestId(req)`
Get request ID from request object.

#### `createChildRequestId(parentRequestId, suffix)`
Create hierarchical child request ID.

#### `createRequestLogger(requestId)`
Create logger with request ID context.

#### `formatLogWithRequestId(requestId, level, message, metadata)`
Format log message with request ID.

### Classes

#### `RequestIdManager`
Manages request tracking and statistics.

Methods:
- `startRequest(requestId, metadata)`
- `endRequest(requestId, result)`
- `getRequest(requestId)`
- `getActiveRequests()`
- `getHistory(limit)`
- `getStats()`
- `clearHistory()`

### Middleware

#### `requestIdMiddleware(config)`
Node.js style middleware for request ID handling.

#### `createRequestIdHandler(config)`
Web API style handler for request ID handling.

## Related Documentation

- [DOCS.md](./DOCS.md) - Main documentation
- [AUTH-GUIDE.md](./AUTH-GUIDE.md) - Authentication
- [CACHE-GUIDE.md](./CACHE-GUIDE.md) - Response caching
- [TESTING-GUIDE.md](./TESTING-GUIDE.md) - Testing utilities
