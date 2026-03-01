/**
 * Request ID Demo API
 * Demonstrates request ID tracing and logging
 */

import { 
  getRequestId, 
  createRequestLogger,
  createChildRequestId 
} from '../../../src/lib/request-id.js';

export default async function handler(req, res) {
  // Get the request ID
  const requestId = getRequestId(req);
  
  // Create a logger with request ID
  const logger = createRequestLogger(requestId);
  
  logger.info('Processing request', { 
    method: req.method,
    path: req.url,
  });
  
  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Create child request IDs for sub-operations
  const dbRequestId = createChildRequestId(requestId, 'db');
  const cacheRequestId = createChildRequestId(requestId, 'cache');
  
  logger.debug('Simulating database query', { childRequestId: dbRequestId });
  logger.debug('Simulating cache lookup', { childRequestId: cacheRequestId });
  
  // Return response with request ID information
  res.status(200).json({
    message: 'Request ID demo',
    requestId,
    childRequests: {
      database: dbRequestId,
      cache: cacheRequestId,
    },
    timestamp: new Date().toISOString(),
    headers: {
      'X-Request-ID': req.headers['x-request-id'],
    },
  });
  
  logger.info('Request completed successfully');
}
