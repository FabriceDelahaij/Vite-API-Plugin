/**
 * Authentication utilities for API routes
 * Supports JWT, API keys, and session-based authentication
 */

import crypto from 'crypto';

// ============================================================================
// JWT Authentication
// ============================================================================

/**
 * Simple JWT implementation (for production, use jsonwebtoken package)
 */
export class JWT {
  constructor(secret) {
    this.secret = secret || process.env.JWT_SECRET;
    if (!this.secret) {
      throw new Error('JWT_SECRET is required');
    }
  }

  /**
   * Create a JWT token
   */
  sign(payload, expiresIn = '24h') {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    
    // Parse expiresIn (e.g., '24h', '7d', '60s')
    const expiry = this._parseExpiry(expiresIn);
    
    const claims = {
      ...payload,
      iat: now,
      exp: now + expiry,
    };

    const encodedHeader = this._base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this._base64UrlEncode(JSON.stringify(claims));
    const signature = this._sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a JWT token
   */
  verify(token) {
    try {
      const [encodedHeader, encodedPayload, signature] = token.split('.');
      
      // Verify signature
      const expectedSignature = this._sign(`${encodedHeader}.${encodedPayload}`);
      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }

      // Decode payload
      const payload = JSON.parse(this._base64UrlDecode(encodedPayload));

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  _sign(data) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');
  }

  _base64UrlEncode(str) {
    return Buffer.from(str).toString('base64url');
  }

  _base64UrlDecode(str) {
    return Buffer.from(str, 'base64url').toString('utf-8');
  }

  _parseExpiry(expiresIn) {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 86400; // Default 24 hours

    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(value) * multipliers[unit];
  }
}

// ============================================================================
// API Key Authentication
// ============================================================================

/**
 * API Key manager
 */
export class APIKeyAuth {
  constructor() {
    // In production, store these in a database
    this.keys = new Map();
    this._loadKeysFromEnv();
  }

  _loadKeysFromEnv() {
    // Load API keys from environment
    // Format: API_KEY_1=key:name:permissions
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('API_KEY_')) {
        const [apiKey, name, permissions] = process.env[key].split(':');
        this.keys.set(apiKey, {
          name: name || 'Unknown',
          permissions: permissions ? permissions.split(',') : ['read'],
          createdAt: new Date(),
        });
      }
    });
  }

  /**
   * Generate a new API key
   */
  generate(name, permissions = ['read']) {
    const key = 'sk_' + crypto.randomBytes(32).toString('hex');
    this.keys.set(key, {
      name,
      permissions,
      createdAt: new Date(),
    });
    return key;
  }

  /**
   * Verify an API key
   */
  verify(key) {
    const keyData = this.keys.get(key);
    if (!keyData) {
      throw new Error('Invalid API key');
    }
    return keyData;
  }

  /**
   * Check if key has permission
   */
  hasPermission(key, permission) {
    const keyData = this.keys.get(key);
    if (!keyData) return false;
    return keyData.permissions.includes(permission) || keyData.permissions.includes('*');
  }

  /**
   * Revoke an API key
   */
  revoke(key) {
    return this.keys.delete(key);
  }
}

// ============================================================================
// Session Authentication
// ============================================================================

/**
 * Simple session manager (in-memory)
 * For production, use Redis or a database
 */
export class SessionAuth {
  constructor() {
    this.sessions = new Map();
    this._startCleanup();
  }

  /**
   * Create a new session
   */
  create(userId, data = {}, maxAge = 3600) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (maxAge * 1000);

    this.sessions.set(sessionId, {
      userId,
      data,
      expiresAt,
      createdAt: Date.now(),
    });

    return sessionId;
  }

  /**
   * Get session data
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      throw new Error('Session expired');
    }

    return session;
  }

  /**
   * Update session data
   */
  update(sessionId, data) {
    const session = this.get(sessionId);
    session.data = { ...session.data, ...data };
    this.sessions.set(sessionId, session);
  }

  /**
   * Destroy a session
   */
  destroy(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  _startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions.entries()) {
        if (now > session.expiresAt) {
          this.sessions.delete(sessionId);
        }
      }
    }, 60000); // Cleanup every minute
  }
}

// ============================================================================
// HMAC Authentication (Server-Only)
// ============================================================================

