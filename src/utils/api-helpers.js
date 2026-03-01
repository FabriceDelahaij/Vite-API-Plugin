// JavaScript utility functions for API routes

/**
 * Create a JSON response with proper headers
 */
export function createJsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(error, status = 400, message, field) {
  const errorResponse = {
    error,
    message,
    field,
  };
  
  return createJsonResponse(errorResponse, status);
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(data, message, status = 200) {
  const successResponse = {
    success: true,
    data,
    message,
  };
  
  return createJsonResponse(successResponse, status);
}

/**
 * Extract route parameters from URL path
 */
export function extractRouteParams(url) {
  const pathParts = new URL(url).pathname.split('/').filter(Boolean);
  const params = {};
  
  // Simple parameter extraction (for [id] style routes)
  // In a real implementation, you'd match against route patterns
  if (pathParts.length > 0) {
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart) {
      params.id = lastPart;
    }
  }
  
  return params;
}

/**
 * Parse query parameters from URL
 */
export function parseQueryParams(url) {
  const searchParams = new URL(url).searchParams;
  const params = {};
  
  for (const [key, value] of searchParams.entries()) {
    if (params[key]) {
      // Handle multiple values for same key
      if (Array.isArray(params[key])) {
        params[key].push(value);
      } else {
        params[key] = [params[key], value];
      }
    } else {
      params[key] = value;
    }
  }
  
  return params;
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate required fields
 */
export function validateRequired(data, requiredFields) {
  const errors = [];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      errors.push({
        field,
        message: `${field} is required`,
        value: data[field],
      });
    }
  }
  
  return errors;
}

/**
 * Validate string length
 */
export function validateStringLength(value, field, min = 0, max = Infinity) {
  if (value.length < min) {
    return {
      field,
      message: `${field} must be at least ${min} characters`,
      value,
    };
  }
  
  if (value.length > max) {
    return {
      field,
      message: `${field} must be no more than ${max} characters`,
      value,
    };
  }
  
  return null;
}

/**
 * Create secure cookie string
 */
export function createCookieString(name, value, options = {}) {
  const defaults = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  };
  
  const opts = { ...defaults, ...options };
  let cookie = `${name}=${value}`;
  
  if (opts.maxAge) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.expires) cookie += `; Expires=${opts.expires.toUTCString()}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.domain) cookie += `; Domain=${opts.domain}`;
  if (opts.secure) cookie += '; Secure';
  if (opts.httpOnly) cookie += '; HttpOnly';
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  
  return cookie;
}

/**
 * Parse pagination parameters
 */
export function parsePagination(url) {
  const searchParams = new URL(url).searchParams;
  
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
}

/**
 * Create pagination response
 */
export function createPaginationResponse(data, total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Safe JSON parsing
 */
export async function safeJsonParse(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  constructor(windowMs = 15 * 60 * 1000, maxRequests = 100) {
    this.requests = new Map();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }
  
  isAllowed(identifier) {
    const now = Date.now();
    const record = this.requests.get(identifier);
    
    if (!record || now > record.resetTime) {
      const resetTime = now + this.windowMs;
      this.requests.set(identifier, { count: 1, resetTime });
      return { allowed: true, remaining: this.maxRequests - 1, resetTime };
    }
    
    if (record.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetTime: record.resetTime };
    }
    
    record.count++;
    return { 
      allowed: true, 
      remaining: this.maxRequests - record.count, 
      resetTime: record.resetTime 
    };
  }
}
