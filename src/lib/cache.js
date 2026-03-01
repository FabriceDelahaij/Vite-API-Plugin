/**
 * Response Caching Middleware
 * Supports in-memory and Redis-based caching with TTL
 * 
 * Features:
 * - Compression (gzip/zstd)
 * - Encryption with key rotation support
 * - LRU eviction
 * - TTL-based expiration
 * 
 * Encryption Key Rotation:
 * To enable seamless key rotation without cache invalidation:
 * 
 * 1. Single key (simple):
 *    encryptionKey: 'your-secret-key'
 * 
 * 2. Key rotation (advanced):
 *    encryptionKey: {
 *      activeKey: 'new-key',
 *      previousKeys: ['old-key-1', 'old-key-2']
 *    }
 * 
 * When decrypting, the system tries:
 * - Active key first (fastest)
 * - Previous keys as fallback (for old cached data)
 * 
 * This allows rotating keys without flushing the cache.
 * Previous keys are kept for a transition period (max 3 keys).
 * 
 * Example rotation:
 *   cacheManager.rotateEncryptionKey('new-secret-key');
 */

import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import zstd from '@mongodb-js/zstd';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// Encryption Helper
// ============================================================================

class CacheEncryption {
  constructor(encryptionKey, options = {}) {
    if (!encryptionKey) {
      throw new Error('Encryption key is required');
    }
    
    // Support key rotation: single key or { activeKey, previousKeys: [] }
    if (typeof encryptionKey === 'string') {
      this.activeKey = encryptionKey;
      this.previousKeys = [];
    } else if (typeof encryptionKey === 'object') {
      this.activeKey = encryptionKey.activeKey;
      this.previousKeys = encryptionKey.previousKeys || [];
      
      if (!this.activeKey) {
        throw new Error('activeKey is required when using key rotation');
      }
      if (!Array.isArray(this.previousKeys)) {
        throw new Error('previousKeys must be an array');
      }
    } else {
      throw new Error('encryptionKey must be a string or object with activeKey');
    }
    
    this.algorithm = 'aes-256-gcm';
    
    // Security options
    this.enableHMAC = options.enableHMAC !== false; // Tamper detection (default: enabled)
    this.enableAAD = options.enableAAD !== false; // Additional authenticated data (default: enabled)
    this.keyRotationGracePeriod = options.keyRotationGracePeriod !== undefined ? options.keyRotationGracePeriod : 7 * 24 * 60 * 60 * 1000; // 7 days default
    this.keyRotationTimestamps = new Map(); // Track when keys were rotated
    
    // Key derivation cache with TTL (5 minutes default)
    this.keyCache = new Map();
    this.keyCacheTTL = 5 * 60 * 1000; // 5 minutes
    this.maxCachedKeys = 100; // Limit cache size
    
    // Track active key timestamp
    this.keyRotationTimestamps.set(this.activeKey, Date.now());
  }