/**
 * HMAC-based authentication middleware for server-to-server communication
 * Uses HMAC-SHA256 to verify request signatures with a shared secret
 * 
 * Use case: Secure internal API endpoints, webhooks, or microservice communication
 * where you want to ensure requests are authentic and haven't been tampered with
 * 
 * @example Basic usage:
 * import { createHMACMiddleware } from './lib/auth.js';
 * 
 * const hmacAuth = createHMACMiddleware({
 *   secret: process.env.HMAC_SECRET,
 *   maxAge: 300 // 5 minutes
 * });
 * 
 * // In your API route
 * export default async function handler(req, res) {
 *   const isAuthenticated = await hmacAuth(req, res);
 *   if (!isAuthenticated) return;
 *   
 *   // Request is verified
 *   res.json({ success: true });
 * }
 * 
 * @example With createAuthMiddleware:
 * const auth = createAuthMiddleware({
 *   type: 'custom',
 *   customVerify: createHMACMiddleware({ secret: process.env.HMAC_SECRET }),
 *   privateRoutes: ['/api/internal/*', '/api/webhooks/*']
 * });
 */

/**
 * Create HMAC authentication middleware
 * 
 * @param {Object} options - Configuration options
 * @param {string|Function} options.secret - HMAC secret key or resolver function (required)
 * @param {string} options.signatureHeader - Header name for signature (default: 'x-hmac-signature')
 * @param {string} options.timestampHeader - Header name for timestamp (default: 'x-hmac-timestamp')
 * @param {string} options.nonceHeader - Header name for nonce (default: 'x-hmac-nonce', optional)
 * @param {string} options.versionHeader - Header name for version (default: 'x-hmac-version', optional)
 * @param {string} options.keyIdHeader - Header name for key ID (default: 'x-hmac-key-id', optional)
 * @param {number} options.maxAge - Maximum age in seconds (default: 300)
 * @param {number} options.clockSkew - Clock skew tolerance in seconds (default: 30)
 * @param {string} options.algorithm - HMAC algorithm (default: 'sha256', allowed: 'sha256', 'sha512')
 * @param {Function} options.onUnauthorized - Custom error handler
 * @param {boolean} options.replayProtection - Enable replay attack protection (default: false)
 * @param {Object} options.nonceStore - Custom nonce store with has(nonce) and add(nonce, ttl) methods
 * @param {boolean} options.trustProxy - Trust X-Forwarded-For header for IP logging (default: false)
 * @param {string} options.version - Expected signature version (default: 'v1')
 * @param {boolean} options.requireVersion - Require version header (default: true, recommended)
 * @param {boolean} options.requireKeyId - Require key ID header for key rotation (default: false)
 * @returns {Function} Middleware function
 * 
 * @example With static secret:
 * createHMACMiddleware({ secret: process.env.HMAC_SECRET })
 * 
 * @example With key rotation:
 * createHMACMiddleware({
 *   secret: (keyId) => {
 *     const keys = {
 *       'key_2025_01': process.env.HMAC_SECRET_2025_01,
 *       'key_2024_12': process.env.HMAC_SECRET_2024_12
 *     };
 *     return keys[keyId];
 *   },
 *   requireKeyId: true
 * })
 */
