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
 */
export function createAuthMiddleware(options = {}) {
  const {
    type = 'jwt', // 'jwt', 'apikey', 'session', 'custom'
    secret = process.env.JWT_SECRET,
    publicRoutes = ['/api/public', '/api/auth/login', '/api/auth/register'],
    onUnauthorized = null,
    customVerify = null,
  } = options;

  const jwt = type === 'jwt' ? new JWT(secret) : null;
  const apiKeyAuth = type === 'apikey' ? new APIKeyAuth() : null;
  const sessionAuth = type === 'session' ? new SessionAuth() : null;

  return async (req, res) => {
    // Check if route is public
    const isPublic = publicRoutes.some(route => req.url.includes(route));
    if (isPublic) {
      return true;
    }

    try {
      // Custom verification
      if (customVerify) {
        const result = await customVerify(req, res);
        if (result) return true;
        throw new Error('Custom auth failed');
      }

      // JWT Authentication
      if (type === 'jwt') {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) throw new Error('No token provided');
        
        const payload = jwt.verify(token);
        req.user = payload;
        return true;
      }

      // API Key Authentication
      if (type === 'apikey') {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey) throw new Error('No API key provided');
        
        const keyData = apiKeyAuth.verify(apiKey);
        req.user = keyData;
        req.apiKey = apiKey;
        return true;
      }

      // Session Authentication
      if (type === 'session') {
        const sessionId = req.cookies.sessionId;
        if (!sessionId) throw new Error('No session');
        
        const session = sessionAuth.get(sessionId);
        req.user = { userId: session.userId, ...session.data };
        req.sessionId = sessionId;
        return true;
      }

      throw new Error('Invalid auth type');

    } catch (error) {
      if (onUnauthorized) {
        return onUnauthorized(req, res, error);
      }

      res.status(401).json({ 
        error: 'Unauthorized',
        message: error.message,
      });
      return false;
    }
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