  async encrypt(data, context = null) {
    try {
      // Generate a random salt for this encryption operation
      const salt = crypto.randomBytes(32);
      
      // Derive a unique key using async scrypt (non-blocking) with active key
      const derivedKey = await this._getDerivedKey(salt, this.activeKey);
      
      // Generate random IV
      const iv = crypto.randomBytes(16);
      
      // Use async cipher operations to avoid blocking
      const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);
      
      // Set Additional Authenticated Data (AAD) for context binding
      if (this.enableAAD && context) {
        const aad = Buffer.from(context);
        cipher.setAAD(aad);
      }
      
      // Process encryption asynchronously
      const encrypted = await new Promise((resolve, reject) => {
        const chunks = [];
        cipher.on('data', chunk => chunks.push(chunk));
        cipher.on('end', () => resolve(Buffer.concat(chunks)));
        cipher.on('error', reject);
        
        cipher.write(data, 'utf8');
        cipher.end();
      });
      
      const authTag = cipher.getAuthTag();
      
      const payload = {
        v: 2, // Version marker (v2 includes HMAC and AAD support)
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64'),
        timestamp: Date.now(), // For key rotation grace period enforcement
      };
      
      // Add HMAC for tamper detection (separate from GCM auth tag)
      if (this.enableHMAC) {
        const hmacKey = await this._getDerivedKey(salt, this.activeKey + ':hmac');
        const hmac = crypto.createHmac('sha256', hmacKey);
        hmac.update(payload.data);
        if (context) hmac.update(context);
        payload.hmac = hmac.digest('base64');
        
        // Zero HMAC key
        this._zeroBuffer(hmacKey);
      }
      
      // Zero sensitive data from memory
      this._zeroBuffer(derivedKey);
      
      return JSON.stringify(payload);
    } catch (error) {
      // Zero sensitive data from error logs
      const sanitizedError = new Error('Encryption error');
      sanitizedError.code = error.code;
      console.error(sanitizedError.message);
      throw sanitizedError;
    }
  }

  async decrypt(encryptedData, context = null) {
    let derivedKey = null;
    try {
      const parsed = JSON.parse(encryptedData);
      const { v, salt, iv, authTag, data, hmac, timestamp } = parsed;
      
      const saltBuffer = Buffer.from(salt, 'base64');
      
      // Try decryption with active key first
      const keysToTry = [this.activeKey, ...this.previousKeys];
      let lastError = null;
      
      for (const key of keysToTry) {
        try {
          // Enforce key rotation grace period
          if (key !== this.activeKey && this.keyRotationGracePeriod > 0) {
            const keyRotationTime = this.keyRotationTimestamps.get(this.activeKey);
            if (keyRotationTime && timestamp) {
              const age = Date.now() - timestamp;
              if (age > this.keyRotationGracePeriod) {
                // Data encrypted with old key is beyond grace period
                const sanitizedError = new Error('Cache entry expired due to key rotation policy');
                console.warn('Key rotation grace period exceeded, rejecting old cache entry');
                throw sanitizedError;
              }
            }
          }
          
          // Verify HMAC first (if present and enabled) before attempting decryption
          if (this.enableHMAC && hmac && v >= 2) {
            const hmacKey = await this._getDerivedKey(saltBuffer, key + ':hmac');
            const expectedHmac = crypto.createHmac('sha256', hmacKey);
            expectedHmac.update(data);
            if (context) expectedHmac.update(context);
            const expectedHmacDigest = expectedHmac.digest('base64');
            
            // Zero HMAC key
            this._zeroBuffer(hmacKey);
            
            if (hmac !== expectedHmacDigest) {
              throw new Error('HMAC verification failed - data may be tampered');
            }
          }
          
          // Derive the key using the stored salt
          derivedKey = await this._getDerivedKey(saltBuffer, key);
          
          const decipher = crypto.createDecipheriv(
            this.algorithm,
            derivedKey,
            Buffer.from(iv, 'base64')
          );
          
          // Set AAD if enabled and context provided
          if (this.enableAAD && context && v >= 2) {
            const aad = Buffer.from(context);
            decipher.setAAD(aad);
          }
          
          decipher.setAuthTag(Buffer.from(authTag, 'base64'));
          
          // Process decryption asynchronously
          const decrypted = await new Promise((resolve, reject) => {
            const chunks = [];
            decipher.on('data', chunk => chunks.push(chunk));
            decipher.on('end', () => resolve(Buffer.concat(chunks)));
            decipher.on('error', reject);
            
            decipher.write(Buffer.from(data, 'base64'));
            decipher.end();
          });
          
          // Zero sensitive data
          this._zeroBuffer(derivedKey);
          derivedKey = null;
          
          // Decryption succeeded
          const result = decrypted.toString('utf8');
          
          // Zero decrypted buffer
          this._zeroBuffer(decrypted);
          
          return result;
        } catch (error) {
          // Zero sensitive data on error
          if (derivedKey) {
            this._zeroBuffer(derivedKey);
            derivedKey = null;
          }
          
          // Store error and try next key
          lastError = error;
          continue;
        }
      }
      
      // All keys failed
      throw lastError || new Error('Decryption failed with all available keys');
    } catch (error) {
      // Zero sensitive data
      if (derivedKey) {
        this._zeroBuffer(derivedKey);
      }
      
      // Zero sensitive data from error logs
      const sanitizedError = new Error('Decryption error');
      sanitizedError.code = error.code;
      console.error(sanitizedError.message);
      throw sanitizedError;
    }
  }

  /**
   * Get or derive encryption key with caching
   * @private
   */
  async _getDerivedKey(salt, masterKey) {
    // Use hash of key instead of prefix to avoid leaking key info in cache
    const keyHash = crypto.createHash('sha256').update(masterKey).digest('hex').slice(0, 16);
    const saltKey = `${salt.toString('base64')}:${keyHash}`;
    const cached = this.keyCache.get(saltKey);
    
    // Check if cached key is still valid
    if (cached && Date.now() < cached.expiresAt) {
      // Return a COPY of the cached key to prevent zeroing the cached version
      return Buffer.from(cached.key);
    }
    
    // Derive new key using async scrypt (non-blocking)
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.scrypt(masterKey, salt, 32, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
    
    // Cache the derived key with TTL
    this.keyCache.set(saltKey, {
      key: derivedKey,
      expiresAt: Date.now() + this.keyCacheTTL,
    });
    
    // Enforce max cache size using LRU eviction
    if (this.keyCache.size > this.maxCachedKeys) {
      const firstKey = this.keyCache.keys().next().value;
      const evicted = this.keyCache.get(firstKey);
      if (evicted && evicted.key) {
        this._zeroBuffer(evicted.key);
      }
      this.keyCache.delete(firstKey);
    }
    
    // Return a COPY to prevent zeroing the cached version
    return Buffer.from(derivedKey);
  }

  /**
   * Zero sensitive data from buffer
   * @private
   */
  _zeroBuffer(buffer) {
    if (buffer && Buffer.isBuffer(buffer)) {
      buffer.fill(0);
    }
  }

  /**
   * Clear the key derivation cache
   */
  clearKeyCache() {
    // Zero all cached keys before clearing
    for (const [, cached] of this.keyCache) {
      if (cached && cached.key) {
        this._zeroBuffer(cached.key);
      }
    }
    this.keyCache.clear();
  }

  /**
   * Rotate to a new encryption key
   * @param {string} newKey - The new active encryption key
   */
  rotateKey(newKey) {
    if (!newKey || typeof newKey !== 'string') {
      throw new Error('New encryption key must be a non-empty string');
    }
    
    // Move current active key to previous keys
    this.previousKeys.unshift(this.activeKey);
    
    // Limit previous keys to prevent unbounded growth (keep last 3 keys)
    if (this.previousKeys.length > 3) {
      this.previousKeys = this.previousKeys.slice(0, 3);
    }
    
    // Set new active key and track rotation time
    this.activeKey = newKey;
    this.keyRotationTimestamps.set(newKey, Date.now());
    
    // Clear key cache to force re-derivation with new keys
    this.clearKeyCache();
  }

  /**
   * Get current key rotation status
   */
  getKeyStatus() {
    const activeKeyRotationTime = this.keyRotationTimestamps.get(this.activeKey);
    return {
      hasActiveKey: !!this.activeKey,
      previousKeyCount: this.previousKeys.length,
      cacheSize: this.keyCache.size,
      hmacEnabled: this.enableHMAC,
      aadEnabled: this.enableAAD,
      keyRotationGracePeriod: this.keyRotationGracePeriod,
      activeKeyAge: activeKeyRotationTime ? Date.now() - activeKeyRotationTime : null,
    };
  }
}

// ============================================================================
// Cache Strategies
// ============================================================================

/**
 * In-memory cache implementation
 */