export function createHMACMiddleware(options = {}) {
  const {
    secret = process.env.HMAC_SECRET,
    signatureHeader = 'x-hmac-signature',
    timestampHeader = 'x-hmac-timestamp',
    nonceHeader = 'x-hmac-nonce',
    versionHeader = 'x-hmac-version',
    keyIdHeader = 'x-hmac-key-id',
    maxAge = 300,
    clockSkew = 30,
    algorithm = 'sha256',
    onUnauthorized = null,
    replayProtection = false,
    nonceStore = null,
    trustProxy = false,
    version = 'v1',
    requireVersion = true,
    requireKeyId = false,
  } = options;

  // Validate secret configuration
  const isSecretFunction = typeof secret === 'function';
  if (!secret) {
    throw new Error('HMAC secret is required');
  }
  if (!isSecretFunction && typeof secret !== 'string') {
    throw new Error('HMAC secret must be a string or function');
  }

  /**
   * Resolve secret based on key ID
   * @private
   */
  function resolveSecret(keyId = null) {
    if (isSecretFunction) {
      const resolvedSecret = secret(keyId);
      if (!resolvedSecret) {
        return null;
      }
      return resolvedSecret;
    }
    return secret;
  }

  // Algorithm allow-list to prevent downgrade attacks
  const ALLOWED_ALGORITHMS = new Set(['sha256', 'sha512']);
  if (!ALLOWED_ALGORITHMS.has(algorithm)) {
    throw new Error(`Unsupported HMAC algorithm: ${algorithm}. Allowed: ${Array.from(ALLOWED_ALGORITHMS).join(', ')}`);
  }

  // Version validation
  const ALLOWED_VERSIONS = new Set(['v1']);
  if (!ALLOWED_VERSIONS.has(version)) {
    throw new Error(`Unsupported HMAC version: ${version}. Allowed: ${Array.from(ALLOWED_VERSIONS).join(', ')}`);
  }

  // Initialize nonce store for replay protection
  let nonces = null;
  if (replayProtection) {
    if (nonceStore) {
      nonces = nonceStore;
    } else {
      // Default in-memory LRU-like store
      nonces = new Map();
      // Cleanup expired nonces every minute
      setInterval(() => {
        const now = Date.now();
        for (const [nonce, expiresAt] of nonces.entries()) {
          if (now > expiresAt) {
            nonces.delete(nonce);
          }
        }
      }, 60000);
    }
  }

  /**
   * Safely extract client IP address
   * @private
   */
  function getClientIP(req) {
    if (trustProxy) {
      // Trust X-Forwarded-For header (use first IP in chain)
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0];
      }
      // Fallback to X-Real-IP
      const realIP = req.headers['x-real-ip'];
      if (realIP) {
        return realIP;
      }
    }
    // Direct connection or proxy not trusted
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  /**
   * Check if nonce has been used (replay detection)
   * @private
   */
  function isNonceUsed(nonce, timestamp) {
    if (!nonces) return false;

    // Check if nonce exists
    if (nonceStore) {
      // Custom store (e.g., Redis)
      return nonceStore.has(nonce);
    } else {
      // In-memory store
      return nonces.has(nonce);
    }
  }

  /**
   * Mark nonce as used
   * @private
   */
  function markNonceUsed(nonce, timestamp) {
    if (!nonces) return;

    const expiresAt = Date.now() + (maxAge * 1000);

    if (nonceStore) {
      // Custom store (e.g., Redis) with TTL
      nonceStore.add(nonce, maxAge);
    } else {
      // In-memory store
      nonces.set(nonce, expiresAt);
    }
  }

  /**
   * Verify HMAC signature
   * @private
   */
  function verifySignature(payload, signature, timestamp, nonce = null, method = null, path = null, resolvedSecret = null, requestVersion = null) {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      // Check timestamp validity with proper clock skew handling
      // Reject future timestamps beyond clock skew tolerance
      if (timestamp > now + clockSkew) {
        return { valid: false, error: 'Timestamp too far in future' };
      }
      
      // Reject old timestamps beyond maxAge
      if (now - timestamp > maxAge) {
        return { valid: false, error: 'Signature expired' };
      }

      // Use resolved secret or fall back to default
      const secretToUse = resolvedSecret || secret;
      if (!secretToUse) {
        return { valid: false, error: 'Invalid key ID' };
      }

      // Enforce method and path for v1 signatures (prevents cross-endpoint replay)
      const effectiveVersion = requestVersion || version;
      if (effectiveVersion === 'v1' && (!method || !path)) {
        return { valid: false, error: 'Method and path required for v1 signatures' };
      }

      // Recreate the signature
      const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
      
      // Build message with method and path for v1 (prevents cross-endpoint replay)
      // Format: METHOD.PATH.DATA.TIMESTAMP[.NONCE]
      let message;
      if (method && path) {
        message = nonce 
          ? `${method}.${path}.${data}.${timestamp}.${nonce}`
          : `${method}.${path}.${data}.${timestamp}`;
      } else {
        // Fallback for backward compatibility (not recommended)
        message = nonce ? `${data}.${timestamp}.${nonce}` : `${data}.${timestamp}`;
      }
      
      const expectedSignature = crypto
        .createHmac(algorithm, secretToUse)
        .update(message)
        .digest('hex');

      // Convert to buffers for comparison
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expectedSignature, 'hex');

      // Check length match before timingSafeEqual to prevent throws
      if (sigBuf.length !== expBuf.length) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(sigBuf, expBuf);

      return { valid: isValid, error: isValid ? null : 'Invalid signature' };
    } catch (error) {
      return { valid: false, error: 'Invalid signature format' };
    }
  }

  /**
   * Middleware function
   */
  return async (req, res) => {
    try {
      // Extract signature and timestamp from headers (normalize to lowercase)
      const signature = req.headers[signatureHeader.toLowerCase()];
      const timestampStr = req.headers[timestampHeader.toLowerCase()];
      const nonce = replayProtection ? req.headers[nonceHeader.toLowerCase()] : null;
      const requestVersion = req.headers[versionHeader.toLowerCase()];
      const keyId = req.headers[keyIdHeader.toLowerCase()];

      // Check for key ID if required
      if (requireKeyId && !keyId) {
        const reason = 'Missing key ID header';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      // Resolve secret based on key ID
      const resolvedSecret = resolveSecret(keyId);
      if (!resolvedSecret) {
        const reason = 'Invalid key ID';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          keyId,
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      // Check version if required or provided
      if (requireVersion && !requestVersion) {
        const reason = 'Missing HMAC version header';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          expectedVersion: version,
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      // Validate version if provided
      if (requestVersion && requestVersion !== version) {
        const reason = 'Unsupported HMAC version';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          requestVersion,
          expectedVersion: version,
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      // 401: Missing authentication credentials
      if (!signature || !timestampStr) {
        const reason = 'Missing HMAC signature or timestamp';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          hasSignature: !!signature,
          hasTimestamp: !!timestampStr,
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      // Check for nonce if replay protection is enabled
      if (replayProtection && !nonce) {
        const reason = 'Missing nonce for replay protection';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      const timestamp = parseInt(timestampStr);
      if (isNaN(timestamp)) {
        const reason = 'Invalid timestamp format';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          timestamp: timestampStr,
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return false;
      }

      // Check for replay attack
      if (replayProtection && isNonceUsed(nonce, timestamp)) {
        const reason = 'Replay attack detected';
        console.warn('[HMAC Auth] Verification failed:', {
          reason,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          nonce,
          timestamp,
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, reason);
        }
        res.status(403).json({ 
          error: 'Forbidden',
          message: 'Request rejected',
        });
        return false;
      }

      // Determine payload based on request method
      let payload;
      if (req.method === 'GET' || req.method === 'DELETE') {
        // For GET/DELETE, sign the query string
        payload = JSON.stringify(req.query || {});
      } else {
        // For POST/PUT/PATCH, sign the body
        payload = JSON.stringify(req.body || {});
      }

      // Extract method and path for signature verification
      const method = req.method;
      const path = req.originalUrl || req.url;

      // Verify the signature (includes method and path to prevent cross-endpoint replay)
      const { valid, error } = verifySignature(payload, signature, timestamp, nonce, method, path, resolvedSecret, requestVersion);

      // 403: Invalid signature or expired (authentication provided but invalid)
      if (!valid) {
        console.warn('[HMAC Auth] Verification failed:', {
          reason: error,
          url: req.url,
          method: req.method,
          ip: getClientIP(req),
          timestamp,
          algorithm,
          ...(replayProtection && { nonce }),
        });
        
        if (onUnauthorized) {
          return onUnauthorized(req, res, error);
        }
        res.status(403).json({ 
          error: 'Forbidden',
          message: 'Request rejected',
        });
        return false;
      }

      // Mark nonce as used (after signature verification)
      if (replayProtection) {
        markNonceUsed(nonce, timestamp);
      }

      // Attach verification metadata to request
      req.hmacVerified = true;
      req.hmacTimestamp = timestamp;
      req.hmacAlgorithm = algorithm;
      req.hmacVersion = requestVersion || version;
      if (keyId) {
        req.hmacKeyId = keyId;
      }
      if (replayProtection) {
        req.hmacNonce = nonce;
      }

      // Attach structured auth metadata for better DX
      req.auth = {
        type: 'hmac',
        verified: true,
        timestamp,
        algorithm,
        version: requestVersion || version,
        ...(keyId && { keyId }),
        ...(replayProtection && { nonce }),
      };

      return true;
    } catch (error) {
      console.error('[HMAC Auth] Middleware error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: getClientIP(req),
      });
      
      if (onUnauthorized) {
        return onUnauthorized(req, res, 'HMAC verification error');
      }
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Authentication error',
      });
      return false;
    }
  };
}

/**
 * Helper function to generate HMAC signature for outgoing requests
 * Use this when making requests to HMAC-protected endpoints
 * 
 * @param {Object|string} payload - Data to sign
 * @param {Object} options - Configuration options
 * @param {string} options.secret - HMAC secret key (required)
 * @param {string} options.algorithm - HMAC algorithm (default: 'sha256', allowed: 'sha256', 'sha512')
 * @param {boolean} options.includeNonce - Include nonce for replay protection (default: false)
 * @param {string} options.version - Signature version (default: 'v1')
 * @param {string} options.method - HTTP method (e.g., 'POST', 'GET') - required for v1
 * @param {string} options.path - Request path (e.g., '/api/endpoint') - required for v1
 * @param {string} options.keyId - Key ID for key rotation (optional)
 * @returns {Object} { signature, timestamp, version, keyId?, nonce? }
 * 
 * @example Basic usage:
 * const { signature, timestamp, version } = generateHMACSignature(
 *   { userId: 123, action: 'update' },
 *   { 
 *     secret: process.env.HMAC_SECRET,
 *     method: 'POST',
 *     path: '/api/users/update'
 *   }
 * );
 * 
 * @example With key rotation:
 * const { signature, timestamp, version, keyId } = generateHMACSignature(
 *   { userId: 123, action: 'update' },
 *   { 
 *     secret: process.env.HMAC_SECRET_2025_01,
 *     method: 'POST',
 *     path: '/api/users/update',
 *     keyId: 'key_2025_01'
 *   }
 * );
 * 
 * await fetch('/api/users/update', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-HMAC-Signature': signature,
 *     'X-HMAC-Timestamp': timestamp.toString(),
 *     'X-HMAC-Version': version,
 *     'X-HMAC-Key-Id': keyId
 *   },
 *   body: JSON.stringify({ userId: 123, action: 'update' })
 * });
 */
export function generateHMACSignature(payload, options = {}) {
  const {
    secret = process.env.HMAC_SECRET,
    algorithm = 'sha256',
    includeNonce = false,
    version = 'v1',
    method = null,
    path = null,
    keyId = null,
  } = options;

  if (!secret) {
    throw new Error('HMAC secret is required');
  }

  // Algorithm allow-list to prevent downgrade attacks
  const ALLOWED_ALGORITHMS = new Set(['sha256', 'sha512']);
  if (!ALLOWED_ALGORITHMS.has(algorithm)) {
    throw new Error(`Unsupported HMAC algorithm: ${algorithm}. Allowed: ${Array.from(ALLOWED_ALGORITHMS).join(', ')}`);
  }

  // Version validation
  const ALLOWED_VERSIONS = new Set(['v1']);
  if (!ALLOWED_VERSIONS.has(version)) {
    throw new Error(`Unsupported HMAC version: ${version}. Allowed: ${Array.from(ALLOWED_VERSIONS).join(', ')}`);
  }

  // For v1, method and path are REQUIRED for security (prevents cross-endpoint replay)
  if (version === 'v1' && (!method || !path)) {
    throw new Error('Method and path are required for v1 signatures to prevent cross-endpoint replay attacks');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = includeNonce ? crypto.randomBytes(16).toString('hex') : null;
  
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  // Build message with method and path for v1 (prevents cross-endpoint replay)
  // Format: METHOD.PATH.DATA.TIMESTAMP[.NONCE]
  let message;
  if (method && path) {
    message = nonce 
      ? `${method}.${path}.${data}.${timestamp}.${nonce}`
      : `${method}.${path}.${data}.${timestamp}`;
  } else {
    // Fallback for backward compatibility (not recommended)
    message = nonce ? `${data}.${timestamp}.${nonce}` : `${data}.${timestamp}`;
  }
  
  const signature = crypto
    .createHmac(algorithm, secret)
    .update(message)
    .digest('hex');

  const result = {
    signature,
    timestamp,
    version,
  };

  if (keyId) {
    result.keyId = keyId;
  }

  if (nonce) {
    result.nonce = nonce;
  }

  return result;
}

// ============================================================================
// Password Hashing
// ============================================================================

/**
 * Password utilities using Argon2id
 * Argon2 is the winner of the Password Hashing Competition and provides
 * superior protection against GPU/ASIC attacks
 * 
 * Requires: npm install @node-rs/argon2
 */
export class Password {
  /**
   * Validate Argon2 hash format to prevent timing attacks
   * Argon2 format: $argon2<variant>$v=<version>$m=<memory>,t=<iterations>,p=<parallelism>$<salt>$<hash>
   * @param {string} hash - Hash string to validate
   * @returns {boolean} True if format is valid
   * @private
   */
  static _isValidHashFormat(hash) {
    if (typeof hash !== 'string' || hash.length === 0) {
      return false;
    }

    // Argon2 hash format validation
    // Format: $argon2<variant>$v=<version>$m=<memory>,t=<iterations>,p=<parallelism>$<salt>$<hash>
    // Variants: id (Argon2id), i (Argon2i), d (Argon2d)
    const argon2Pattern = /^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
    
    return argon2Pattern.test(hash);
  }

  /**
   * Hash a password using Argon2id
   * @param {string} password - Plain text password
   * @param {object} options - Hashing options
   * @returns {Promise<string>} Hashed password
   */
  static async hash(password, options = {}) {
    const {
      memoryCost = 65536, // 64 MB
      timeCost = 3, // 3 iterations
      parallelism = 4, // 4 threads
    } = options;

    try {
      const argon2 = await import('@node-rs/argon2');
      
      const hash = await argon2.hash(password, {
        memoryCost,
        timeCost,
        parallelism,
        outputLen: 32,
      });
      
      return hash;
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'Argon2 is required for password hashing. Install it with: npm install @node-rs/argon2'
        );
      }
      throw error;
    }
  }

  /**
   * Verify a password against a hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} True if password matches
   */
  static async verify(password, hash) {
    // Validate hash format first to prevent timing attacks
    // This ensures we fail fast on invalid formats without revealing timing information
    if (!this._isValidHashFormat(hash)) {
      // Perform a dummy hash operation to maintain constant time
      // This prevents attackers from distinguishing between invalid format and wrong password
      try {
        const argon2 = await import('@node-rs/argon2');
        await argon2.hash('dummy', {
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
          outputLen: 32,
        });
      } catch (error) {
        // Ignore errors in dummy operation
      }
      return false;
    }

    try {
      const argon2 = await import('@node-rs/argon2');
      return await argon2.verify(hash, password);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'Argon2 is required for password verification. Install it with: npm install @node-rs/argon2'
        );
      }
      console.error('Argon2 verification failed:', error.message);
      return false;
    }
  }
}

