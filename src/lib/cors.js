/**
 * CORS utilities and origin whitelisting
 */

/**
 * Create CORS configuration with origin whitelisting
 */
export function createCorsConfig(options = {}) {
  const {
    // Whitelist specific origins
    origins = [],
    
    // Allow credentials (cookies, authorization headers)
    credentials = true,
    
    // Allowed HTTP methods
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    
    // Allowed headers
    allowedHeaders = ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-API-Key'],
    
    // Exposed headers
    exposedHeaders = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    
    // Preflight cache duration (seconds)
    maxAge = 86400,
    
    // Custom origin validator
    originValidator = null,
  } = options;

  return {
    origin: (requestOrigin) => {
      // No origin (same-origin requests, curl, etc.)
      if (!requestOrigin) {
        return true;
      }

      // Custom validator
      if (originValidator) {
        return originValidator(requestOrigin);
      }

      // Wildcard (not recommended for production)
      if (origins.includes('*')) {
        return requestOrigin;
      }

      // Check whitelist
      if (origins.includes(requestOrigin)) {
        return requestOrigin;
      }

      // Pattern matching (e.g., *.example.com)
      for (const pattern of origins) {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          if (regex.test(requestOrigin)) {
            return requestOrigin;
          }
        }
      }

      return false;
    },
    credentials,
    methods,
    allowedHeaders,
    exposedHeaders,
    maxAge,
  };
}

/**
 * Environment-based CORS configuration
 */
export function createEnvCorsConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  // Development: Allow localhost
  if (env === 'development') {
    return createCorsConfig({
      origins: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ],
      credentials: true,
    });
  }

  // Production: Strict whitelist from environment
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  if (allowedOrigins.length === 0) {
    console.warn('⚠ WARNING: No ALLOWED_ORIGINS set in production!');
  }

  return createCorsConfig({
    origins: allowedOrigins,
    credentials: true,
  });
}

/**
 * Domain-based CORS configuration
 */
export function createDomainCorsConfig(domain) {
  return createCorsConfig({
    origins: [
      `https://${domain}`,
      `https://www.${domain}`,
      `https://*.${domain}`, // Subdomains
    ],
    credentials: true,
  });
}

/**
 * Multi-environment CORS configuration
 */
export function createMultiEnvCorsConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  const configs = {
    development: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
    ],
    staging: [
      'https://staging.example.com',
      'https://staging-app.example.com',
    ],
    production: [
      'https://example.com',
      'https://www.example.com',
      'https://app.example.com',
    ],
  };

  return createCorsConfig({
    origins: configs[env] || configs.development,
    credentials: true,
  });
}

/**
 * Validate origin against whitelist
 */
export function isOriginAllowed(origin, whitelist) {
  if (!origin) return true;
  if (whitelist.includes('*')) return true;
  if (whitelist.includes(origin)) return true;

  // Pattern matching
  for (const pattern of whitelist) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(origin)) return true;
    }
  }

  return false;
}

/**
 * Log CORS violations
 */
export function logCorsViolation(origin, allowedOrigins) {
  console.warn(`[CORS] Blocked request from origin: ${origin}`);
  console.warn(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
}

/**
 * CORS presets for common scenarios
 */
export const CorsPresets = {
  // Allow all (development only)
  allowAll: {
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },

  // Localhost only (development)
  localhost: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },

  // Same domain only (production)
  sameDomain: {
    origin: (origin) => {
      if (!origin) return true;
      const url = new URL(origin);
      return url.hostname === process.env.DOMAIN;
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },

  // API only (no credentials)
  apiOnly: {
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
  },

  // Strict production
  strictProduction: {
    origin: [], // Must be set via environment
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 600, // 10 minutes
  },
};

/**
 * Get CORS config based on environment
 */
export function getCorsConfig() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'development') {
    return CorsPresets.localhost;
  }

  if (env === 'production') {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    return {
      ...CorsPresets.strictProduction,
      origin: allowedOrigins,
    };
  }

  return CorsPresets.localhost;
}
