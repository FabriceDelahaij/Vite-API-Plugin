/**
 * Response Caching Middleware
 * Supports in-memory and Redis-based caching with TTL
 */

import crypto from 'crypto';

// ============================================================================
// Cache Strategies
// ============================================================================

/**
 * In-memory cache implementation
 */
class MemoryCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100; // Max number of entries
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes default
    this._startCleanup();
  }

  async get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access time for LRU
    entry.lastAccess = Date.now();
    return entry.value;
  }

  async set(key, value, ttl = this.defaultTTL) {
    // Enforce max size using LRU eviction
    if (this.cache.size >= this.maxSize) {
      this._evictLRU();
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl * 1000),
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
  }

  async delete(key) {
    return this.cache.delete(key);
  }

  async clear() {
    this.cache.clear();
  }

  async has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        size: JSON.stringify(entry.value).length,
        expiresIn: Math.max(0, entry.expiresAt - Date.now()),
        age: Date.now() - entry.createdAt,
      })),
    };
  }

  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  _startCleanup() {
    // Cleanup expired entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, 60000);
  }
}

/**
 * Redis cache implementation (requires redis package)
 */
class RedisCache {
  constructor(options = {}) {
    this.client = options.client;
    this.prefix = options.prefix || 'cache:';
    this.defaultTTL = options.defaultTTL || 300;
    
    if (!this.client) {
      throw new Error('Redis client is required for RedisCache');
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.client.setEx(
        this.prefix + key,
        ttl,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async delete(key) {
    try {
      await this.client.del(this.prefix + key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  async clear() {
    try {
      const keys = await this.client.keys(this.prefix + '*');
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  async has(key) {
    try {
      const exists = await this.client.exists(this.prefix + key);
      return exists === 1;
    } catch (error) {
      console.error('Redis has error:', error);
      return false;
    }
  }

  async getStats() {
    try {
      const keys = await this.client.keys(this.prefix + '*');
      const stats = {
        size: keys.length,
        entries: [],
      };
      
      for (const key of keys.slice(0, 100)) { // Limit to 100 for performance
        const ttl = await this.client.ttl(key);
        stats.entries.push({
          key: key.replace(this.prefix, ''),
          expiresIn: ttl * 1000,
        });
      }
      
      return stats;
    } catch (error) {
      console.error('Redis stats error:', error);
      return { size: 0, entries: [] };
    }
  }
}

// ============================================================================
// Cache Manager
// ============================================================================

export class CacheManager {
  constructor(options = {}) {
    const {
      type = 'memory', // 'memory' or 'redis'
      redis = null,
      maxSize = 100,
      defaultTTL = 300,
      keyPrefix = 'api:',
      enabled = true,
    } = options;

    this.enabled = enabled;
    this.keyPrefix = keyPrefix;
    
    if (!enabled) {
      this.store = null;
      return;
    }

    if (type === 'redis' && redis) {
      this.store = new RedisCache({ client: redis, defaultTTL, prefix: keyPrefix });
    } else {
      this.store = new MemoryCache({ maxSize, defaultTTL });
    }
  }

  /**
   * Generate cache key from request
   */
  generateKey(req) {
    const url = req.url || req.originalUrl;
    const method = req.method;
    const query = JSON.stringify(req.query || {});
    const body = req.method !== 'GET' ? JSON.stringify(req.body || {}) : '';
    
    const hash = crypto
      .createHash('sha256')
      .update(`${method}:${url}:${query}:${body}`)
      .digest('hex')
      .slice(0, 16);
    
    return `${this.keyPrefix}${hash}`;
  }

  /**
   * Get cached response
   */
  async get(key) {
    if (!this.enabled || !this.store) return null;
    return await this.store.get(key);
  }

  /**
   * Set cached response
   */
  async set(key, value, ttl) {
    if (!this.enabled || !this.store) return;
    await this.store.set(key, value, ttl);
  }

  /**
   * Delete cached response
   */
  async delete(key) {
    if (!this.enabled || !this.store) return;
    await this.store.delete(key);
  }

  /**
   * Clear all cache
   */
  async clear() {
    if (!this.enabled || !this.store) return;
    await this.store.clear();
  }

  /**
   * Check if key exists
   */
  async has(key) {
    if (!this.enabled || !this.store) return false;
    return await this.store.has(key);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.enabled || !this.store) {
      return { enabled: false };
    }
    return {
      enabled: true,
      type: this.store instanceof RedisCache ? 'redis' : 'memory',
      ...(await this.store.getStats()),
    };
  }
}

// ============================================================================
// Cache Middleware Factory
// ============================================================================

/**
 * Create caching middleware for API routes
 */
export function createCacheMiddleware(options = {}) {
  const {
    enabled = true,
    type = 'memory',
    redis = null,
    maxSize = 100,
    defaultTTL = 300,
    keyPrefix = 'api:',
    shouldCache = null, // Custom function to determine if response should be cached
    varyBy = [], // Additional headers to vary cache by (e.g., ['Authorization', 'Accept-Language'])
  } = options;

  const cacheManager = new CacheManager({
    enabled,
    type,
    redis,
    maxSize,
    defaultTTL,
    keyPrefix,
  });

  return {
    cacheManager,
    
    /**
     * Middleware function to wrap API handlers
     */
    async middleware(req, res, next) {
      // Only cache GET requests by default
      if (req.method !== 'GET') {
        return next();
      }

      // Generate cache key with vary headers
      let cacheKey = cacheManager.generateKey(req);
      
      if (varyBy.length > 0) {
        const varyHash = crypto
          .createHash('sha256')
          .update(varyBy.map(h => req.headers[h.toLowerCase()] || '').join(':'))
          .digest('hex')
          .slice(0, 8);
        cacheKey += `:${varyHash}`;
      }

      // Try to get from cache
      const cached = await cacheManager.get(cacheKey);
      
      if (cached) {
        // Serve from cache
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        res.statusCode = cached.statusCode || 200;
        
        // Restore headers
        if (cached.headers) {
          Object.entries(cached.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        
        // Send cached response
        if (typeof cached.body === 'object') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(cached.body));
        } else {
          res.end(cached.body);
        }
        
        return;
      }

      // Cache miss - intercept response
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);

      // Store original methods
      const originalJson = res.json;
      const originalSend = res.send;
      const originalEnd = res.end;

      // Intercept json()
      res.json = function(data) {
        const shouldCacheResponse = shouldCache ? shouldCache(req, res, data) : true;
        
        if (shouldCacheResponse && res.statusCode >= 200 && res.statusCode < 300) {
          cacheManager.set(cacheKey, {
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body: data,
          }, defaultTTL).catch(err => console.error('Cache set error:', err));
        }
        
        return originalJson.call(this, data);
      };

      // Intercept send()
      res.send = function(data) {
        const shouldCacheResponse = shouldCache ? shouldCache(req, res, data) : true;
        
        if (shouldCacheResponse && res.statusCode >= 200 && res.statusCode < 300) {
          cacheManager.set(cacheKey, {
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body: data,
          }, defaultTTL).catch(err => console.error('Cache set error:', err));
        }
        
        return originalSend.call(this, data);
      };

      // Intercept end()
      const chunks = [];
      const originalWrite = res.write;
      
      res.write = function(chunk) {
        chunks.push(Buffer.from(chunk));
        return originalWrite.apply(this, arguments);
      };

      res.end = function(chunk) {
        if (chunk) {
          chunks.push(Buffer.from(chunk));
        }
        
        const body = Buffer.concat(chunks).toString('utf8');
        const shouldCacheResponse = shouldCache ? shouldCache(req, res, body) : true;
        
        if (shouldCacheResponse && res.statusCode >= 200 && res.statusCode < 300) {
          cacheManager.set(cacheKey, {
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body,
          }, defaultTTL).catch(err => console.error('Cache set error:', err));
        }
        
        return originalEnd.apply(this, arguments);
      };

      next();
    },
  };
}

/**
 * Cache invalidation helper
 */
export function createCacheInvalidator(cacheManager) {
  return {
    /**
     * Invalidate cache by pattern
     */
    async invalidatePattern(pattern) {
      // This is a simplified version - full implementation would need pattern matching
      await cacheManager.clear();
    },
    
    /**
     * Invalidate specific route
     */
    async invalidateRoute(route) {
      const key = cacheManager.keyPrefix + route;
      await cacheManager.delete(key);
    },
    
    /**
     * Clear all cache
     */
    async clearAll() {
      await cacheManager.clear();
    },
  };
}