// ============================================================================
// Auth Middleware Factory
// ============================================================================

/**
 * Create authentication middleware
 * 
 * Supports multiple authentication strategies that can be used together.
 * Routes are PUBLIC by default - only privateRoutes require authentication.
 * 
 * @param {Object} options - Configuration options
 * @param {string|string[]} options.type - Auth type(s): 'jwt', 'apikey', 'session', 'custom', or array of types
 * @param {string} options.secret - JWT secret (required for JWT)
 * @param {string[]} options.publicRoutes - Routes that bypass authentication (default: [])
 * @param {Function} options.onUnauthorized - Custom unauthorized handler
 * @param {Function} options.customVerify - Custom verification function
 * @param {boolean} options.requireAll - If true with multiple types, all must pass (default: false, any can pass)
 * @param {boolean} options.skipRouteCheck - If true, always run auth (customVerify handles all logic)
 * 
 * @example
 * // All routes require auth except /api/public/*
 * createAuthMiddleware({ type: 'jwt', secret: 'xxx', publicRoutes: ['/api/public/*'] })
 * 
 * @example
 * // Multiple auth types (any can pass)
 * createAuthMiddleware({ 
 *   type: ['jwt', 'custom'], 
 *   secret: 'xxx',
 *   customVerify: async (req) => { ... },
 *   publicRoutes: ['/api/public/*', '/api/health']
 * })
 * 
 * @example
 * // Custom auth handles everything (no route filtering)
 * createAuthMiddleware({ 
 *   type: 'custom',
 *   skipRouteCheck: true,
 *   customVerify: async (req) => {
 *     // Your custom logic decides everything
 *     if (req.url.startsWith('/api/public')) return true;
 *     if (req.url.startsWith('/api/admin')) {
 *       // Check admin token
 *       return req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
 *     }
 *     // Check JWT for other routes
 *     const token = req.headers.authorization?.replace('Bearer ', '');
 *     if (token) {
 *       const jwt = new JWT(process.env.JWT_SECRET);
 *       req.user = jwt.verify(token);
 *       return true;
 *     }
 *     return false;
 *   }
 * })
 */
