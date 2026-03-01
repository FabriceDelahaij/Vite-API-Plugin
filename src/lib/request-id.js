/**
 * Request ID Tracing Middleware
 * Generates and tracks unique request IDs for debugging and correlation
 */

import crypto from 'crypto';

/**
 * Request ID configuration
 */
export const RequestIdConfig = {
  // Header name for request ID
  headerName: 'X-Request-ID',
  
  // Alternative header names to check
  alternativeHeaders: [
    'X-Request-Id',
    'X-Correlation-ID',
    'X-Correlation-Id',
    'Request-ID',
    'Request-Id',
  ],
  
  // ID format: 'uuid' or 'short'
  format: 'uuid',
  
  // Prefix for generated IDs
  prefix: 'req',
  
  // Include in response headers
  includeInResponse: true,
  
  // Log request ID
  logRequestId: true,
};

/**
 * Generate a unique request ID
 */
export function generateRequestId(format = 'uuid', prefix = '') {
  let id;

  switch (format) {
    case 'uuid':
      // Standard UUID v4
      id = crypto.randomUUID();
      break;

    case 'short':
      // Short alphanumeric ID (16 chars)
      id = crypto.randomBytes(8).toString('hex');
      break;

    case 'timestamp':
      // Timestamp-based ID with random suffix
      const timestamp = Date.now().toString(36);
      const random = crypto.randomBytes(4).toString('hex');
      id = `${timestamp}-${random}`;
      break;

    case 'nanoid':
      // NanoID-style (URL-safe, 21 chars)
      const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      const bytes = crypto.randomBytes(21);
      id = Array.from(bytes)
        .map(byte => alphabet[byte % alphabet.length])
        .join('');
      break;

    default:
      id = crypto.randomUUID();
  }

  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Extract request ID from headers
 */
export function extractRequestId(headers, config = RequestIdConfig) {
  // Check primary header
  let requestId = headers[config.headerName.toLowerCase()];
  if (requestId) {
    return requestId;
  }

  // Check alternative headers
  for (const altHeader of config.alternativeHeaders) {
    requestId = headers[altHeader.toLowerCase()];
    if (requestId) {
      return requestId;
    }
  }

  return null;
}

/**
 * Validate request ID format
 */
export function isValidRequestId(requestId) {
  if (!requestId || typeof requestId !== 'string') {
    return false;
  }

  // Check length (reasonable bounds)
  if (requestId.length < 8 || requestId.length > 128) {
    return false;
  }

  // Check for valid characters (alphanumeric, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(requestId);
}

/**
 * Request ID middleware for Node.js style handlers
 */
export function requestIdMiddleware(config = RequestIdConfig) {
  return (req, res, next) => {
    // Try to extract existing request ID from headers
    let requestId = extractRequestId(req.headers, config);

    // Validate existing request ID
    if (requestId && !isValidRequestId(requestId)) {
      console.warn(`[RequestID] Invalid request ID format: ${requestId}`);
      requestId = null;
    }

    // Generate new request ID if not present or invalid
    if (!requestId) {
      requestId = generateRequestId(config.format, config.prefix);
    }

    // Attach to request object
    req.requestId = requestId;

    // Add to response headers
    if (config.includeInResponse) {
      res.setHeader(config.headerName, requestId);
    }

    // Log request ID
    if (config.logRequestId) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${requestId}] ${req.method} ${req.url}`);
    }

    // Track request start time for duration logging
    req._startTime = Date.now();

    // Log response on finish
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - req._startTime;
      if (config.logRequestId) {
        const timestamp = new Date().toISOString();
        console.log(
          `[${timestamp}] [${requestId}] ${req.method} ${req.url} - ` +
          `${res.statusCode} (${duration}ms)`
        );
      }
      return originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Request ID middleware for Web API style handlers
 */
export function createRequestIdHandler(config = RequestIdConfig) {
  return async (request, handler) => {
    // Try to extract existing request ID from headers
    let requestId = extractRequestId(
      Object.fromEntries(request.headers.entries()),
      config
    );

    // Validate existing request ID
    if (requestId && !isValidRequestId(requestId)) {
      console.warn(`[RequestID] Invalid request ID format: ${requestId}`);
      requestId = null;
    }

    // Generate new request ID if not present or invalid
    if (!requestId) {
      requestId = generateRequestId(config.format, config.prefix);
    }

    // Attach to request object (non-standard but useful)
    Object.defineProperty(request, 'requestId', {
      value: requestId,
      writable: false,
      enumerable: true,
    });

    // Log request
    if (config.logRequestId) {
      const timestamp = new Date().toISOString();
      const url = new URL(request.url);
      console.log(`[${timestamp}] [${requestId}] ${request.method} ${url.pathname}`);
    }

    // Track request start time
    const startTime = Date.now();

    // Call the handler
    const response = await handler(request);

    // Add request ID to response headers
    if (config.includeInResponse) {
      response.headers.set(config.headerName, requestId);
    }

    // Log response
    if (config.logRequestId) {
      const duration = Date.now() - startTime;
      const timestamp = new Date().toISOString();
      const url = new URL(request.url);
      console.log(
        `[${timestamp}] [${requestId}] ${request.method} ${url.pathname} - ` +
        `${response.status} (${duration}ms)`
      );
    }

    return response;
  };
}

/**
 * Request ID manager for tracking active requests
 */
export class RequestIdManager {
  constructor() {
    this.activeRequests = new Map();
    this.requestHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Start tracking a request
   */
  startRequest(requestId, metadata = {}) {
    this.activeRequests.set(requestId, {
      requestId,
      startTime: Date.now(),
      ...metadata,
    });
  }

  /**
   * End tracking a request
   */
  endRequest(requestId, result = {}) {
    const request = this.activeRequests.get(requestId);
    if (request) {
      const duration = Date.now() - request.startTime;

      // Add to history
      this.requestHistory.push({
        ...request,
        ...result,
        duration,
        endTime: Date.now(),
      });

      // Limit history size
      if (this.requestHistory.length > this.maxHistorySize) {
        this.requestHistory.shift();
      }

      // Remove from active requests
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Get active request info
   */
  getRequest(requestId) {
    return this.activeRequests.get(requestId);
  }

  /**
   * Get all active requests
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Get request history
   */
  getHistory(limit = 100) {
    return this.requestHistory.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const history = this.requestHistory;
    
    if (history.length === 0) {
      return {
        totalRequests: 0,
        activeRequests: this.activeRequests.size,
        averageDuration: 0,
        successRate: 0,
      };
    }

    const totalDuration = history.reduce((sum, req) => sum + (req.duration || 0), 0);
    const successCount = history.filter(req => req.statusCode && req.statusCode < 400).length;

    return {
      totalRequests: history.length,
      activeRequests: this.activeRequests.size,
      averageDuration: Math.round(totalDuration / history.length),
      successRate: ((successCount / history.length) * 100).toFixed(2) + '%',
      slowestRequest: Math.max(...history.map(req => req.duration || 0)),
      fastestRequest: Math.min(...history.map(req => req.duration || 0)),
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.requestHistory = [];
  }
}

/**
 * Global request ID manager instance
 */
export const globalRequestIdManager = new RequestIdManager();

/**
 * Decorator to add request ID to API handlers
 */
export function withRequestId(config = RequestIdConfig) {
  return function(handler) {
    return async function(request) {
      const requestIdHandler = createRequestIdHandler(config);
      return requestIdHandler(request, handler);
    };
  };
}

/**
 * Get request ID from context (for use in nested functions)
 */
export function getRequestId(req) {
  return req.requestId || req.headers?.['x-request-id'] || 'unknown';
}

/**
 * Create child request ID for sub-requests
 */
export function createChildRequestId(parentRequestId, suffix = '') {
  const childId = crypto.randomBytes(4).toString('hex');
  return suffix 
    ? `${parentRequestId}.${suffix}.${childId}`
    : `${parentRequestId}.${childId}`;
}

/**
 * Format log message with request ID
 */
export function formatLogWithRequestId(requestId, level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length > 0 
    ? ' ' + JSON.stringify(metadata)
    : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${requestId}] ${message}${metaStr}`;
}

/**
 * Create a logger that includes request ID
 */
export function createRequestLogger(requestId) {
  return {
    debug: (message, metadata) => 
      console.debug(formatLogWithRequestId(requestId, 'debug', message, metadata)),
    info: (message, metadata) => 
      console.log(formatLogWithRequestId(requestId, 'info', message, metadata)),
    warn: (message, metadata) => 
      console.warn(formatLogWithRequestId(requestId, 'warn', message, metadata)),
    error: (message, metadata) => 
      console.error(formatLogWithRequestId(requestId, 'error', message, metadata)),
  };
}

/**
 * Environment-based configuration
 */
export function getRequestIdConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  return {
    ...RequestIdConfig,
    format: process.env.REQUEST_ID_FORMAT || 'uuid',
    prefix: process.env.REQUEST_ID_PREFIX || 'req',
    logRequestId: env === 'development' || process.env.LOG_REQUEST_ID === 'true',
    includeInResponse: process.env.INCLUDE_REQUEST_ID_IN_RESPONSE !== 'false',
  };
}
