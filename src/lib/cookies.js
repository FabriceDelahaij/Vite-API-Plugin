/**
 * Secure cookie utilities
 * Implements best practices for cookie security
 */

/**
 * Cookie configuration presets
 */
export const CookiePresets = {
  // Secure session cookie (recommended for auth tokens)
  session: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 3600, // 1 hour
  },

  // Long-lived auth cookie
  auth: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 3600, // 7 days
  },

  // Remember me cookie
  rememberMe: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 24 * 3600, // 30 days
  },

  // CSRF token cookie (needs to be readable by JS)
  csrf: {
    httpOnly: false, // Must be readable by client
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  },

  // Tracking/analytics cookie (less strict)
  tracking: {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 3600, // 1 year
  },

  // Development cookie (less strict for localhost)
  development: {
    httpOnly: true,
    secure: false, // Allow HTTP in development
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  },
};

/**
 * Create secure cookie configuration
 */
export function createCookieConfig(options = {}) {
  const env = process.env.NODE_ENV || 'development';
  
  const defaults = {
    httpOnly: true,
    secure: env === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  };

  return { ...defaults, ...options };
}

/**
 * Serialize cookie with secure defaults
 */
export function serializeCookie(name, value, options = {}) {
  const config = createCookieConfig(options);
  
  // Validate cookie name
  if (!isValidCookieName(name)) {
    throw new Error(`Invalid cookie name: ${name}`);
  }

  // Validate cookie value
  if (!isValidCookieValue(value)) {
    throw new Error(`Invalid cookie value for: ${name}`);
  }

  let cookie = `${name}=${encodeURIComponent(value)}`;

  if (config.maxAge) {
    cookie += `; Max-Age=${config.maxAge}`;
  }

  if (config.expires) {
    cookie += `; Expires=${config.expires.toUTCString()}`;
  }

  if (config.path) {
    cookie += `; Path=${config.path}`;
  }

  if (config.domain) {
    cookie += `; Domain=${config.domain}`;
  }

  if (config.secure) {
    cookie += '; Secure';
  }

  if (config.httpOnly) {
    cookie += '; HttpOnly';
  }

  if (config.sameSite) {
    cookie += `; SameSite=${config.sameSite}`;
  }

  return cookie;
}

/**
 * Parse cookies from request header
 */
export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};

  const cookies = {};

  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });

  return cookies;
}

/**
 * Validate cookie name (RFC 6265)
 */
function isValidCookieName(name) {
  // Cookie name must not contain: ( ) < > @ , ; : \ " / [ ] ? = { } or whitespace
  return /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(name);
}

/**
 * Validate cookie value
 */
function isValidCookieValue(value) {
  // Cookie value must not contain: , ; \ " or whitespace (unless quoted)
  return /^[!#$%&'()*+\-.\/0-9:<=>?@A-Z\[\]^_`a-z{|}~]*$/.test(value);
}

/**
 * Clear/delete a cookie
 */
export function clearCookie(name, options = {}) {
  return serializeCookie(name, '', {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Cookie manager class
 */
export class CookieManager {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.cookies = parseCookies(req.headers.cookie);
  }

  /**
   * Get cookie value
   */
  get(name) {
    return this.cookies[name];
  }

  /**
   * Set secure cookie
   */
  set(name, value, options = {}) {
    const cookie = serializeCookie(name, value, options);
    
    // Handle multiple Set-Cookie headers
    const existing = this.res.getHeader('Set-Cookie') || [];
    const cookies = Array.isArray(existing) ? existing : [existing];
    cookies.push(cookie);
    
    this.res.setHeader('Set-Cookie', cookies);
    return this;
  }

  /**
   * Set session cookie (expires when browser closes)
   */
  setSession(name, value, options = {}) {
    return this.set(name, value, {
      ...CookiePresets.session,
      ...options,
      maxAge: undefined, // Session cookie
    });
  }

  /**
   * Set auth cookie
   */
  setAuth(name, value, options = {}) {
    return this.set(name, value, {
      ...CookiePresets.auth,
      ...options,
    });
  }

  /**
   * Clear cookie
   */
  clear(name, options = {}) {
    const cookie = clearCookie(name, options);
    this.res.setHeader('Set-Cookie', cookie);
    return this;
  }

  /**
   * Clear all cookies
   */
  clearAll() {
    Object.keys(this.cookies).forEach(name => {
      this.clear(name);
    });
    return this;
  }

  /**
   * Check if cookie exists
   */
  has(name) {
    return name in this.cookies;
  }
}

/**
 * Cookie security validator
 */
export class CookieSecurityValidator {
  static validate(options) {
    const warnings = [];
    const errors = [];

    // Check httpOnly for sensitive cookies
    if (!options.httpOnly && !options.name?.includes('csrf')) {
      warnings.push('Consider setting httpOnly: true for sensitive cookies');
    }

    // Check secure flag in production
    if (process.env.NODE_ENV === 'production' && !options.secure) {
      errors.push('secure: true is required in production');
    }

    // Check sameSite
    if (!options.sameSite) {
      warnings.push('sameSite attribute is recommended (strict, lax, or none)');
    }

    // Check maxAge/expires
    if (!options.maxAge && !options.expires) {
      warnings.push('Consider setting maxAge or expires for better control');
    }

    // Check domain
    if (options.domain && !options.domain.startsWith('.')) {
      warnings.push('Domain should start with . for subdomain support');
    }

    return { warnings, errors, isValid: errors.length === 0 };
  }

  static validateAndWarn(options) {
    const result = this.validate(options);
    
    result.warnings.forEach(warning => {
      console.warn(`[Cookie Security] ${warning}`);
    });

    result.errors.forEach(error => {
      console.error(`[Cookie Security] ${error}`);
    });

    return result.isValid;
  }
}

/**
 * Signed cookie utilities (for tamper protection)
 */
export class SignedCookie {
  constructor(secret) {
    this.secret = secret || process.env.COOKIE_SECRET;
    if (!this.secret) {
      throw new Error('COOKIE_SECRET is required for signed cookies');
    }
  }

  /**
   * Sign a cookie value
   */
  sign(value) {
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url');
    
    return `${value}.${signature}`;
  }

  /**
   * Verify and unsign a cookie value
   */
  unsign(signedValue) {
    const [value, signature] = signedValue.split('.');
    
    if (!value || !signature) {
      throw new Error('Invalid signed cookie format');
    }

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(value)
      .digest('base64url');

    if (signature !== expectedSignature) {
      throw new Error('Cookie signature verification failed');
    }

    return value;
  }
}

/**
 * Environment-aware cookie configuration
 */
export function getEnvironmentCookieConfig() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      domain: process.env.COOKIE_DOMAIN,
    };
  }

  if (env === 'development') {
    return {
      httpOnly: true,
      secure: false, // Allow HTTP in development
      sameSite: 'lax',
    };
  }

  return CookiePresets.development;
}
