# Request ID Usage Examples

## Basic Configuration

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import apiRoutes from './vite-plugin-api-routes';

export default defineConfig({
  plugins: [
    apiRoutes({
      // ... other options
      
      // Request ID configuration
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

## Example 1: Basic Request ID Usage

```javascript
// pages/api/users/index.js
import { getRequestId } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const requestId = getRequestId(req);
  
  console.log(`[${requestId}] Fetching users`);
  
  // Your logic here
  const users = await fetchUsers();
  
  res.status(200).json({
    users,
    requestId, // Include in response for client reference
  });
}
```

## Example 2: Structured Logging

```javascript
// pages/api/orders/create.js
import { createRequestLogger } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req.requestId);
  
  logger.info('Creating new order', { 
    userId: req.user?.id,
    items: req.body.items?.length 
  });
  
  try {
    const order = await createOrder(req.body);
    logger.info('Order created successfully', { orderId: order.id });
    
    res.status(201).json({ order });
  } catch (error) {
    logger.error('Failed to create order', { 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({ 
      error: 'Failed to create order',
      requestId: req.requestId 
    });
  }
}
```

## Example 3: Child Request IDs

```javascript
// pages/api/analytics/report.js
import { 
  getRequestId, 
  createChildRequestId,
  createRequestLogger 
} from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const requestId = getRequestId(req);
  const logger = createRequestLogger(requestId);
  
  logger.info('Generating analytics report');
  
  // Create child IDs for different operations
  const dbRequestId = createChildRequestId(requestId, 'db');
  const cacheRequestId = createChildRequestId(requestId, 'cache');
  const apiRequestId = createChildRequestId(requestId, 'external');
  
  // Database query
  logger.debug('Querying database', { childRequestId: dbRequestId });
  const data = await queryDatabase(dbRequestId);
  
  // Cache check
  logger.debug('Checking cache', { childRequestId: cacheRequestId });
  const cached = await checkCache(cacheRequestId);
  
  // External API call
  logger.debug('Calling external API', { childRequestId: apiRequestId });
  const external = await callExternalAPI(apiRequestId);
  
  logger.info('Report generated successfully');
  
  res.status(200).json({
    report: { data, cached, external },
    requestId,
    operations: {
      database: dbRequestId,
      cache: cacheRequestId,
      externalApi: apiRequestId,
    },
  });
}
```

## Example 4: Request Tracking

```javascript
// pages/api/admin/stats.js
import { globalRequestIdManager } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  // Get request statistics
  const stats = globalRequestIdManager.getStats();
  
  // Get active requests
  const activeRequests = globalRequestIdManager.getActiveRequests();
  
  // Get recent history
  const recentRequests = globalRequestIdManager.getHistory(50);
  
  res.status(200).json({
    stats,
    activeRequests: activeRequests.length,
    recentRequests: recentRequests.slice(0, 10),
  });
}
```

## Example 5: Client-Side Usage

```javascript
// Frontend code
async function fetchUserData() {
  // Generate client-side request ID
  const clientRequestId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const response = await fetch('/api/users', {
    headers: {
      'X-Request-ID': clientRequestId,
    },
  });
  
  // Server will use this ID or generate a new one
  const serverRequestId = response.headers.get('X-Request-ID');
  
  console.log('Client Request ID:', clientRequestId);
  console.log('Server Request ID:', serverRequestId);
  
  return response.json();
}
```

## Example 6: Error Correlation

```javascript
// pages/api/payments/process.js
import { createRequestLogger } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req.requestId);
  
  try {
    logger.info('Processing payment', { 
      amount: req.body.amount,
      currency: req.body.currency 
    });
    
    const payment = await processPayment(req.body);
    
    logger.info('Payment processed', { 
      paymentId: payment.id,
      status: payment.status 
    });
    
    res.status(200).json({ payment });
    
  } catch (error) {
    // Log error with request ID for correlation
    logger.error('Payment processing failed', {
      error: error.message,
      code: error.code,
      amount: req.body.amount,
    });
    
    // Return request ID to client for support reference
    res.status(500).json({
      error: 'Payment processing failed',
      message: 'Please contact support with this request ID',
      requestId: req.requestId,
    });
  }
}
```

## Example 7: Monitoring Dashboard

```javascript
// pages/api/monitoring/requests.js
import { globalRequestIdManager } from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  const stats = globalRequestIdManager.getStats();
  const active = globalRequestIdManager.getActiveRequests();
  const history = globalRequestIdManager.getHistory(100);
  
  // Calculate additional metrics
  const errorRate = history.filter(r => r.statusCode >= 400).length / history.length;
  const avgDuration = stats.averageDuration;
  
  // Find slow requests
  const slowRequests = history
    .filter(r => r.duration > 1000)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);
  
  res.status(200).json({
    overview: {
      totalRequests: stats.totalRequests,
      activeRequests: stats.activeRequests,
      averageDuration: avgDuration,
      successRate: stats.successRate,
      errorRate: (errorRate * 100).toFixed(2) + '%',
    },
    active: active.map(r => ({
      requestId: r.requestId,
      method: r.method,
      url: r.url,
      duration: Date.now() - r.startTime,
    })),
    slowRequests: slowRequests.map(r => ({
      requestId: r.requestId,
      method: r.method,
      url: r.url,
      duration: r.duration,
      statusCode: r.statusCode,
    })),
  });
}
```

## Testing Request IDs

```javascript
// test/api/users.test.js
import { describe, it, expect } from 'vitest';

describe('User API with Request IDs', () => {
  it('should include request ID in response', async () => {
    const response = await fetch('/api/users');
    const requestId = response.headers.get('X-Request-ID');
    
    expect(requestId).toBeDefined();
    expect(requestId).toMatch(/^req_/);
  });
  
  it('should accept client request ID', async () => {
    const clientId = 'client-test-123';
    
    const response = await fetch('/api/users', {
      headers: {
        'X-Request-ID': clientId,
      },
    });
    
    const serverRequestId = response.headers.get('X-Request-ID');
    expect(serverRequestId).toBe(clientId);
  });
});
```

## Log Output Examples

With request ID enabled, your logs will look like:

```
[2026-02-08T10:30:45.123Z] [req_550e8400-e29b-41d4-a716-446655440000] GET /api/users
[2026-02-08T10:30:45.234Z] [INFO] [req_550e8400-e29b-41d4-a716-446655440000] Fetching users from database
[2026-02-08T10:30:45.345Z] [DEBUG] [req_550e8400-e29b-41d4-a716-446655440000.db.a1b2c3d4] Database query executed
[2026-02-08T10:30:45.456Z] [req_550e8400-e29b-41d4-a716-446655440000] GET /api/users - 200 (333ms)
```

This makes it easy to:
- Track a single request through your entire system
- Correlate logs across different services
- Debug issues by filtering logs by request ID
- Measure request performance