export class MemoryCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100; // Max number of entries (fallback)
    this.maxBytes = options.maxBytes || null; // Max total bytes (preferred)
    this.currentBytes = 0; // Track total cache size in bytes
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes default
    this.compressionThreshold = options.compressionThreshold || 1024; // Compress values > 1KB
    this.compressionAlgorithm = options.compressionAlgorithm || 'gzip'; // 'gzip', 'zstd'
    this.zstdLevel = options.zstdLevel || 3; // Zstd compression level (1-22, default 3)
    this.cleanupInterval = null;
    this.lruMode = options.lruMode || 'secure'; // 'secure' (sort-based) or 'fast' (Map re-insertion)
    this.lruSortThreshold = options.lruSortThreshold || 1000; // Only sort when cache size > threshold
    this.cleanupStrategy = options.cleanupStrategy || 'interval'; // 'interval', 'adaptive', or 'probabilistic'
    this.cleanupProbability = options.cleanupProbability || 0.01; // 1% chance on get() for probabilistic mode
    this.encryption = options.encryptionKey ? new CacheEncryption(options.encryptionKey, {
      enableHMAC: options.enableHMAC,
      enableAAD: options.enableAAD,
      keyRotationGracePeriod: options.keyRotationGracePeriod,
    }) : null;
    this.hooks = options.hooks || {};
    this._startCleanup();
  }

  async get(key) {
    // Probabilistic cleanup: randomly check for expired entries on get()
    if (this.cleanupStrategy === 'probabilistic' && Math.random() < this.cleanupProbability) {
      const now = Date.now();
      for (const [k, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this._deleteEntry(k, 'ttl-expired');
        }
      }
    }
    
    const entry = this.cache.get(key);
    
    if (!entry) {
      // Cache miss hook
      if (this.hooks.onMiss) {
        try {
          this.hooks.onMiss(key);
        } catch (error) {
          console.error('Cache onMiss hook error:', error);
        }
      }
      return null;
    }
    
    const now = Date.now();
    
    // Check if completely expired (beyond stale period)
    if (entry.staleUntil && now > entry.staleUntil) {
      this._deleteEntry(key, 'expired');
      // Cache miss hook
      if (this.hooks.onMiss) {
        try {
          this.hooks.onMiss(key);
        } catch (error) {
          console.error('Cache onMiss hook error:', error);
        }
      }
      return null;
    }
    
    // Check if expired (no stale-while-revalidate)
    if (!entry.staleUntil && now > entry.expiresAt) {
      this._deleteEntry(key, 'expired');
      // Cache miss hook
      if (this.hooks.onMiss) {
        try {
          this.hooks.onMiss(key);
        } catch (error) {
          console.error('Cache onMiss hook error:', error);
        }
      }
      return null;
    }
    
    // Check if stale (needs revalidation)
    const isStale = entry.staleAt && now > entry.staleAt && now <= entry.staleUntil;
    
    // Update access time for LRU
    entry.lastAccess = now;
    
    // Fast LRU mode: Re-insert to move to end of Map (maintains insertion order)
    if (this.lruMode === 'fast') {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    
    // Cache hit hook
    if (this.hooks.onHit) {
      try {
        this.hooks.onHit(key, {
          stale: isStale,
          compressed: entry.compressed,
          encrypted: entry.encrypted,
          size: entry.size,
          age: now - entry.createdAt,
          ttl: Math.max(0, entry.expiresAt - now),
        });
      } catch (error) {
        console.error('Cache onHit hook error:', error);
      }
    }
    
    // Fast path: raw object (no processing needed)
    if (!entry.encrypted && !entry.compressed) {
      return { value: entry.value, stale: isStale };
    }
    
    // Slow path: needs processing
    let value = entry.value;
    
    // Step 1: Decrypt first (if encrypted)
    if (entry.encrypted && this.encryption) {
      try {
        // Pass cache key as AAD context for binding
        value = await this.encryption.decrypt(value, key);
      } catch (error) {
        // Sanitized error already logged in decrypt()
        this._deleteEntry(key, 'decryption-error');
        // Error hook
        if (this.hooks.onError) {
          try {
            this.hooks.onError(error, 'decrypt', key);
          } catch (hookError) {
            console.error('Cache onError hook error:', hookError);
          }
        }
        return null;
      }
    }
    
    // Step 2: Decompress after decryption (if compressed)
    if (entry.compressed) {
      try {
        // If it was encrypted, value is now a base64 string, convert back to buffer
        const buffer = entry.encrypted ? Buffer.from(value, 'base64') : value;
        
        // Detect compression algorithm
        if (entry.compressionAlgorithm === 'zstd') {
          const decompressed = await zstd.decompress(buffer);
          return { value: JSON.parse(decompressed.toString()), stale: isStale };
        } else {
          // Default to gzip
          const decompressed = await gunzip(buffer);
          return { value: JSON.parse(decompressed.toString()), stale: isStale };
        }
      } catch (error) {
        console.error('Decompression error:', error);
        this._deleteEntry(key, 'decompression-error');
        // Error hook
        if (this.hooks.onError) {
          try {
            this.hooks.onError(error, 'decompress', key);
          } catch (hookError) {
            console.error('Cache onError hook error:', hookError);
          }
        }
        return null;
      }
    }
    
    // Only encrypted (not compressed) - parse once
    return { value: JSON.parse(value), stale: isStale };
  }

  async set(key, value, ttl = this.defaultTTL, options = {}) {
    // Check if key already exists (update may change size)
    const isUpdate = this.cache.has(key);
    const oldEntry = isUpdate ? this.cache.get(key) : null;
    
    // Determine if we need processing
    const needsEncryption = this.encryption && options.encrypt !== false;
    const serialized = JSON.stringify(value);
    const needsCompression = serialized.length > this.compressionThreshold;
    
    // Calculate stale time (for stale-while-revalidate)
    const staleWhileRevalidate = options.staleWhileRevalidate || 0;
    
    // Fast path: no processing needed - store raw object
    if (!needsEncryption && !needsCompression) {
      const entrySize = this._calculateSize(value, false, false);
      
      // Enforce size limits before adding
      if (!isUpdate) {
        this._ensureSpace(entrySize);
      } else if (oldEntry) {
        // Update: adjust current bytes
        this.currentBytes -= oldEntry.size;
      }
      
      const entry = {
        value: value,
        compressed: false,
        encrypted: false,
        compressionAlgorithm: null,
        size: entrySize,
        expiresAt: Date.now() + (ttl * 1000),
        staleAt: staleWhileRevalidate > 0 ? Date.now() + (ttl * 1000) : null,
        staleUntil: staleWhileRevalidate > 0 ? Date.now() + ((ttl + staleWhileRevalidate) * 1000) : null,
        lastAccess: Date.now(),
        createdAt: Date.now(),
      };
      
      this.cache.set(key, entry);
      this.currentBytes += entrySize;
      return;
    }
    
    // Slow path: processing needed (serialize once)
    let storedValue = serialized;
    let compressed = false;
    let encrypted = false;
    
    // Step 1: Compress first (if needed)
    if (needsCompression) {
      try {
        if (this.compressionAlgorithm === 'zstd') {
          storedValue = await zstd.compress(Buffer.from(serialized), this.zstdLevel);
        } else {
          storedValue = await gzip(serialized);
        }
        compressed = true;
      } catch (error) {
        console.error('Compression error:', error);
        // Fall back to uncompressed
        storedValue = serialized;
      }
    }
    
    // Step 2: Encrypt after compression (if encryption is enabled)
    if (needsEncryption) {
      try {
        // Convert buffer to base64 string if compressed
        const dataToEncrypt = compressed ? storedValue.toString('base64') : storedValue;
        // Pass cache key as AAD context for binding
        storedValue = await this.encryption.encrypt(dataToEncrypt, key);
        encrypted = true;
      } catch (error) {
        // Sanitized error already logged in encrypt()
        throw error; // Don't store unencrypted if encryption was requested
      }
    }
    
    const entrySize = this._calculateSize(storedValue, compressed, encrypted);
    
    // Enforce size limits before adding
    if (!isUpdate) {
      this._ensureSpace(entrySize);
    } else if (oldEntry) {
      // Update: adjust current bytes
      this.currentBytes -= oldEntry.size;
    }
    
    const entry = {
      value: storedValue,
      compressed,
      encrypted,
      compressionAlgorithm: compressed ? this.compressionAlgorithm : null,
      size: entrySize,
      expiresAt: Date.now() + (ttl * 1000),
      staleAt: staleWhileRevalidate > 0 ? Date.now() + (ttl * 1000) : null,
      staleUntil: staleWhileRevalidate > 0 ? Date.now() + ((ttl + staleWhileRevalidate) * 1000) : null,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    };
    
    this.cache.set(key, entry);
    this.currentBytes += entrySize;
    
    // Cache set hook
    if (this.hooks.onSet) {
      try {
        this.hooks.onSet(key, entrySize, ttl, {
          compressed,
          encrypted,
          compressionAlgorithm: compressed ? this.compressionAlgorithm : null,
          staleWhileRevalidate,
        });
      } catch (error) {
        console.error('Cache onSet hook error:', error);
      }
    }
  }

  delete(key) {
    return this._deleteEntry(key);
  }

  clear() {
    this.cache.clear();
    this.currentBytes = 0;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this._deleteEntry(key);
      return false;
    }
    
    return true;
  }

  /**
   * Calculate size of entry in bytes
   * @private
   */
  _calculateSize(value, compressed, encrypted) {
    if (compressed || encrypted) {
      // Already a buffer or string - use length
      return Buffer.byteLength(value);
    }
    // Raw object - estimate size from JSON
    return Buffer.byteLength(JSON.stringify(value));
  }

  /**
   * Delete entry and update byte counter
   * @private
   */
  _deleteEntry(key, reason = 'manual') {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentBytes -= entry.size || 0;
      const deleted = this.cache.delete(key);
      
      // Evict hook (only for non-manual deletions)
      if (deleted && reason !== 'manual' && this.hooks.onEvict) {
        try {
          this.hooks.onEvict(key, reason);
        } catch (error) {
          console.error('Cache onEvict hook error:', error);
        }
      }
      
      return deleted;
    }
    return false;
  }

  /**
   * Ensure enough space for new entry
   * @private
   */
  _ensureSpace(requiredBytes) {
    // If maxBytes is set, use byte-based eviction
    if (this.maxBytes) {
      while (this.currentBytes + requiredBytes > this.maxBytes && this.cache.size > 0) {
        this._evictLRU();
      }
    } else {
      // Fall back to entry-count based eviction
      while (this.cache.size >= this.maxSize) {
        this._evictLRU();
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      maxBytes: this.maxBytes,
      currentBytes: this.currentBytes,
      utilizationPercent: this.maxBytes ? ((this.currentBytes / this.maxBytes) * 100).toFixed(2) : null,
      compressionAlgorithm: this.compressionAlgorithm,
      encryptionEnabled: !!this.encryption,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => {
        return {
          key,
          size: entry.size || 0,
          compressed: entry.compressed || false,
          compressionAlgorithm: entry.compressionAlgorithm || null,
          encrypted: entry.encrypted || false,
          expiresIn: Math.max(0, entry.expiresAt - Date.now()),
          age: Date.now() - entry.createdAt,
        };
      }),
    };
  }

  _evictLRU() {
    if (this.cache.size === 0) return;
    
    // Fast mode: Use Map re-insertion for O(1) LRU tracking
    // Relies on Map's insertion order guarantee (ES2015+)
    if (this.lruMode === 'fast') {
      const firstKey = this.cache.keys().next().value;
      this._deleteEntry(firstKey, 'lru-eviction');
      return;
    }
    
    // Secure mode: Sort-based LRU for timing attack resistance
    // For small caches (below threshold), still use sort for correctness
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    this._deleteEntry(entries[0][0], 'lru-eviction');
  }

  _startCleanup() {
    if (this.cleanupStrategy === 'probabilistic') {
      // Probabilistic cleanup happens on get() - no interval needed
      return;
    }
    
    // Calculate cleanup interval based on strategy
    let intervalMs = 60000; // Default: 1 minute
    
    if (this.cleanupStrategy === 'adaptive') {
      // Adaptive: More frequent cleanup for larger caches
      // Scale from 30s (small) to 5min (large)
      const maxEntries = this.maxSize || 1000;
      intervalMs = Math.min(300000, Math.max(30000, maxEntries * 30));
    }
    
    // Cleanup expired entries at calculated interval
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this._deleteEntry(key, 'ttl-expired');
        }
      }
    }, intervalMs);
    
    // Prevent Node.js from hanging on this interval
    // Allows process to exit even if interval is active
    this.cleanupInterval.unref();
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.currentBytes = 0;
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
    this.compressionThreshold = options.compressionThreshold || 1024; // Compress values > 1KB
    this.compressionAlgorithm = options.compressionAlgorithm || 'gzip'; // 'gzip', 'zstd'
    this.zstdLevel = options.zstdLevel || 3; // Zstd compression level (1-22, default 3)
    this.encryption = options.encryptionKey ? new CacheEncryption(options.encryptionKey, {
      enableHMAC: options.enableHMAC,
      enableAAD: options.enableAAD,
      keyRotationGracePeriod: options.keyRotationGracePeriod,
    }) : null;
    this.hooks = options.hooks || {};
    
    if (!this.client) {
      throw new Error('Redis client is required for RedisCache');
    }
  }

  async get(key) {
    try {
      let value = await this.client.get(this.prefix + key);
      if (!value) {
        // Cache miss hook
        if (this.hooks.onMiss) {
          try {
            this.hooks.onMiss(key);
          } catch (error) {
            console.error('Cache onMiss hook error:', error);
          }
        }
        return null;
      }
      
      let isStale = false;
      
      // Check if this is a stale-while-revalidate entry
      if (value.startsWith('{"data":') && value.includes('"staleAt":')) {
        try {
          const metadata = JSON.parse(value);
          isStale = Date.now() > metadata.staleAt;
          value = metadata.data;
        } catch (error) {
          // Not a metadata object, treat as regular value
        }
      }
      
      let isEncrypted = false;
      let isCompressed = false;
      
      // Step 1: Check if encrypted and decrypt first
      // Updated to check for both old format ({"iv":) and new format ({"salt":, {"v":)
      if (this.encryption && (value.startsWith('{"iv":') || value.startsWith('{"salt":') || value.startsWith('{"v":'))) {
        try {
          // Pass cache key as AAD context for binding
          value = await this.encryption.decrypt(value, key);
          isEncrypted = true;
        } catch (error) {
          // Sanitized error already logged in decrypt()
          // Error hook
          if (this.hooks.onError) {
            try {
              this.hooks.onError(error, 'decrypt', key);
            } catch (hookError) {
              console.error('Cache onError hook error:', hookError);
            }
          }
          return null;
        }
      }
      
      // Step 2: Check if compressed and decompress after decryption
      // If encrypted, the decrypted value might be base64-encoded compressed data
      const buffer = Buffer.from(value, 'base64');
      
      // Check for gzip magic bytes (0x1f 0x8b)
      if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
        try {
          const decompressed = await gunzip(buffer);
          const result = { value: JSON.parse(decompressed.toString()), stale: isStale };
          
          // Cache hit hook
          if (this.hooks.onHit) {
            try {
              this.hooks.onHit(key, {
                stale: isStale,
                compressed: true,
                encrypted: isEncrypted,
                compressionAlgorithm: 'gzip',
              });
            } catch (error) {
              console.error('Cache onHit hook error:', error);
            }
          }
          
          return result;
        } catch (error) {
          console.error('Redis decompression error:', error);
          // Error hook
          if (this.hooks.onError) {
            try {
              this.hooks.onError(error, 'decompress', key);
            } catch (hookError) {
              console.error('Cache onError hook error:', hookError);
            }
          }
          return null;
        }
      }
      
      // Check for zstd magic bytes (0x28 0xb5 0x2f 0xfd)
      if (buffer[0] === 0x28 && buffer[1] === 0xb5 && buffer[2] === 0x2f && buffer[3] === 0xfd) {
        try {
          const decompressed = await zstd.decompress(buffer);
          const result = { value: JSON.parse(decompressed.toString()), stale: isStale };
          
          // Cache hit hook
          if (this.hooks.onHit) {
            try {
              this.hooks.onHit(key, {
                stale: isStale,
                compressed: true,
                encrypted: isEncrypted,
                compressionAlgorithm: 'zstd',
              });
            } catch (error) {
              console.error('Cache onHit hook error:', error);
            }
          }
          
          return result;
        } catch (error) {
          console.error('Redis zstd decompression error:', error);
          // Error hook
          if (this.hooks.onError) {
            try {
              this.hooks.onError(error, 'decompress', key);
            } catch (hookError) {
              console.error('Cache onError hook error:', hookError);
            }
          }
          return null;
        }
      }
      
      // If not compressed, parse JSON directly
      const result = { value: JSON.parse(value), stale: isStale };
      
      // Cache hit hook
      if (this.hooks.onHit) {
        try {
          this.hooks.onHit(key, {
            stale: isStale,
            compressed: false,
            encrypted: isEncrypted,
          });
        } catch (error) {
          console.error('Cache onHit hook error:', error);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Redis get error:', error);
      // Error hook
      if (this.hooks.onError) {
        try {
          this.hooks.onError(error, 'get', key);
        } catch (hookError) {
          console.error('Cache onError hook error:', hookError);
        }
      }
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL, options = {}) {
    try {
      const serialized = JSON.stringify(value);
      const shouldCompress = serialized.length > this.compressionThreshold;
      
      let storedValue = serialized;
      let isCompressed = false;
      let isEncrypted = false;
      
      // Calculate stale time (for stale-while-revalidate)
      const staleWhileRevalidate = options.staleWhileRevalidate || 0;
      const totalTTL = staleWhileRevalidate > 0 ? ttl + staleWhileRevalidate : ttl;
      
      // Step 1: Compress first (if needed)
      if (shouldCompress) {
        try {
          let compressed;
          if (this.compressionAlgorithm === 'zstd') {
            compressed = await zstd.compress(Buffer.from(serialized), this.zstdLevel);
          } else {
            compressed = await gzip(serialized);
          }
          storedValue = compressed.toString('base64');
          isCompressed = true;
        } catch (error) {
          console.error('Redis compression error:', error);
          // Fall back to uncompressed
        }
      }
      
      // Step 2: Encrypt after compression (if encryption is enabled)
      if (this.encryption && options.encrypt !== false) {
        try {
          // Pass cache key as AAD context for binding
          storedValue = await this.encryption.encrypt(storedValue, key);
          isEncrypted = true;
        } catch (error) {
          // Sanitized error already logged in encrypt()
          throw error; // Don't store unencrypted if encryption was requested
        }
      }
      
      // Store metadata for stale-while-revalidate
      if (staleWhileRevalidate > 0) {
        const metadata = {
          data: storedValue,
          staleAt: Date.now() + (ttl * 1000),
        };
        await this.client.setEx(
          this.prefix + key,
          totalTTL,
          JSON.stringify(metadata)
        );
      } else {
        await this.client.setEx(
          this.prefix + key,
          ttl,
          storedValue
        );
      }
      
      // Cache set hook
      if (this.hooks.onSet) {
        try {
          this.hooks.onSet(key, storedValue.length, ttl, {
            compressed: isCompressed,
            encrypted: isEncrypted,
            compressionAlgorithm: isCompressed ? this.compressionAlgorithm : null,
            staleWhileRevalidate,
          });
        } catch (error) {
          console.error('Cache onSet hook error:', error);
        }
      }
    } catch (error) {
      console.error('Redis set error:', error);
      // Error hook
      if (this.hooks.onError) {
        try {
          this.hooks.onError(error, 'set', key);
        } catch (hookError) {
          console.error('Cache onError hook error:', hookError);
        }
      }
    }
  }

  async delete(key) {
    try {
      const deleted = await this.client.del(this.prefix + key);
      
      // Evict hook
      if (deleted > 0 && this.hooks.onEvict) {
        try {
          this.hooks.onEvict(key, 'manual');
        } catch (error) {
          console.error('Cache onEvict hook error:', error);
        }
      }
    } catch (error) {
      console.error('Redis delete error:', error);
      // Error hook
      if (this.hooks.onError) {
        try {
          this.hooks.onError(error, 'delete', key);
        } catch (hookError) {
          console.error('Cache onError hook error:', hookError);
        }
      }
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
        encryptionEnabled: !!this.encryption,
        entries: [],
      };
      
      for (const key of keys.slice(0, 100)) { // Limit to 100 for performance
        const ttl = await this.client.ttl(key);
        const value = await this.client.get(key);
        // Updated to check for both old format ({"iv":) and new format ({"salt":, {"v":)
        const encrypted = value && (value.startsWith('{"iv":') || value.startsWith('{"salt":') || value.startsWith('{"v":'));
        const buffer = Buffer.from(value || '', 'base64');
        const isGzip = !encrypted && buffer[0] === 0x1f && buffer[1] === 0x8b;
        const isZstd = !encrypted && buffer[0] === 0x28 && buffer[1] === 0xb5 && buffer[2] === 0x2f && buffer[3] === 0xfd;
        const compressed = isGzip || isZstd;
        const compressionAlgorithm = isGzip ? 'gzip' : isZstd ? 'zstd' : null;
        
        stats.entries.push({
          key: key.replace(this.prefix, ''),
          expiresIn: ttl * 1000,
          size: value ? value.length : 0,
          compressed,
          compressionAlgorithm,
          encrypted,
        });
      }
      
      return stats;
    } catch (error) {
      console.error('Redis stats error:', error);
      return { size: 0, entries: [] };
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy() {
    // Redis client cleanup is handled externally
    // This method is here for consistency with MemoryCache
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
      maxSize = 100, // Max entries (fallback)
      maxBytes = null, // Max bytes (preferred, e.g., 50 * 1024 * 1024 for 50MB)
      defaultTTL = 300,
      keyPrefix = 'api:',
      cacheVersion = 'v1', // Cache schema version for zero-downtime busts
      enabled = true,
      compressionThreshold = 1024, // Compress values > 1KB
      compressionAlgorithm = 'gzip', // 'gzip' or 'zstd'
      zstdLevel = 3, // Zstd compression level (1-22, default 3 for balanced speed/ratio)
      encryptionKey = null, // Encryption key for sensitive data
      enableHMAC = true, // Enable HMAC for tamper detection (default: enabled)
      enableAAD = true, // Enable AAD for context binding (default: enabled)
      keyRotationGracePeriod = 7 * 24 * 60 * 60 * 1000, // 7 days default
      // Observability hooks
      onHit = null, // Called when cache hit occurs: onHit(key, metadata)
      onMiss = null, // Called when cache miss occurs: onMiss(key)
      onSet = null, // Called when value is cached: onSet(key, size, ttl, metadata)
      onEvict = null, // Called when entry is evicted: onEvict(key, reason)
      onError = null, // Called on cache errors: onError(error, operation, key)
      onRevalidate = null, // Called to revalidate stale data: onRevalidate(key, staleValue, reqContext) => Promise<newValue>
    } = options;

    this.enabled = enabled;
    this.keyPrefix = keyPrefix;
    this.cacheVersion = cacheVersion;
    this.type = type;
    
    // Observability hooks
    this.hooks = {
      onHit,
      onMiss,
      onSet,
      onEvict,
      onError,
      onRevalidate,
    };
    
    if (!enabled) {
      this.store = null;
      return;
    }

    if (type === 'redis' && redis) {
      this.store = new RedisCache({ 
        client: redis, 
        defaultTTL, 
        prefix: keyPrefix, 
        compressionThreshold,
        compressionAlgorithm,
        zstdLevel,
        encryptionKey,
        enableHMAC,
        enableAAD,
        keyRotationGracePeriod,
        hooks: this.hooks,
      });
    } else {
      this.store = new MemoryCache({ 
        maxSize,
        maxBytes,
        defaultTTL, 
        compressionThreshold,
        compressionAlgorithm,
        zstdLevel,
        encryptionKey,
        enableHMAC,
        enableAAD,
        keyRotationGracePeriod,
        hooks: this.hooks,
      });
    }
  }

  /**
   * Generate cache key from request with version prefix
   * Format: {keyPrefix}{cacheVersion}:{hash}
   * Example: api:v1:a1b2c3d4e5f6g7h8
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
    
    return `${this.keyPrefix}${this.cacheVersion}:${hash}`;
  }

  /**
   * Get cached response
   */
  async get(key) {
    if (!this.enabled || !this.store) return null;
    return this.store.get(key);
  }

  /**
   * Set cached response
   */
  async set(key, value, ttl, options) {
    if (!this.enabled || !this.store) return;
    return this.store.set(key, value, ttl, options);
  }

  /**
   * Delete cached response
   */
  delete(key) {
    if (!this.enabled || !this.store) return;
    return this.store.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    if (!this.enabled || !this.store) return;
    return this.store.clear();
  }

  /**
   * Check if key exists
   */
  has(key) {
    if (!this.enabled || !this.store) return false;
    return this.store.has(key);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.enabled || !this.store) {
      return { enabled: false };
    }
    const stats = await this.store.getStats();
    return {
      enabled: true,
      type: this.store instanceof RedisCache ? 'redis' : 'memory',
      cacheVersion: this.cacheVersion,
      keyPrefix: this.keyPrefix,
      ...stats,
    };
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy() {
    if (!this.enabled || !this.store) return;
    if (typeof this.store.destroy === 'function') {
      return this.store.destroy();
    }
  }

  /**
   * Rotate encryption key (if encryption is enabled)
   * @param {string} newKey - The new active encryption key
   */
  rotateEncryptionKey(newKey) {
    if (!this.enabled || !this.store) {
      throw new Error('Cache is not enabled');
    }
    
    if (!this.store.encryption) {
      throw new Error('Encryption is not enabled for this cache');
    }
    
    this.store.encryption.rotateKey(newKey);
  }

  /**
   * Get encryption key status (if encryption is enabled)
   */
  getEncryptionStatus() {
    if (!this.enabled || !this.store || !this.store.encryption) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      ...this.store.encryption.getKeyStatus(),
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
    maxSize = 100, // Max entries (fallback)
    maxBytes = null, // Max bytes (preferred, e.g., 50 * 1024 * 1024 for 50MB)
    defaultTTL = 300,
    keyPrefix = 'api:',
    cacheVersion = 'v1', // Cache schema version for zero-downtime busts
    shouldCache = null, // Custom function to determine if response should be cached (can return boolean or { cache: boolean, ttl: number })
    varyBy = [], // Additional headers to vary cache by (e.g., ['Authorization', 'Accept-Language'])
    compressionThreshold = 1024, // Compress values > 1KB
    compressionAlgorithm = 'gzip', // 'gzip' or 'zstd'
    zstdLevel = 3, // Zstd compression level (1-22, default 3)
    encryptionKey = null, // Encryption key for sensitive data (e.g., process.env.CACHE_ENCRYPTION_KEY)
    encryptByDefault = false, // Whether to encrypt all cached data by default
    maxCacheSize = 10 * 1024 * 1024, // Maximum response size to cache (default 10MB)
    enableHMAC = true, // Enable HMAC for tamper detection (default: enabled)
    enableAAD = true, // Enable AAD for context binding (default: enabled)
    keyRotationGracePeriod = 7 * 24 * 60 * 60 * 1000, // 7 days default
    staleWhileRevalidate = 0, // Serve stale content while revalidating in background (seconds, 0 = disabled)
    allowPrivate = false, // Allow caching responses with Cache-Control: private
    autoETag = true, // Automatically generate ETags for responses
    // Observability hooks
    onHit = null, // Called when cache hit occurs: onHit(key, metadata)
    onMiss = null, // Called when cache miss occurs: onMiss(key)
    onSet = null, // Called when value is cached: onSet(key, size, ttl, metadata)
    onEvict = null, // Called when entry is evicted: onEvict(key, reason)
    onError = null, // Called on cache errors: onError(error, operation, key)
    onRevalidate = null, // Called to revalidate stale data: onRevalidate(key, staleValue, reqContext) => Promise<newValue>
  } = options;

  const cacheManager = new CacheManager({
    enabled,
    type,
    redis,
    maxSize,
    maxBytes,
    defaultTTL,
    keyPrefix,
    cacheVersion,
    compressionThreshold,
    compressionAlgorithm,
    zstdLevel,
    encryptionKey,
    enableHMAC,
    enableAAD,
    keyRotationGracePeriod,
    onHit,
    onMiss,
    onSet,
    onEvict,
    onError,
    onRevalidate,
  });

  // Track ongoing revalidations to prevent duplicate requests
  const revalidating = new Map();
  
  return {
    cacheManager,
    
    /**
     * Middleware function to wrap API handlers
     */
    async middleware(req, res, next) {
      // Only cache GET and HEAD requests by default
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }
      
      // Don't cache range requests
      if (req.headers.range) {
        res.setHeader('X-Cache-Skip-Reason', 'range-request');
        return next();
      }

      // Maximum response size to cache (default 10MB)
      const maxCacheSize = options.maxCacheSize || 10 * 1024 * 1024;

      // Generate cache key with vary headers
      let cacheKey = cacheManager.generateKey(req);
      
      // Collect vary headers for cache key
      const varyHeaders = [...varyBy];
      
      if (varyHeaders.length > 0) {
        const varyHash = crypto
          .createHash('sha256')
          .update(varyHeaders.map(h => req.headers[h.toLowerCase()] || '').join(':'))
          .digest('hex')
          .slice(0, 8);
        cacheKey += `:${varyHash}`;
      }

      // Try to get from cache
      try {
        const cacheResult = await cacheManager.get(cacheKey);
        
        if (cacheResult) {
          const { value: cached, stale } = cacheResult;
          
          // Check ETag for conditional requests (304 Not Modified)
          const cachedETag = cached.headers?.etag;
          const clientETag = req.headers['if-none-match'];
          
          if (cachedETag && clientETag) {
            // Compare ETags (handle both weak and strong ETags)
            const etagsMatch = clientETag.split(',').some(tag => {
              const trimmed = tag.trim();
              return trimmed === cachedETag || trimmed === `W/${cachedETag}` || `W/${trimmed}` === cachedETag;
            });
            
            if (etagsMatch) {
              // ETags match - respond with 304 Not Modified
              res.statusCode = 304;
              res.setHeader('X-Cache', stale ? 'STALE' : 'HIT');
              res.setHeader('X-Cache-Key', cacheKey);
              res.setHeader('X-Cache-Store', cacheManager.type || 'memory');
              res.setHeader('ETag', cachedETag);
              
              // Copy cache-related headers
              if (cached.headers) {
                ['cache-control', 'expires', 'last-modified', 'vary'].forEach(header => {
                  if (cached.headers[header]) {
                    res.setHeader(header, cached.headers[header]);
                  }
                });
              }
              
              res.end();
              return;
            }
          }
          
          // Serve from cache with enhanced headers
          res.setHeader('X-Cache', stale ? 'STALE' : 'HIT');
          res.setHeader('X-Cache-Key', cacheKey);
          res.setHeader('X-Cache-Store', cacheManager.type || 'memory');
          
          // Add TTL header if available
          if (cached.headers && cached.headers['cache-control']) {
            const match = cached.headers['cache-control'].match(/max-age=(\d+)/);
            if (match) {
              res.setHeader('X-Cache-TTL', match[1]);
            }
          }
          
          // Add encryption status
          if (encryptionKey) {
            res.setHeader('X-Cache-Encrypted', 'true');
          }
          
          // If stale, trigger background revalidation
          if (stale && !revalidating.has(cacheKey)) {
            revalidating.set(cacheKey, true);
            res.setHeader('X-Cache-Status', 'revalidating');
            
            // Background revalidation (fire and forget)
            setImmediate(async () => {
              try {
                // Call onRevalidate hook if provided
                if (cacheManager.hooks.onRevalidate) {
                  try {
                    // Create request context for revalidation
                    const reqContext = {
                      method: req.method,
                      url: req.url,
                      originalUrl: req.originalUrl,
                      query: req.query,
                      body: req.body,
                      headers: req.headers,
                      path: req.path,
                      params: req.params,
                    };
                    
                    // Call revalidation hook with stale value and context
                    const freshValue = await cacheManager.hooks.onRevalidate(
                      cacheKey,
                      cached,
                      reqContext
                    );
                    
                    // If hook returned new value, update cache
                    if (freshValue !== undefined && freshValue !== null) {
                      // Determine TTL and SWR from original or new value
                      let newTTL = defaultTTL;
                      let newSWR = staleWhileRevalidate;
                      
                      // Check if fresh value includes cache config
                      if (typeof freshValue === 'object' && freshValue._cacheConfig) {
                        newTTL = freshValue._cacheConfig.ttl || newTTL;
                        newSWR = freshValue._cacheConfig.staleWhileRevalidate || newSWR;
                        delete freshValue._cacheConfig; // Remove config before caching
                      }
                      
                      await cacheManager.set(
                        cacheKey,
                        freshValue,
                        newTTL,
                        { encrypt: encryptByDefault, staleWhileRevalidate: newSWR }
                      );
                    }
                  } catch (hookError) {
                    console.error('Revalidation hook error:', hookError);
                    // Call error hook if available
                    if (cacheManager.hooks.onError) {
                      try {
                        cacheManager.hooks.onError(hookError, 'revalidate', cacheKey);
                      } catch (errorHookError) {
                        console.error('Error hook failed:', errorHookError);
                      }
                    }
                  }
                }
                
                // Mark revalidation as complete
                revalidating.delete(cacheKey);
              } catch (error) {
                console.error('Revalidation error:', error);
                revalidating.delete(cacheKey);
              }
            });
          }
          
          res.statusCode = cached.statusCode || 200;
          
          // Restore headers
          if (cached.headers) {
            Object.entries(cached.headers).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
          }
          
          // For HEAD requests, skip body
          if (req.method === 'HEAD') {
            res.end();
            return;
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
      } catch (err) {
        console.error('Cache get error:', err);
        // Continue to handler on cache error
      }

      // Cache miss - intercept response
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);
      res.setHeader('X-Cache-Store', cacheManager.type || 'memory');
      
      // Add encryption status
      if (encryptionKey) {
        res.setHeader('X-Cache-Encrypted', encryptByDefault ? 'true' : 'false');
      }

      // Store original methods
      const originalJson = res.json;
      const originalSend = res.send;
      const originalEnd = res.end;
      const originalSetHeader = res.setHeader;

      // Add cache helper methods to response object
      res.cache = function(ttl, options = {}) {
        if (typeof ttl === 'number') {
          this.setHeader('X-Cache-TTL', ttl.toString());
        }
        
        if (options.swr !== undefined) {
          this.setHeader('X-Cache-SWR', options.swr.toString());
        }
        
        if (options.encrypt !== undefined) {
          this.setHeader('X-Cache-Encrypt', options.encrypt ? 'true' : 'false');
        }
        
        // Set standard Cache-Control header
        const cacheControl = [`max-age=${ttl}`];
        if (options.swr) {
          cacheControl.push(`stale-while-revalidate=${options.swr}`);
        }
        if (options.public !== false) {
          cacheControl.push('public');
        }
        if (options.immutable) {
          cacheControl.push('immutable');
        }
        this.setHeader('Cache-Control', cacheControl.join(', '));
        
        return this;
      };

      res.noCache = function() {
        this.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        this.setHeader('Pragma', 'no-cache');
        this.setHeader('Expires', '0');
        this.setHeader('X-Cache-Skip', 'true');
        return this;
      };

      res.cachePrivate = function(ttl) {
        this.setHeader('X-Cache-TTL', ttl.toString());
        this.setHeader('Cache-Control', `private, max-age=${ttl}`);
        return this;
      };

      res.cacheImmutable = function(ttl) {
        this.setHeader('X-Cache-TTL', ttl.toString());
        this.setHeader('Cache-Control', `public, max-age=${ttl}, immutable`);
        return this;
      };

      // Create request-scoped state to prevent race conditions
      const responseState = {
        cached: false, // Flag to prevent duplicate cache writes
        chunks: [],
        totalSize: 0,
        sizeLimitExceeded: false,
        cachingDisabled: false, // Flag to disable caching for streaming/SSE
        originalWrite: res.write,
        originalEnd: res.end,
      };

      // Intercept setHeader to detect streaming/SSE/partial responses
      res.setHeader = function(name, value) {
        const nameLower = name.toLowerCase();
        
        // Check for X-Cache-Skip header (set by res.noCache())
        if (nameLower === 'x-cache-skip' && value === 'true') {
          responseState.cachingDisabled = true;
          return originalSetHeader.apply(this, arguments);
        }
        
        // Disable caching for Server-Sent Events
        if (nameLower === 'content-type' && 
            typeof value === 'string' && 
            value.toLowerCase().includes('text/event-stream')) {
          responseState.cachingDisabled = true;
          res.setHeader('X-Cache-Skip-Reason', 'event-stream');
        }
        
        // Disable caching for chunked transfer encoding
        if (nameLower === 'transfer-encoding' && 
            typeof value === 'string' && 
            value.toLowerCase().includes('chunked')) {
          responseState.cachingDisabled = true;
          res.setHeader('X-Cache-Skip-Reason', 'chunked-encoding');
        }
        
        // Disable caching for partial content responses (range requests)
        if (nameLower === 'accept-ranges' || nameLower === 'content-range') {
          responseState.cachingDisabled = true;
          res.setHeader('X-Cache-Skip-Reason', 'partial-content');
        }
        
        // Check for Cache-Control: no-store
        if (nameLower === 'cache-control' && 
            typeof value === 'string' && 
            value.toLowerCase().includes('no-store')) {
          responseState.cachingDisabled = true;
          res.setHeader('X-Cache-Skip-Reason', 'no-store');
        }
        
        // Check for Cache-Control: private (unless explicitly allowed)
        if (nameLower === 'cache-control' && 
            typeof value === 'string' && 
            value.toLowerCase().includes('private') &&
            !options.allowPrivate) {
          responseState.cachingDisabled = true;
          res.setHeader('X-Cache-Skip-Reason', 'private');
        }
        
        // Note: Vary header automatic detection is not implemented
        // Users should configure varyBy in middleware options instead
        // This is because the Vary header is set by the handler AFTER cache lookup
        
        return originalSetHeader.apply(this, arguments);
      };

      // Helper function to cache response (called only once)
      const cacheResponse = (data) => {
        if (responseState.cached || responseState.cachingDisabled) return; // Already cached or disabled, skip
        responseState.cached = true;
        
        // Don't cache partial content responses (206)
        if (res.statusCode === 206) {
          res.setHeader('X-Cache-Skip-Reason', 'partial-content-206');
          return;
        }
        
        // Determine if response should be cached and get TTL
        let shouldCacheResponse = true;
        let cacheTTL = defaultTTL;
        
        // Check custom shouldCache function
        if (shouldCache) {
          const cacheDecision = shouldCache(req, res, data);
          
          // Support both boolean and object return values
          if (typeof cacheDecision === 'boolean') {
            shouldCacheResponse = cacheDecision;
          } else if (typeof cacheDecision === 'object' && cacheDecision !== null) {
            shouldCacheResponse = cacheDecision.cache !== false;
            if (cacheDecision.ttl !== undefined) {
              cacheTTL = cacheDecision.ttl;
            }
          }
        }
        
        // Check for X-Cache-TTL header override (takes precedence)
        const headerTTL = res.getHeader('X-Cache-TTL');
        if (headerTTL !== undefined) {
          const parsedTTL = parseInt(headerTTL, 10);
          if (!isNaN(parsedTTL) && parsedTTL >= 0) {
            cacheTTL = parsedTTL;
            // Remove the header so it's not sent to client
            res.removeHeader('X-Cache-TTL');
          }
        }
        
        // Check for X-Cache-SWR header override (stale-while-revalidate)
        let cacheSWR = staleWhileRevalidate;
        const headerSWR = res.getHeader('X-Cache-SWR');
        if (headerSWR !== undefined) {
          const parsedSWR = parseInt(headerSWR, 10);
          if (!isNaN(parsedSWR) && parsedSWR >= 0) {
            cacheSWR = parsedSWR;
            // Remove the header so it's not sent to client
            res.removeHeader('X-Cache-SWR');
          }
        }
        
        // Check for X-Cache-Encrypt header (set by res.cache())
        let shouldEncrypt = encryptByDefault;
        const encryptHeader = res.getHeader('X-Cache-Encrypt');
        if (encryptHeader !== undefined) {
          shouldEncrypt = encryptHeader === 'true';
          res.removeHeader('X-Cache-Encrypt'); // Remove internal header
        }
        
        // Generate ETag if not present
        let etag = res.getHeader('ETag');
        if (!etag && options.autoETag !== false) {
          const hash = crypto
            .createHash('md5')
            .update(typeof data === 'string' ? data : JSON.stringify(data))
            .digest('hex');
          etag = `"${hash}"`;
          res.setHeader('ETag', etag);
        }
        
        if (shouldCacheResponse && res.statusCode >= 200 && res.statusCode < 300) {
          // Add TTL to response headers for debugging
          res.setHeader('X-Cache-TTL', cacheTTL.toString());
          
          // Get headers but exclude internal X-Cache-* headers (they'll be set fresh on cache hit)
          const headersToCache = {};
          const allHeaders = res.getHeaders();
          for (const [key, value] of Object.entries(allHeaders)) {
            const keyLower = key.toLowerCase();
            // Exclude internal cache headers - they'll be set fresh on retrieval
            if (!keyLower.startsWith('x-cache')) {
              headersToCache[key] = value;
            }
          }
          
          // Fire and forget - don't await
          cacheManager.set(cacheKey, {
            statusCode: res.statusCode,
            headers: headersToCache,
            body: data,
          }, cacheTTL, { encrypt: shouldEncrypt, staleWhileRevalidate: cacheSWR })
            .catch(err => console.error('Cache set error:', err));
        }
      };

      // Intercept json()
      res.json = function(data) {
        cacheResponse(data);
        return originalJson.call(this, data);
      };

      // Intercept send()
      res.send = function(data) {
        cacheResponse(data);
        return originalSend.call(this, data);
      };

      // Intercept write() for streaming responses
      res.write = function(chunk) {
        if (!responseState.sizeLimitExceeded && !responseState.cachingDisabled) {
          const buffer = Buffer.from(chunk);
          responseState.totalSize += buffer.length;
          
          if (responseState.totalSize > maxCacheSize) {
            responseState.sizeLimitExceeded = true;
            responseState.chunks.length = 0; // Clear chunks to free memory
            res.setHeader('X-Cache-Skip-Reason', 'size-limit-exceeded');
          } else {
            responseState.chunks.push(buffer);
          }
        }
        return responseState.originalWrite.apply(this, arguments);
      };

      // Intercept end() for streaming responses
      res.end = function(chunk) {
        if (chunk && !responseState.sizeLimitExceeded && !responseState.cachingDisabled) {
          const buffer = Buffer.from(chunk);
          responseState.totalSize += buffer.length;
          
          if (responseState.totalSize > maxCacheSize) {
            responseState.sizeLimitExceeded = true;
            responseState.chunks.length = 0; // Clear chunks to free memory
            res.setHeader('X-Cache-Skip-Reason', 'size-limit-exceeded');
          } else {
            responseState.chunks.push(buffer);
          }
        }
        
        // Only cache if size limit not exceeded, not disabled, and not already cached by json/send
        if (!responseState.cached && !responseState.cachingDisabled && !responseState.sizeLimitExceeded && responseState.chunks.length > 0) {
          const body = Buffer.concat(responseState.chunks).toString('utf8');
          cacheResponse(body);
        }
        
        return responseState.originalEnd.apply(this, arguments);
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
    invalidatePattern(pattern) {
      // This is a simplified version - full implementation would need pattern matching
      return cacheManager.clear();
    },
    
    /**
     * Invalidate specific route
     */
    invalidateRoute(route) {
      const key = cacheManager.keyPrefix + route;
      return cacheManager.delete(key);
    },
    
    /**
     * Clear all cache
     */
    clearAll() {
      return cacheManager.clear();
    },
  };
}