export function createAuthMiddleware(options = {}) {
  const {
    type = 'jwt',
    secret = process.env.JWT_SECRET,
    publicRoutes = [],
    onUnauthorized = null,
    customVerify = null,
    requireAll = false,
    skipRouteCheck = false,
  } = options;

  // Support both single type and array of types
  const types = Array.isArray(type) ? type : [type];

  // Initialize auth handlers based on types
  const jwt = types.includes('jwt') ? new JWT(secret) : null;
  const apiKeyAuth = types.includes('apikey') ? new APIKeyAuth() : null;
  const sessionAuth = types.includes('session') ? new SessionAuth() : null;

  return async (req, res) => {
    // If skipRouteCheck is true, always run auth (customVerify handles everything)
    if (!skipRouteCheck) {
      // Check if route is public
      const isPublic = publicRoutes.some(route => {
        // Support exact match and wildcard patterns
        if (route.endsWith('*')) {
          return req.url.startsWith(route.slice(0, -1));
        }
        return req.url === route || req.url.startsWith(route + '?');
      });
      
      if (isPublic) {
        return true; // Route is public, no auth needed
      }
    }

    const errors = [];
    const results = [];

    // Try each authentication strategy
    for (const authType of types) {
      try {
        let success = false;

        // Custom verification
        if (authType === 'custom' && customVerify) {
          const result = await customVerify(req, res);
          if (result) {
            success = true;
            results.push({ type: 'custom', success: true });
          } else {
            throw new Error('Custom auth failed');
          }
        }

        // JWT Authentication
        if (authType === 'jwt' && jwt) {
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) throw new Error('No JWT token provided');
          
          const payload = jwt.verify(token);
          req.user = payload;
          req.authType = 'jwt';
          success = true;
          results.push({ type: 'jwt', success: true });
        }

        // API Key Authentication
        if (authType === 'apikey' && apiKeyAuth) {
          const apiKey = req.headers['x-api-key'] || req.query.apiKey;
          if (!apiKey) throw new Error('No API key provided');
          
          const keyData = apiKeyAuth.verify(apiKey);
          req.user = keyData;
          req.apiKey = apiKey;
          req.authType = 'apikey';
          success = true;
          results.push({ type: 'apikey', success: true });
        }

        // Session Authentication
        if (authType === 'session' && sessionAuth) {
          const sessionId = req.cookies?.sessionId;
          if (!sessionId) throw new Error('No session');
          
          const session = sessionAuth.get(sessionId);
          req.user = { userId: session.userId, ...session.data };
          req.sessionId = sessionId;
          req.authType = 'session';
          success = true;
          results.push({ type: 'session', success: true });
        }

        if (!success) {
          throw new Error(`Auth type '${authType}' not configured or failed`);
        }

      } catch (error) {
        errors.push({ type: authType, error: error.message });
        results.push({ type: authType, success: false, error: error.message });
      }
    }

    // Determine if authentication passed
    const successCount = results.filter(r => r.success).length;
    const authPassed = requireAll 
      ? successCount === types.length 
      : successCount > 0;

    if (authPassed) {
      return true;
    }

    // Authentication failed
    if (onUnauthorized) {
      return onUnauthorized(req, res, errors);
    }

    res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Authentication required',
      attempts: results,
    });
    return false;
  };
}

// ============================================================================
// Role-Based Access Control (RBAC)
// ============================================================================

/**
 * Check if user has required role
 */
export function requireRole(...roles) {
  return (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    const userRole = req.user.role;
    if (!roles.includes(userRole)) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}`,
      });
      return false;
    }

    return true;
  };
}

/**
 * Check if user has required permission
 */
export function requirePermission(...permissions) {
  return (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.some(p => userPermissions.includes(p));

    if (!hasPermission) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: `Required permission: ${permissions.join(' or ')}`,
      });
      return false;
    }

    return true;
  };
}
