/**
 * Response Compression Middleware
 * 
 * Features:
 * - Automatic algorithm selection based on client support (Accept-Encoding header with q-values)
 * - Smart content-type detection (only compresses API-relevant content types)
 * - Adds Vary: Accept-Encoding header for proper caching
 * - Response caching for identical payloads
 * - Performance optimizations (pre-compiled regexes, adaptive compression levels)
 * 
 * Supports Brotli, Gzip, and Deflate compression
 */

import { brotliCompress, gzip, deflate, createBrotliCompress, createGzip, createDeflate, constants } from 'zlib';
import { promisify } from 'util';
import xxhash from 'xxhash-wasm';
import { pipeline, Readable } from 'stream';
import zstd from '@mongodb-js/zstd';

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);
const pipelineAsync = promisify(pipeline);

// ============================================================================
// Compression Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Compression level (0-9 for gzip, 0-11 for brotli, 1-22 for zstd)
  minCompressionRatio: 0.05, // Minimum compression ratio (5% reduction required)
  maxCompressSize: 10 * 1024 * 1024, // Max payload size to compress (10MB, prevents DoS)
  algorithms: ['br', 'gzip', 'deflate'], // Preferred order
  zstdLevel: 3, // Zstd compression level (1-22, default 3 for balanced speed/ratio)
  compressibleTypes: [
    'application/json',
    'application/javascript',
    'application/xml',
    'application/ld+json',
    'application/hal+json',
    'application/vnd.api+json',
    'application/x-protobuf',
    'application/protobuf+json',
    'application/graphql+json',
    'application/graphql',
    'text/plain',
    'text/xml',
    'image/svg+xml',
  ],
  excludePatterns: [], // Regex patterns to exclude from compression
  cache: {
    enabled: true,
    maxSize: 100, // Max number of cached compressed responses
    maxBytes: 50 * 1024 * 1024, // Max total cache size in bytes (50MB)
    maxResponseSize: 1 * 1024 * 1024, // Max size per response to cache (1MB, prevents large responses from dominating cache)
    maxCompressedSize: 512 * 1024, // Max size per compressed entry (512KB, reduces memory amplification)
    ttl: 300000, // Cache TTL in ms (5 minutes)
  },
  streaming: {
    enabled: true, // Enable true streaming compression for large responses
    threshold: 100 * 1024, // Use streaming for responses > 100KB
  },
  security: {
    // BREACH attack mitigation
    disableOnAuth: false, // Disable compression when Authorization header present
    disableOnCookies: false, // Disable compression when cookies present
    disableOnCSRF: false, // Disable compression when CSRF tokens detected
    csrfTokenPatterns: [ // Patterns to detect CSRF tokens in response body
      /csrf[_-]?token/i,
      /xsrf[_-]?token/i,
      /_token/i,
      /authenticity[_-]?token/i,
    ],
  },
};

/**
 * Compression Presets
 * 
 * Pre-configured compression settings for common use cases.
 * Use these to quickly set up compression without manual configuration.
 * 
 * @example
 * // Development mode - fast compression, less aggressive
 * createCompressionMiddleware(COMPRESSION_PRESETS.development);
 * 
 * @example
 * // Production mode - balanced compression and performance
 * createCompressionMiddleware(COMPRESSION_PRESETS.production);
 * 
 * @example
 * // Override specific settings
 * createCompressionMiddleware({
 *   ...COMPRESSION_PRESETS.production,
 *   threshold: 2048
 * });
 */
export const COMPRESSION_PRESETS = {
  /**
   * Development preset - optimized for fast iteration
   * - Lower compression level for faster builds
   * - Higher threshold to skip small responses
   * - Streaming enabled for large responses
   * - Shorter cache TTL
   */
  development: {
    enabled: true,
    threshold: 5120, // 5KB - skip small responses in dev
    level: 4, // Fast compression
    zstdLevel: 1, // Fastest zstd compression
    minCompressionRatio: 0.05,
    maxCompressSize: 10 * 1024 * 1024, // 10MB
    algorithms: ['br', 'gzip', 'deflate'],
    compressibleTypes: DEFAULT_CONFIG.compressibleTypes,
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 50, // Smaller cache in dev
      maxBytes: 25 * 1024 * 1024, // 25MB
      maxResponseSize: 512 * 1024, // 512KB per response
      maxCompressedSize: 256 * 1024, // 256KB per compressed
      ttl: 60000, // 1 minute
    },
    streaming: {
      enabled: true,
      threshold: 50 * 1024, // 50KB
    },
  },

  /**
   * Production preset - balanced compression and performance
   * - Moderate compression level (recommended)
   * - Standard threshold
   * - Streaming enabled for large responses
   * - Longer cache TTL
   * - BREACH mitigation: Cookies disabled by default for API security
   */
  production: {
    enabled: true,
    threshold: 1024, // 1KB
    level: 6, // Balanced compression
    zstdLevel: 3, // Balanced zstd compression
    minCompressionRatio: 0.05,
    maxCompressSize: 10 * 1024 * 1024, // 10MB
    algorithms: ['br', 'gzip', 'deflate'],
    compressibleTypes: DEFAULT_CONFIG.compressibleTypes,
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 100,
      maxBytes: 50 * 1024 * 1024, // 50MB
      maxResponseSize: 1 * 1024 * 1024, // 1MB per response
      maxCompressedSize: 512 * 1024, // 512KB per compressed
      ttl: 300000, // 5 minutes
    },
    streaming: {
      enabled: true,
      threshold: 100 * 1024, // 100KB
    },
    security: {
      disableOnAuth: false,
      disableOnCookies: true, // BREACH mitigation: Treat Set-Cookie as sensitive by default
      disableOnCSRF: false,
      csrfTokenPatterns: DEFAULT_CONFIG.security.csrfTokenPatterns,
    },
  },

  /**
   * Aggressive preset - maximum compression
   * - Highest compression level
   * - Lower threshold to compress more responses
   * - Streaming at lower threshold
   * - Larger cache for better hit rate
   * - Best for bandwidth-constrained environments
   */
  aggressive: {
    enabled: true,
    threshold: 512, // 512 bytes - compress almost everything
    level: 9, // Maximum compression (slower)
    zstdLevel: 19, // High zstd compression
    minCompressionRatio: 0.03, // Accept smaller gains
    maxCompressSize: 10 * 1024 * 1024, // 10MB
    algorithms: ['br', 'gzip', 'deflate'],
    compressibleTypes: DEFAULT_CONFIG.compressibleTypes,
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 200, // Larger cache
      maxBytes: 100 * 1024 * 1024, // 100MB
      maxResponseSize: 5 * 1024 * 1024, // 5MB per response
      maxCompressedSize: 2 * 1024 * 1024, // 2MB per compressed
      ttl: 600000, // 10 minutes
    },
    streaming: {
      enabled: true,
      threshold: 25 * 1024, // 25KB - stream earlier
    },
  },

  /**
   * Minimal preset - light compression
   * - Lowest compression level
   * - Higher threshold
   * - No streaming (buffered only)
   * - Best for CPU-constrained environments
   */
  minimal: {
    enabled: true,
    threshold: 10240, // 10KB - only compress larger responses
    level: 1, // Fastest compression
    zstdLevel: 1, // Fastest zstd compression
    minCompressionRatio: 0.1, // Only compress if significant gain
    maxCompressSize: 5 * 1024 * 1024, // 5MB (lower for minimal)
    algorithms: ['gzip', 'deflate'], // Skip brotli (slower)
    compressibleTypes: DEFAULT_CONFIG.compressibleTypes,
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 50,
      maxBytes: 25 * 1024 * 1024, // 25MB
      maxResponseSize: 256 * 1024, // 256KB per response
      maxCompressedSize: 128 * 1024, // 128KB per compressed
      ttl: 300000, // 5 minutes
    },
    streaming: {
      enabled: false, // Buffered only
    },
  },

  /**
   * API-optimized preset - tuned for JSON APIs
   * - Optimized for JSON responses
   * - Moderate compression level
   * - Aggressive caching
   * - Streaming for large datasets
   */
  api: {
    enabled: true,
    threshold: 1024, // 1KB
    level: 6,
    zstdLevel: 3,
    minCompressionRatio: 0.05,
    maxCompressSize: 10 * 1024 * 1024, // 10MB
    algorithms: ['br', 'gzip', 'deflate'],
    compressibleTypes: [
      'application/json',
      'application/ld+json',
      'application/hal+json',
      'application/vnd.api+json',
    ],
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 150, // Larger cache for API responses
      maxBytes: 75 * 1024 * 1024, // 75MB
      maxResponseSize: 2 * 1024 * 1024, // 2MB per response
      maxCompressedSize: 1 * 1024 * 1024, // 1MB per compressed
      ttl: 300000, // 5 minutes
    },
    streaming: {
      enabled: true,
      threshold: 100 * 1024, // 100KB
    },
  },

  /**
   * Zstd-optimized preset - uses Zstandard for best speed/ratio balance
   * - Zstd as primary algorithm (faster than gzip with better compression)
   * - Optimized for modern APIs and internal services
   * - Best for high-throughput scenarios
   */
  zstd: {
    enabled: true,
    threshold: 1024, // 1KB
    level: 6,
    zstdLevel: 3, // Balanced zstd level
    minCompressionRatio: 0.05,
    maxCompressSize: 10 * 1024 * 1024, // 10MB
    algorithms: ['zstd', 'br', 'gzip', 'deflate'], // Prefer zstd
    compressibleTypes: DEFAULT_CONFIG.compressibleTypes,
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 100,
      maxBytes: 50 * 1024 * 1024, // 50MB
      maxResponseSize: 1 * 1024 * 1024, // 1MB per response
      maxCompressedSize: 512 * 1024, // 512KB per compressed
      ttl: 300000, // 5 minutes
    },
    streaming: {
      enabled: true,
      threshold: 100 * 1024, // 100KB
    },
    security: {
      disableOnAuth: false,
      disableOnCookies: false,
      disableOnCSRF: false,
      csrfTokenPatterns: DEFAULT_CONFIG.security.csrfTokenPatterns,
    },
  },

  /**
   * Secure preset - BREACH attack mitigation enabled
   * - Disables compression for authenticated requests
   * - Disables compression when cookies present
   * - Disables compression when CSRF tokens detected
   * - Best for applications handling sensitive data
   * - Use when responses may contain secrets + user-controlled input
   */
  secure: {
    enabled: true,
    threshold: 1024, // 1KB
    level: 6,
    zstdLevel: 3,
    minCompressionRatio: 0.05,
    maxCompressSize: 10 * 1024 * 1024, // 10MB
    algorithms: ['br', 'gzip', 'deflate'],
    compressibleTypes: DEFAULT_CONFIG.compressibleTypes,
    excludePatterns: [],
    cache: {
      enabled: true,
      maxSize: 100,
      maxBytes: 50 * 1024 * 1024, // 50MB
      maxResponseSize: 1 * 1024 * 1024, // 1MB per response
      maxCompressedSize: 512 * 1024, // 512KB per compressed
      ttl: 300000, // 5 minutes
    },
    streaming: {
      enabled: true,
      threshold: 100 * 1024, // 100KB
    },
    security: {
      disableOnAuth: true, // BREACH mitigation
      disableOnCookies: true, // BREACH mitigation
      disableOnCSRF: true, // BREACH mitigation
      csrfTokenPatterns: DEFAULT_CONFIG.security.csrfTokenPatterns,
    },
  },

  /**
   * Disabled preset - compression turned off
   * - Useful for debugging or specific routes
   */
  disabled: {
    enabled: false,
  },
};

// ============================================================================
// Compression Manager
// ============================================================================

export class CompressionManager {
  constructor(options = {}) {
    // Support preset names as strings
    if (typeof options === 'string') {
      if (!COMPRESSION_PRESETS[options]) {
        throw new Error(`Unknown compression preset: "${options}". Available presets: ${Object.keys(COMPRESSION_PRESETS).join(', ')}`);
      }
      options = COMPRESSION_PRESETS[options];
    }
    
    // Deep merge security config to preserve default patterns
    const securityConfig = {
      ...DEFAULT_CONFIG.security,
      ...(options.security || {}),
    };
    
    this.config = { 
      ...DEFAULT_CONFIG, 
      ...options,
      security: securityConfig,
    };
    
    // Validate configuration
    this._validateConfig();
    
    // Store zstd level separately for easier access
    this.zstdLevel = this.config.zstdLevel || 3;
    
    this.stats = {
      totalRequests: 0,
      compressed: 0,
      uncompressed: 0,
      bytesIn: 0,
      bytesOut: 0,
      compressionRatio: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheEvictions: 0,
      payloadsTooLarge: 0,
      skippedForSecurity: 0,
      responseCacheHits: 0,
      responseCacheMisses: 0,
      responseCacheEvictions: 0,
      responsesTooLarge: 0,        // NEW: Responses exceeding maxResponseSize
      compressedTooLarge: 0,       // NEW: Compressed results exceeding maxCompressedSize
    };
    
    // Two-tier cache system:
    // 1. Response cache: request → uncompressed payload (shared across algorithms)
    // 2. Compression cache: payload → compressed buffer (per algorithm)
    
    // Response cache: stores uncompressed payloads keyed by request
    // This prevents redundant JSON serialization and handler execution
    this.responseCache = new Map();
    this.responseCacheMemory = 0;
    
    // Compression caches: separate LRU caches per algorithm
    // Same payload can be compressed with different algorithms
    this.caches = {
      br: new Map(),
      gzip: new Map(),
      deflate: new Map(),
      zstd: new Map(),
    };
    
    // Track total cache memory usage per algorithm
    this.cacheMemory = {
      br: 0,
      gzip: 0,
      deflate: 0,
      zstd: 0,
    };
    
    // Pre-compile regex patterns for better performance
    this.excludeRegexes = this.config.excludePatterns.map(pattern => new RegExp(pattern));
    
    // Pre-compile CSRF token patterns
    this.csrfRegexes = (this.config.security && this.config.security.csrfTokenPatterns) 
      ? this.config.security.csrfTokenPatterns 
      : [];
    
    // Lowercase content types once for faster comparison
    this.compressibleTypesLower = this.config.compressibleTypes.map(t => t.toLowerCase());
    
    // Initialize xxHash3 (async, but cached after first call)
    this.hasher = null;
    this._initHasher();
    
    // Start background TTL cleanup if caching is enabled
    this.cleanupInterval = null;
    if (this.config.cache.enabled && this.config.cache.ttl > 0) {
      this._startBackgroundCleanup();
    }
  }

  /**
   * Validate configuration options
   */
  _validateConfig() {
    // Validate compression level based on algorithms
    const hasBrotli = this.config.algorithms.includes('br');
    const hasGzipOrDeflate = this.config.algorithms.includes('gzip') || this.config.algorithms.includes('deflate');
    
    if (hasBrotli && (this.config.level < 0 || this.config.level > 11)) {
      throw new Error(`Invalid compression level for Brotli: ${this.config.level}. Must be between 0 and 11.`);
    }
    
    if (hasGzipOrDeflate && (this.config.level < 0 || this.config.level > 9)) {
      throw new Error(`Invalid compression level for Gzip/Deflate: ${this.config.level}. Must be between 0 and 9.`);
    }
    
    // Validate threshold values
    if (this.config.threshold < 0) {
      throw new Error(`Invalid threshold: ${this.config.threshold}. Must be >= 0.`);
    }
    
    if (this.config.streaming.threshold < 0) {
      throw new Error(`Invalid streaming threshold: ${this.config.streaming.threshold}. Must be >= 0.`);
    }
    
    // Validate max compress size
    if (this.config.maxCompressSize !== undefined && this.config.maxCompressSize < 0) {
      throw new Error(`Invalid maxCompressSize: ${this.config.maxCompressSize}. Must be >= 0.`);
    }
    
    // Validate compression ratio
    if (this.config.minCompressionRatio < 0 || this.config.minCompressionRatio > 1) {
      throw new Error(`Invalid minCompressionRatio: ${this.config.minCompressionRatio}. Must be between 0 and 1.`);
    }
    
    // Validate cache settings
    if (this.config.cache.maxSize < 0) {
      throw new Error(`Invalid cache maxSize: ${this.config.cache.maxSize}. Must be >= 0.`);
    }
    
    if (this.config.cache.maxBytes !== undefined && this.config.cache.maxBytes < 0) {
      throw new Error(`Invalid cache maxBytes: ${this.config.cache.maxBytes}. Must be >= 0.`);
    }
    
    if (this.config.cache.ttl < 0) {
      throw new Error(`Invalid cache TTL: ${this.config.cache.ttl}. Must be >= 0.`);
    }
    
    // Validate algorithms array
    if (!Array.isArray(this.config.algorithms) || this.config.algorithms.length === 0) {
      throw new Error('Invalid algorithms: Must be a non-empty array.');
    }
    
    const validAlgorithms = ['br', 'gzip', 'deflate', 'zstd'];
    const invalidAlgorithms = this.config.algorithms.filter(alg => !validAlgorithms.includes(alg));
    if (invalidAlgorithms.length > 0) {
      throw new Error(`Invalid algorithms: ${invalidAlgorithms.join(', ')}. Valid options are: ${validAlgorithms.join(', ')}.`);
    }
    
    // Validate zstd level
    if (this.config.algorithms.includes('zstd')) {
      const zstdLevel = this.config.zstdLevel !== undefined ? this.config.zstdLevel : 3;
      if (zstdLevel < 1 || zstdLevel > 22) {
        throw new Error(`Invalid zstd compression level: ${zstdLevel}. Must be between 1 and 22.`);
      }
    }
  }

  async _initHasher() {
    if (!this.hasher) {
      const { h64 } = await xxhash();
      this.hasher = { h64 };
    }
    return this.hasher;
  }

  /**
   * Start background cleanup for expired cache entries
   * Runs every minute to remove stale entries
   */
  _startBackgroundCleanup() {
    // Run cleanup every minute (or half of TTL, whichever is smaller)
    const cleanupInterval = Math.min(60000, this.config.cache.ttl / 2);
    
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredEntries();
    }, cleanupInterval);
    
    // Don't prevent Node.js from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Remove expired entries from all caches
   */
  _cleanupExpiredEntries() {
    const now = Date.now();
    let removedCount = 0;
    
    // Clean compression caches
    for (const algorithm of ['br', 'gzip', 'deflate', 'zstd']) {
      const cache = this.caches[algorithm];
      
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp >= this.config.cache.ttl) {
          cache.delete(key);
          this.cacheMemory[algorithm] -= entry.size;
          removedCount++;
        }
      }
    }
    
    // Clean response cache
    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp >= this.config.cache.ttl) {
        this.responseCache.delete(key);
        this.responseCacheMemory -= entry.size;
        removedCount++;
      }
    }
    
    if (removedCount > 0 && process.env.NODE_ENV !== 'production') {
      console.log(`[Compression] Cleaned up ${removedCount} expired cache entries`);
    }
  }

  /**
   * Stop background cleanup (for graceful shutdown)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Generate cache key from buffer using xxHash3
   * No need to include algorithm in key since we have separate caches
   * 
   * Performance: Uses hex encoding instead of base64
   * - Hex is 2x expansion vs base64's 1.33x expansion
   * - But hex is faster to encode/decode
   * - Still better than base64 for hashing purposes
   * 
   * Note: xxhash-wasm h64() requires string input, not binary
   * Future: Consider switching to a hash library that supports binary input
   */
  async _getCacheKey(buffer) {
    await this._initHasher();
    // Partial hashing optimization: hash first 64KB + buffer length
    // Avoids expensive full buffer conversion while maintaining low collision risk
    const HASH_SLICE_SIZE = 65536; // 64KB
    const slice = buffer.length > HASH_SLICE_SIZE 
      ? buffer.subarray(0, HASH_SLICE_SIZE)
      : buffer;
    
    // Use binary encoding (faster than hex, half the memory)
    const hashInput = slice.toString('binary') + ':' + buffer.length;
    return this.hasher.h64(hashInput).toString();
  }

  /**
   * Get cached compressed response (LRU implementation)
   * When an item is accessed, it's moved to the end (most recently used)
   */
  _getFromCache(key, algorithm) {
    if (!this.config.cache.enabled) return null;
    
    const cache = this.caches[algorithm];
    if (!cache) return null;
    
    const entry = cache.get(key);
    
    if (!entry) {
      this.stats.cacheMisses++;
      return null;
    }
    
    // Use entry-specific TTL if available, otherwise fall back to global TTL
    const ttl = entry.ttl !== undefined ? entry.ttl : this.config.cache.ttl;
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp >= ttl) {
      // Remove expired entry and update memory tracking
      cache.delete(key);
      this.cacheMemory[algorithm] -= entry.size;
      this.stats.cacheMisses++;
      return null;
    }
    
    // LRU: Move to end (most recently used) by deleting and re-adding
    cache.delete(key);
    cache.set(key, entry);
    
    this.stats.cacheHits++;
    return entry.value;
  }

  /**
   * Store compressed response in cache (LRU implementation)
   * Evicts least recently used items when cache is full
   * Also enforces memory limits
   * @param {string} key - Cache key
   * @param {Object} value - Compressed buffer and metadata
   * @param {string} algorithm - Compression algorithm
   * @param {number} [ttl] - Optional per-entry TTL in milliseconds
   */
  _setCache(key, value, algorithm, ttl) {
    if (!this.config.cache.enabled) return;
    
    const cache = this.caches[algorithm];
    if (!cache) return;
    
    const entrySize = value.buffer.length;
    
    // NEW: Skip caching if compressed result exceeds per-compressed size limit
    if (this.config.cache.maxCompressedSize && entrySize > this.config.cache.maxCompressedSize) {
      this.stats.compressedTooLarge++;
      return;
    }
    
    // Check if single entry exceeds maxBytes (if configured)
    if (this.config.cache.maxBytes && entrySize > this.config.cache.maxBytes) {
      // Entry too large to cache
      return;
    }
    
    // If key already exists, delete it first (will be re-added at end)
    if (cache.has(key)) {
      const oldEntry = cache.get(key);
      cache.delete(key);
      this.cacheMemory[algorithm] -= oldEntry.size;
    }
    
    // Evict entries until we have space (both count and memory)
    while (
      cache.size >= this.config.cache.maxSize ||
      (this.config.cache.maxBytes && this.cacheMemory[algorithm] + entrySize > this.config.cache.maxBytes)
    ) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break; // Cache is empty
      
      const oldestEntry = cache.get(oldestKey);
      cache.delete(oldestKey);
      this.cacheMemory[algorithm] -= oldestEntry.size;
      this.stats.cacheEvictions++;
    }
    
    // Add new entry at the end (most recently used)
    const entry = {
      value,
      timestamp: Date.now(),
      size: entrySize,
      ttl, // Store per-entry TTL (undefined means use global TTL)
    };
    
    cache.set(key, entry);
    this.cacheMemory[algorithm] += entrySize;
  }

  /**
   * Generate response cache key from request
   * Uses URL + method + relevant headers for cache key
   */
  _getResponseCacheKey(req) {
    // Include method, URL, and cache-affecting headers
    const method = req.method || 'GET';
    const url = req.url || req.originalUrl || '/';
    
    // Include headers that affect response content
    const varyHeaders = [];
    if (req.headers['accept']) varyHeaders.push(req.headers['accept']);
    if (req.headers['accept-language']) varyHeaders.push(req.headers['accept-language']);
    
    return `${method}:${url}:${varyHeaders.join(':')}`;
  }

  /**
   * Get cached uncompressed response payload
   * Returns null if not found or expired
   */
  _getFromResponseCache(key) {
    if (!this.config.cache.enabled) return null;
    
    const entry = this.responseCache.get(key);
    
    if (!entry) {
      this.stats.responseCacheMisses++;
      return null;
    }
    
    // Use entry-specific TTL if available, otherwise fall back to global TTL
    const ttl = entry.ttl !== undefined ? entry.ttl : this.config.cache.ttl;
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp >= ttl) {
      this.responseCache.delete(key);
      this.responseCacheMemory -= entry.size;
      this.stats.responseCacheMisses++;
      return null;
    }
    
    // LRU: Move to end (most recently used)
    this.responseCache.delete(key);
    this.responseCache.set(key, entry);
    
    this.stats.responseCacheHits++;
    return entry.buffer;
  }

  /**
   * Store uncompressed response payload in cache
   * Evicts least recently used items when cache is full
   * @param {string} key - Cache key
   * @param {Buffer} buffer - Uncompressed response buffer
   * @param {number} [ttl] - Optional per-entry TTL in milliseconds
   */
  _setResponseCache(key, buffer, ttl) {
    if (!this.config.cache.enabled) return;
    
    const entrySize = buffer.length;
    
    // NEW: Skip caching if response exceeds per-response size limit
    if (this.config.cache.maxResponseSize && entrySize > this.config.cache.maxResponseSize) {
      this.stats.responsesTooLarge++;
      return;
    }
    
    // Check if single entry exceeds maxBytes
    if (this.config.cache.maxBytes && entrySize > this.config.cache.maxBytes) {
      return;
    }
    
    // If key already exists, delete it first
    if (this.responseCache.has(key)) {
      const oldEntry = this.responseCache.get(key);
      this.responseCache.delete(key);
      this.responseCacheMemory -= oldEntry.size;
    }
    
    // Evict entries until we have space
    while (
      this.responseCache.size >= this.config.cache.maxSize ||
      (this.config.cache.maxBytes && this.responseCacheMemory + entrySize > this.config.cache.maxBytes)
    ) {
      const oldestKey = this.responseCache.keys().next().value;
      if (!oldestKey) break;
      
      const oldestEntry = this.responseCache.get(oldestKey);
      this.responseCache.delete(oldestKey);
      this.responseCacheMemory -= oldestEntry.size;
      this.stats.responseCacheEvictions++;
    }
    
    // Add new entry
    const entry = {
      buffer,
      timestamp: Date.now(),
      size: entrySize,
      ttl, // Store per-entry TTL (undefined means use global TTL)
    };
    
    this.responseCache.set(key, entry);
    this.responseCacheMemory += entrySize;
  }

  /**
   * Check if content should be compressed
   * Smart content-type detection - only compresses API-relevant types
   */
  shouldCompress(contentType, contentLength, url) {
    // Check if compression is enabled
    if (!this.config.enabled) return false;

    // Check content length threshold
    if (contentLength < this.config.threshold) return false;

    // Smart content-type detection (optimized with pre-lowercased types)
    if (contentType) {
      const contentTypeLower = contentType.toLowerCase();
      const isCompressible = this.compressibleTypesLower.some(type =>
        contentTypeLower.includes(type)
      );
      if (!isCompressible) return false;
    }

    // Check exclude patterns (using pre-compiled regexes)
    if (this.excludeRegexes.length > 0) {
      const isExcluded = this.excludeRegexes.some(regex => regex.test(url));
      if (isExcluded) return false;
    }

    return true;
  }

  /**
   * Check for security concerns (BREACH attack mitigation)
   * Returns true if compression should be skipped for security reasons
   */
  hasSecurityConcerns(req, res, responseBody) {
    const security = this.config.security;
    
    // Check Authorization header
    if (security.disableOnAuth && req.headers.authorization) {
      return true;
    }
    
    // Check for cookies (both request and response)
    if (security.disableOnCookies) {
      const hasCookies = req.headers.cookie || res.getHeader('set-cookie');
      if (hasCookies) {
        return true;
      }
    }
    
    // Check for CSRF tokens in response body
    if (security.disableOnCSRF && responseBody && this.csrfRegexes.length > 0) {
      const bodyStr = typeof responseBody === 'string' 
        ? responseBody.substring(0, 10000) // Check first 10KB
        : Buffer.isBuffer(responseBody)
          ? responseBody.toString('utf8', 0, Math.min(responseBody.length, 10000)) // Check first 10KB
          : JSON.stringify(responseBody).substring(0, 10000);
      
      // Check if any CSRF token pattern matches
      const hasCSRFToken = this.csrfRegexes.some(regex => regex.test(bodyStr));
      if (hasCSRFToken) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Select and validate best compression algorithm
   * Returns validated algorithm or null if none suitable
   * Implements fallback: if first choice is rejected, tries next acceptable algorithm
   */
  selectAndValidateAlgorithm(acceptEncoding, req) {
    if (!acceptEncoding) return null;

    const acceptLower = acceptEncoding.toLowerCase();
    
    // Parse Accept-Encoding with quality values
    const encodings = acceptLower.split(',').map(part => {
      const [encoding, qValue] = part.trim().split(';');
      const quality = qValue ? parseFloat(qValue.split('=')[1]) : 1.0;
      return { encoding: encoding.trim(), quality };
    });

    // Filter acceptable encodings (q > 0, not identity)
    const acceptableEncodings = encodings.filter(e => 
      e.quality > 0 && e.encoding !== 'identity' && e.encoding !== '*'
    );

    // Sort by quality (highest first), then by client order
    acceptableEncodings.sort((a, b) => {
      if (b.quality !== a.quality) {
        return b.quality - a.quality;
      }
      return 0; // Maintain client order for same quality
    });

    // Try each acceptable encoding in order
    for (const { encoding } of acceptableEncodings) {
      if (this.config.algorithms.includes(encoding)) {
        const validated = this._validateAlgorithm(encoding, req);
        if (validated) {
          return validated; // Found valid algorithm
        }
        // Continue to next if validation failed (e.g., zstd without policy)
      }
    }

    // No acceptable algorithm found
    return null;
  }

  /**
   * Select best compression algorithm based on Accept-Encoding header
   * Automatic algorithm selection with support for quality values (q-values)
   * 
   * RFC 7231 compliant implementation:
   * - Handles 'identity' encoding (no compression)
   * - Wildcard '*' only matches encodings not explicitly listed
   * - Respects q=0 (not acceptable)
   * - Prefers server order after client filtering
   * 
   * Examples:
   * - "gzip, deflate, br" → Returns 'br' (server preference)
   * - "gzip;q=1.0, br;q=0.5" → Returns 'gzip' (client preference via q-value)
   * - "deflate, *;q=0.8" → Returns 'deflate' or server preference if not listed
   * - "gzip;q=0, br" → Returns 'br' (gzip explicitly rejected with q=0)
   * - "identity;q=1.0, br;q=0" → Returns null (identity requested, compression rejected)
   * - "identity" → Returns null (no compression)
   */
  selectAlgorithm(acceptEncoding) {
    if (!acceptEncoding) return null;

    const acceptLower = acceptEncoding.toLowerCase();
    
    // Parse Accept-Encoding with quality values
    // Format: "gzip, deflate, br;q=1.0, *;q=0.5"
    const encodings = acceptLower.split(',').map(part => {
      const [encoding, qValue] = part.trim().split(';');
      const quality = qValue ? parseFloat(qValue.split('=')[1]) : 1.0;
      return { encoding: encoding.trim(), quality };
    });

    // Check if 'identity' is explicitly requested with high quality
    // If identity has highest quality, client prefers no compression
    const identityEncoding = encodings.find(e => e.encoding === 'identity');
    if (identityEncoding && identityEncoding.quality > 0) {
      // Check if any compression algorithm has higher quality than identity
      const hasHigherQuality = encodings.some(e => 
        e.encoding !== 'identity' && 
        e.quality > identityEncoding.quality &&
        this.config.algorithms.includes(e.encoding)
      );
      
      // If identity has highest quality, don't compress
      if (!hasHigherQuality) {
        return null;
      }
    }

    // Collect ALL explicitly listed encodings (including q=0 for wildcard exclusion)
    const explicitEncodings = new Set(
      encodings
        .filter(e => e.encoding !== '*' && e.encoding !== 'identity')
        .map(e => e.encoding)
    );

    // Filter out q=0 (not acceptable) and identity for acceptable list
    const acceptableEncodings = encodings.filter(e => 
      e.quality > 0 && e.encoding !== 'identity'
    );

    // Sort by quality (highest first), then by our preference order
    acceptableEncodings.sort((a, b) => {
      if (b.quality !== a.quality) {
        return b.quality - a.quality;
      }
      // Same quality, use our preference order
      const aIndex = this.config.algorithms.indexOf(a.encoding);
      const bIndex = this.config.algorithms.indexOf(b.encoding);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    // Find first encoding we support (excluding wildcard for now)
    for (const { encoding, quality } of acceptableEncodings) {
      if (encoding !== '*' && this.config.algorithms.includes(encoding)) {
        return encoding;
      }
    }

    // Handle wildcard: only matches encodings not explicitly listed
    const wildcardEntry = acceptableEncodings.find(e => e.encoding === '*');
    if (wildcardEntry) {
      // Find first server algorithm not explicitly listed by client
      for (const algorithm of this.config.algorithms) {
        if (!explicitEncodings.has(algorithm)) {
          return algorithm;
        }
      }
    }

    return null;
  }

  /**
   * Validate selected algorithm for safety and compatibility
   * Returns the algorithm if safe to use, null otherwise
   */
  _validateAlgorithm(algorithm, req) {
    if (!algorithm) return null;

    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    // Zstd safety: Only allow for internal services with explicit policy header
    // Browsers don't support zstd yet (except experimental builds)
    // Require X-Compression-Policy: internal header for zstd usage
    // Legacy support: X-Internal-Client: true (deprecated, use X-Compression-Policy instead)
    if (algorithm === 'zstd') {
      const compressionPolicy = req.headers['x-compression-policy'];
      const isInternalClient = compressionPolicy === 'internal' || req.headers['x-internal-client'] === 'true';
      const explicitlySupported = acceptEncoding.toLowerCase().includes('zstd');
      
      // Require both: client must advertise support AND provide internal policy header
      if (!explicitlySupported || !isInternalClient) {
        return null;
      }
    }
    
    // Brotli safety: Prefer HTTPS only
    // Brotli over plaintext HTTP has spotty intermediary support
    // Some proxies/CDNs may not handle it correctly
    if (algorithm === 'br') {
      const isHttps = (
        req.protocol === 'https' ||
        req.secure === true ||
        req.headers['x-forwarded-proto'] === 'https'
      );
      
      if (!isHttps) {
        // Fall back to next best algorithm
        const acceptLower = acceptEncoding.toLowerCase();
        const encodings = acceptLower.split(',').map(part => {
          const [encoding] = part.trim().split(';');
          return encoding.trim();
        });
        
        // Try gzip or deflate as fallback
        for (const fallback of ['gzip', 'deflate']) {
          if (encodings.includes(fallback) && this.config.algorithms.includes(fallback)) {
            return fallback;
          }
        }
        
        return null;
      }
    }
    
    return algorithm;
  }

  /**
   * Create compression stream for specified algorithm
   */
  createCompressionStream(algorithm) {
    const options = { level: this.config.level };

    switch (algorithm) {
      case 'br':
        return createBrotliCompress({
          params: {
            [constants.BROTLI_PARAM_QUALITY]: this.config.level,
          },
        });

      case 'gzip':
        return createGzip(options);

      case 'deflate':
        return createDeflate(options);

      case 'zstd':
        // Zstd doesn't have native Node.js stream support
        // For streaming, we'll need to use Transform stream wrapper
        throw new Error('Zstd streaming not yet implemented. Use buffered compression for zstd.');

      default:
        throw new Error(`Unsupported compression algorithm: ${algorithm}`);
    }
  }

  /**
   * Compress buffer using specified algorithm
   * @param {Buffer} buffer - Buffer to compress
   * @param {string} algorithm - Compression algorithm
   * @param {number} [ttl] - Optional per-entry TTL in milliseconds
   */
  async compressBuffer(buffer, algorithm, ttl) {
    const originalSize = buffer.length;
    
    // Check max payload size to prevent DoS
    if (this.config.maxCompressSize && originalSize > this.config.maxCompressSize) {
      this.stats.payloadsTooLarge++;
      this.stats.uncompressed++;
      return { buffer, algorithm: null, originalSize, compressedSize: originalSize };
    }
    
    // Check cache first
    const cacheKey = await this._getCacheKey(buffer);
    const cached = this._getFromCache(cacheKey, algorithm);
    if (cached) {
      return cached;
    }

    try {
      let compressed;

      switch (algorithm) {
        case 'br':
          // Use faster compression for smaller payloads
          const brotliQuality = originalSize < 10240 ? 4 : this.config.level;
          compressed = await brotliCompressAsync(buffer, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: brotliQuality,
            },
          });
          break;

        case 'gzip':
          compressed = await gzipAsync(buffer, {
            level: this.config.level,
          });
          break;

        case 'deflate':
          compressed = await deflateAsync(buffer, {
            level: this.config.level,
          });
          break;

        case 'zstd':
          compressed = await zstd.compress(buffer, this.zstdLevel);
          break;

        default:
          return { buffer, algorithm: null, originalSize, compressedSize: originalSize };
      }

      const compressedSize = compressed.length;

      // Validate that compression actually reduced size
      if (compressedSize >= originalSize) {
        this.stats.uncompressed++;
        return { buffer, algorithm: null, originalSize, compressedSize: originalSize };
      }

      // Calculate compression ratio (as a decimal, e.g., 0.15 = 15% reduction)
      const compressionRatio = (originalSize - compressedSize) / originalSize;

      // Only use compression if it meets the minimum ratio threshold
      if (compressionRatio < this.config.minCompressionRatio) {
        this.stats.uncompressed++;
        return { buffer, algorithm: null, originalSize, compressedSize: originalSize };
      }

      // Update stats
      this.stats.bytesIn += originalSize;
      this.stats.bytesOut += compressedSize;
      this.stats.compressed++;
      this.stats.compressionRatio = 
        this.stats.bytesIn > 0 
          ? ((this.stats.bytesIn - this.stats.bytesOut) / this.stats.bytesIn * 100).toFixed(2)
          : 0;

      const result = {
        buffer: compressed,
        algorithm,
        originalSize,
        compressedSize,
        ratio: (compressionRatio * 100).toFixed(2),
      };
      
      // Cache the result with optional per-entry TTL
      this._setCache(cacheKey, result, algorithm, ttl);
      
      return result;
    } catch (error) {
      console.error('Compression error:', error);
      this.stats.uncompressed++;
      return { buffer, algorithm: null, originalSize, compressedSize: originalSize };
    }
  }

  /**
   * Get compression statistics
   */
  getStats() {
    const totalCacheSize = this.caches.br.size + this.caches.gzip.size + this.caches.deflate.size + this.caches.zstd.size;
    const totalCacheMemory = this.cacheMemory.br + this.cacheMemory.gzip + this.cacheMemory.deflate + this.cacheMemory.zstd;
    const totalMemory = totalCacheMemory + this.responseCacheMemory;
    
    // Calculate memory amplification (how much memory is used vs uncompressed size)
    const memoryAmplification = this.responseCacheMemory > 0 
      ? totalMemory / this.responseCacheMemory 
      : 1.0;
    
    return {
      ...this.stats,
      compressionRate: this.stats.totalRequests > 0
        ? ((this.stats.compressed / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      cacheHitRate: (this.stats.cacheHits + this.stats.cacheMisses) > 0
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
      responseCacheHitRate: (this.stats.responseCacheHits + this.stats.responseCacheMisses) > 0
        ? ((this.stats.responseCacheHits / (this.stats.responseCacheHits + this.stats.responseCacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
      cacheSize: totalCacheSize,
      cacheSizeByAlgorithm: {
        br: this.caches.br.size,
        gzip: this.caches.gzip.size,
        deflate: this.caches.deflate.size,
        zstd: this.caches.zstd.size,
      },
      responseCacheSize: this.responseCache.size,
      cacheMemory: totalCacheMemory,
      cacheMemoryByAlgorithm: {
        br: this.cacheMemory.br,
        gzip: this.cacheMemory.gzip,
        deflate: this.cacheMemory.deflate,
        zstd: this.cacheMemory.zstd,
      },
      responseCacheMemory: this.responseCacheMemory,
      cacheMemoryFormatted: this._formatBytes(totalCacheMemory),
      responseCacheMemoryFormatted: this._formatBytes(this.responseCacheMemory),
      totalCacheMemory: totalMemory,
      totalCacheMemoryFormatted: this._formatBytes(totalMemory),
      // NEW: Memory amplification metric (1.0 = no amplification, 2.0 = 2x memory usage)
      memoryAmplification: parseFloat(memoryAmplification.toFixed(2)),
      memoryAmplificationFormatted: memoryAmplification.toFixed(2) + 'x',
    };
  }

  /**
   * Format bytes to human-readable string
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      compressed: 0,
      uncompressed: 0,
      bytesIn: 0,
      bytesOut: 0,
      compressionRatio: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheEvictions: 0,
      payloadsTooLarge: 0,
      skippedForSecurity: 0,
      responseCacheHits: 0,
      responseCacheMisses: 0,
      responseCacheEvictions: 0,
      responsesTooLarge: 0,        // NEW: Responses exceeding maxResponseSize
      compressedTooLarge: 0,       // NEW: Compressed results exceeding maxCompressedSize
    };
  }

  /**
   * Clear all caches (response cache + compression caches)
   */
  clearCache() {
    // Clear response cache
    this.responseCache.clear();
    this.responseCacheMemory = 0;
    
    // Clear compression caches
    this.caches.br.clear();
    this.caches.gzip.clear();
    this.caches.deflate.clear();
    this.caches.zstd.clear();
    
    // Reset memory tracking
    this.cacheMemory.br = 0;
    this.cacheMemory.gzip = 0;
    this.cacheMemory.deflate = 0;
    this.cacheMemory.zstd = 0;
  }
}

// ============================================================================
// Compression Middleware Factory
// ============================================================================

/**
 * Create compression middleware for API routes
 */
export function createCompressionMiddleware(options = {}) {
  const compressionManager = new CompressionManager(options);

  return {
    compressionManager,

    /**
     * Middleware function to wrap response methods
     */
    async middleware(req, res, next) {
      compressionManager.stats.totalRequests++;

      // Route-level override: Allow routes to disable compression
      // Usage: res.locals.disableCompression = true
      if (res.locals?.disableCompression) {
        compressionManager.stats.uncompressed++;
        return next();
      }

      // Route-level configuration: Allow routes to customize compression settings
      // Usage: res.locals.compression = { level: 4, algorithms: ['gzip'] }
      // These settings are merged with the global config for this response only
      const routeConfig = res.locals?.compression;
      let effectiveManager = compressionManager;
      
      if (routeConfig && typeof routeConfig === 'object') {
        // Create a temporary manager with merged config for this request
        effectiveManager = Object.create(compressionManager);
        effectiveManager.config = {
          ...compressionManager.config,
          ...routeConfig,
          // Deep merge nested objects
          cache: routeConfig.cache ? { ...compressionManager.config.cache, ...routeConfig.cache } : compressionManager.config.cache,
          streaming: routeConfig.streaming ? { ...compressionManager.config.streaming, ...routeConfig.streaming } : compressionManager.config.streaming,
          security: routeConfig.security ? { ...compressionManager.config.security, ...routeConfig.security } : compressionManager.config.security,
        };
      }

      // Skip compression for HEAD requests (no body expected)
      if (req.method === 'HEAD') {
        effectiveManager.stats.uncompressed++;
        return next();
      }

      // Store original methods
      const originalJson = res.json;
      const originalSend = res.send;
      const originalEnd = res.end;
      const originalWrite = res.write;
      
      // Track if methods have been intercepted
      let methodsIntercepted = false;
      
      // Cleanup function to restore original methods
      const restoreOriginalMethods = () => {
        if (methodsIntercepted) {
          res.json = originalJson;
          res.send = originalSend;
          res.end = originalEnd;
          res.write = originalWrite;
          methodsIntercepted = false;
        }
      };

      // Handle errors and cleanup
      const handleError = (error, data, originalMethod) => {
        console.error('Compression middleware error:', error);
        compressionManager.stats.uncompressed++;
        restoreOriginalMethods();
        
        // Call original method with data
        try {
          return originalMethod.call(res, data);
        } catch (fallbackError) {
          console.error('Fallback method error:', fallbackError);
          // Last resort: try to end the response
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end('Internal Server Error');
          }
        }
      };

      // Helper to compress and send response
      const compressAndSend = async (data, originalMethod, isJson = false) => {
        try {
          // Skip compression for responses that must not have a body
          const status = res.statusCode;
          if (
            status === 204 ||   // No Content
            status === 304 ||   // Not Modified
            (status >= 100 && status < 200)  // Informational responses
          ) {
            compressionManager.stats.uncompressed++;
            restoreOriginalMethods();
            return originalMethod.call(res, data);
          }

          const contentType = res.getHeader('content-type') || '';
          const acceptEncoding = req.headers['accept-encoding'] || '';

          // Check if response caching should be skipped
          // Default: Only cache GET and HEAD (idempotent methods)
          // Can be overridden with res.locals.allowResponseCache = true
          const cacheControl = res.getHeader('cache-control');
          const cacheTTL = res.locals?.cacheTTL;
          const skipResponseCache = (
            // Skip if cacheTTL is explicitly set to 0 (no caching)
            cacheTTL === 0 ||
            // Skip non-idempotent methods by default (POST, PUT, DELETE, PATCH)
            (!['GET', 'HEAD'].includes(req.method) && !res.locals.allowResponseCache) ||
            // Skip if Cache-Control forbids caching
            /no-store|private/i.test(cacheControl || '') ||
            // Skip authenticated requests (BREACH mitigation)
            req.headers.authorization
          );

          // Two-tier cache lookup:
          // 1. Response cache: Check if we have the uncompressed payload cached
          const responseCacheKey = compressionManager._getResponseCacheKey(req);
          let buffer = skipResponseCache ? null : compressionManager._getFromResponseCache(responseCacheKey);
          
          if (!buffer) {
            // Response cache miss: Convert data to buffer
            if (Buffer.isBuffer(data)) {
              buffer = data;
            } else if (typeof data === 'string') {
              buffer = Buffer.from(data, 'utf8');
            } else if (isJson || typeof data === 'object') {
              // For res.json() path, stringify once here
              // For other objects, also stringify
              buffer = Buffer.from(JSON.stringify(data), 'utf8');
            } else {
              buffer = Buffer.from(String(data), 'utf8');
            }
            
            // Store in response cache for future requests (unless cache headers forbid it)
            // This prevents redundant JSON serialization across different algorithms
            // Support per-response TTL via res.locals.cacheTTL
            if (!skipResponseCache) {
              compressionManager._setResponseCache(responseCacheKey, buffer, cacheTTL);
            }
          }

          const contentLength = buffer.length;

          // Always add Vary: Accept-Encoding header for proper caching
          // This tells caches that response varies based on Accept-Encoding
          const vary = res.getHeader('Vary');
          if (vary && !vary.toLowerCase().includes('accept-encoding')) {
            res.setHeader('Vary', `${vary}, Accept-Encoding`);
          } else if (!vary) {
            res.setHeader('Vary', 'Accept-Encoding');
          }

          // Security check: BREACH attack mitigation (use effectiveManager for route-level config)
          if (effectiveManager.hasSecurityConcerns(req, res, buffer)) {
            compressionManager.stats.skippedForSecurity++;
            compressionManager.stats.uncompressed++;
            restoreOriginalMethods();
            return originalMethod.call(res, data);
          }

          // Early exit checks (fastest path)
          if (!effectiveManager.shouldCompress(contentType, contentLength, req.url)) {
            compressionManager.stats.uncompressed++;
            restoreOriginalMethods();
            return originalMethod.call(res, data);
          }

          // GraphQL-aware compression optimization
          // GraphQL responses compress exceptionally well and tend to grow vertically
          const isGraphQL = (
            req.path === '/graphql' ||
            req.url?.includes('/graphql') ||
            contentType.toLowerCase().includes('graphql') ||
            res.locals?.isGraphQL === true
          );

          // Only apply GraphQL optimizations if not using route-level config
          if (isGraphQL && effectiveManager === compressionManager) {
            // Create optimized manager for GraphQL
            effectiveManager = Object.create(compressionManager);
            effectiveManager.config = {
              ...compressionManager.config,
              // GraphQL responses almost always compress well (lots of repeated field names)
              minCompressionRatio: 0.02, // Lower threshold (2% vs default 10%)
              streaming: {
                ...compressionManager.config.streaming,
                // GraphQL responses grow vertically (lists, connections)
                // Stream earlier to handle large result sets efficiently
                threshold: 32 * 1024, // 32KB vs default 100KB
              },
            };
          } else if (isGraphQL && effectiveManager !== compressionManager && !routeConfig?.minCompressionRatio && !routeConfig?.streaming) {
            // Apply GraphQL optimizations to route-level config if not explicitly overridden
            effectiveManager.config = {
              ...effectiveManager.config,
              minCompressionRatio: routeConfig?.minCompressionRatio ?? 0.02,
              streaming: {
                ...effectiveManager.config.streaming,
                threshold: routeConfig?.streaming?.threshold ?? 32 * 1024,
              },
            };
          }

          // Select and validate algorithm with fallback support
          const validatedAlgorithm = effectiveManager.selectAndValidateAlgorithm(acceptEncoding, req);
          if (!validatedAlgorithm) {
            compressionManager.stats.uncompressed++;
            restoreOriginalMethods();
            return originalMethod.call(res, data);
          }

          // Decide between streaming and buffered compression
          const useStreaming = effectiveManager.config.streaming.enabled && 
                               contentLength >= effectiveManager.config.streaming.threshold;

          // Zstd streaming fallback: zstd doesn't support native streaming yet
          // Automatically fall back to gzip for streaming to maintain predictable behavior
          let finalAlgorithm = validatedAlgorithm;
          if (useStreaming && validatedAlgorithm === 'zstd') {
            // Try to fall back to gzip or deflate
            const acceptEncoding = req.headers['accept-encoding'] || '';
            if (acceptEncoding.toLowerCase().includes('gzip')) {
              finalAlgorithm = 'gzip';
            } else if (acceptEncoding.toLowerCase().includes('deflate')) {
              finalAlgorithm = 'deflate';
            } else {
              // No streaming fallback available, use buffered compression
              finalAlgorithm = validatedAlgorithm;
            }
          }

          if (useStreaming && finalAlgorithm !== 'zstd') {
            // Use chunked compression for large buffered responses
            return compressAndSendStream(buffer, finalAlgorithm);
          }

          // Compress the buffer (buffered mode for smaller responses or zstd)
          const result = await effectiveManager.compressBuffer(buffer, finalAlgorithm, cacheTTL);

          if (result.algorithm) {
            // Set compression headers (batch for performance)
            res.setHeader('Content-Encoding', result.algorithm);
            res.setHeader('Content-Length', result.compressedSize);
            
            // Only add debug headers in development
            if (process.env.NODE_ENV !== 'production') {
              res.setHeader('X-Original-Size', result.originalSize);
              res.setHeader('X-Compressed-Size', result.compressedSize);
              res.setHeader('X-Compression-Ratio', result.ratio + '%');
              res.setHeader('X-Compression-Mode', 'buffered');
            }

            // Restore methods before sending (cleanup)
            restoreOriginalMethods();
            
            // Send compressed buffer directly (already processed)
            return res.end(result.buffer);
          } else {
            // Compression failed or not beneficial
            // For JSON, send the already-stringified buffer to avoid re-stringification
            restoreOriginalMethods();
            if (isJson) {
              return res.end(buffer);
            }
            return originalMethod.call(res, data);
          }
        } catch (error) {
          return handleError(error, data, originalMethod);
        }
      };

      // Helper to compress and send using streaming
      const compressAndSendStream = async (buffer, algorithm) => {
        try {
          const originalSize = buffer.length;

          // Set compression headers
          res.setHeader('Content-Encoding', algorithm);
          // Remove Content-Length for streaming (chunked transfer encoding)
          res.removeHeader('Content-Length');
          
          // Only add debug headers in development
          if (process.env.NODE_ENV !== 'production') {
            res.setHeader('X-Original-Size', originalSize);
            res.setHeader('X-Compression-Mode', 'chunked');
          }

          // Update stats
          compressionManager.stats.bytesIn += originalSize;
          compressionManager.stats.compressed++;

          // Restore methods before streaming
          restoreOriginalMethods();

          // Create readable stream from buffer
          const readable = Readable.from(buffer);
          
          // Create compression stream
          const compressionStream = compressionManager.createCompressionStream(algorithm);

          // Track compressed size
          let compressedSize = 0;
          compressionStream.on('data', (chunk) => {
            compressedSize += chunk.length;
          });

          compressionStream.on('end', () => {
            compressionManager.stats.bytesOut += compressedSize;
            compressionManager.stats.compressionRatio = 
              compressionManager.stats.bytesIn > 0 
                ? ((compressionManager.stats.bytesIn - compressionManager.stats.bytesOut) / compressionManager.stats.bytesIn * 100).toFixed(2)
                : 0;
            
            // Add final compressed size header if in development
            if (process.env.NODE_ENV !== 'production') {
              res.setHeader('X-Compressed-Size', compressedSize);
              const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
              res.setHeader('X-Compression-Ratio', ratio + '%');
            }
          });

          // Pipe: readable -> compression -> response
          await pipelineAsync(readable, compressionStream, res);
        } catch (error) {
          console.error('Streaming compression error:', error);
          compressionManager.stats.uncompressed++;
          
          // If streaming fails, try to send uncompressed
          if (!res.headersSent) {
            restoreOriginalMethods();
            res.removeHeader('Content-Encoding');
            res.end(buffer);
          }
        }
      };

      // Helper for true streaming compression (intercepts write calls)
      const enableTrueStreaming = (algorithm) => {
        // Create compression stream
        const compressionStream = compressionManager.createCompressionStream(algorithm);
        
        // Track sizes for stats
        let originalSize = 0;
        let compressedSize = 0;
        
        // Set compression headers
        res.setHeader('Content-Encoding', algorithm);
        res.removeHeader('Content-Length');
        
        if (process.env.NODE_ENV !== 'production') {
          res.setHeader('X-Compression-Mode', 'streaming');
        }
        
        // Pipe compression stream to original response
        compressionStream.pipe(res);
        
        // Track compressed output
        compressionStream.on('data', (chunk) => {
          compressedSize += chunk.length;
        });
        
        compressionStream.on('end', () => {
          compressionManager.stats.bytesIn += originalSize;
          compressionManager.stats.bytesOut += compressedSize;
          compressionManager.stats.compressed++;
          compressionManager.stats.compressionRatio = 
            compressionManager.stats.bytesIn > 0 
              ? ((compressionManager.stats.bytesIn - compressionManager.stats.bytesOut) / compressionManager.stats.bytesIn * 100).toFixed(2)
              : 0;
          
          if (process.env.NODE_ENV !== 'production') {
            res.setHeader('X-Original-Size', originalSize);
            res.setHeader('X-Compressed-Size', compressedSize);
            const ratio = originalSize > 0 ? ((originalSize - compressedSize) / originalSize * 100).toFixed(2) : 0;
            res.setHeader('X-Compression-Ratio', ratio + '%');
          }
        });
        
        compressionStream.on('error', (error) => {
          console.error('Streaming compression error:', error);
          compressionManager.stats.uncompressed++;
        });
        
        // Override write to pipe through compression
        res.write = function(chunk, encoding, callback) {
          if (chunk) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
            originalSize += buffer.length;
            return compressionStream.write(buffer, encoding, callback);
          }
          if (typeof encoding === 'function') {
            encoding();
          } else if (typeof callback === 'function') {
            callback();
          }
          return true;
        };
        
        // Override end to close compression stream
        res.end = function(chunk, encoding, callback) {
          if (chunk) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
            originalSize += buffer.length;
            compressionStream.end(buffer, encoding, callback);
          } else {
            compressionStream.end(callback);
          }
        };
        
        return true;
      };

      try {
        // Detect if this is a streaming response (multiple write calls expected)
        // by checking if Content-Length is not set or if Transfer-Encoding is chunked
        let isStreamingResponse = false;
        let streamingAlgorithm = null;
        let streamingEnabled = false;
        
        // Intercept json()
        res.json = function(data) {
          res.setHeader('Content-Type', 'application/json');
          // Pass isJson=true to avoid double stringification
          return compressAndSend(data, originalJson, true);
        };

        // Intercept send()
        res.send = function(data) {
          if (typeof data === 'object' && !Buffer.isBuffer(data)) {
            res.setHeader('Content-Type', 'application/json');
          }
          return compressAndSend(data, originalSend);
        };

        // Intercept write() to detect streaming and enable true streaming compression
        const chunks = [];
        let chunksTotalSize = 0;
        let writeCallCount = 0;

        res.write = function(chunk, encoding, callback) {
          writeCallCount++;
          
          // Memory safety: Cap buffered chunk accumulation
          // If chunks grow too large without streaming activation, fall back to uncompressed
          if (!streamingEnabled && chunk) {
            const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding || 'utf8');
            
            if (chunksTotalSize + chunkSize > effectiveManager.config.maxCompressSize) {
              // Exceeded max buffer size, restore original methods and pass through
              compressionManager.stats.payloadsTooLarge++;
              compressionManager.stats.uncompressed++;
              restoreOriginalMethods();
              
              // Flush any buffered chunks first
              for (const bufferedChunk of chunks) {
                originalWrite.call(res, bufferedChunk);
              }
              chunks.length = 0;
              chunksTotalSize = 0;
              
              // Write current chunk
              return originalWrite.call(res, chunk, encoding, callback);
            }
          }
          
          // Detect streaming scenario: multiple writes or no Content-Length
          if (!streamingEnabled && effectiveManager.config.streaming.enabled) {
            const contentLength = res.getHeader('content-length');
            const contentType = res.getHeader('content-type') || '';
            const acceptEncoding = req.headers['accept-encoding'] || '';
            
            // Check if we should enable streaming compression
            const shouldStream = (
              !contentLength || // No Content-Length = streaming
              writeCallCount > 1 || // Multiple writes = streaming
              res.getHeader('transfer-encoding') === 'chunked' // Explicit chunked
            );
            
            if (shouldStream && !res.headersSent) {
              // Check if content is compressible
              const algorithm = effectiveManager.selectAlgorithm(acceptEncoding);
              const validatedAlgorithm = effectiveManager._validateAlgorithm(algorithm, req);
              
              // Zstd streaming fallback: fall back to gzip for true streaming
              let finalStreamingAlgorithm = validatedAlgorithm;
              if (validatedAlgorithm === 'zstd') {
                if (acceptEncoding.toLowerCase().includes('gzip')) {
                  finalStreamingAlgorithm = 'gzip';
                } else if (acceptEncoding.toLowerCase().includes('deflate')) {
                  finalStreamingAlgorithm = 'deflate';
                } else {
                  // No streaming fallback available, skip streaming compression
                  finalStreamingAlgorithm = null;
                }
              }
              
              if (finalStreamingAlgorithm && effectiveManager.shouldCompress(contentType, Infinity, req.url)) {
                // Enable true streaming compression
                streamingEnabled = true;
                streamingAlgorithm = finalStreamingAlgorithm;
                isStreamingResponse = true;
                
                // Add Vary header
                const vary = res.getHeader('Vary');
                if (vary && !vary.toLowerCase().includes('accept-encoding')) {
                  res.setHeader('Vary', `${vary}, Accept-Encoding`);
                } else if (!vary) {
                  res.setHeader('Vary', 'Accept-Encoding');
                }
                
                // Enable true streaming
                enableTrueStreaming(streamingAlgorithm);
                
                // Write any buffered chunks through the compression stream
                for (const bufferedChunk of chunks) {
                  res.write(bufferedChunk);
                }
                chunks.length = 0;
                chunksTotalSize = 0;
                
                // Write current chunk
                if (chunk) {
                  return res.write(chunk, encoding, callback);
                }
                return true;
              }
            }
          }
          
          // If streaming is enabled, write is already overridden
          if (streamingEnabled) {
            // This shouldn't be reached, but just in case
            return originalWrite.call(res, chunk, encoding, callback);
          }
          
          // Buffer chunks for later compression
          if (chunk) {
            const buffer = Buffer.from(chunk);
            chunks.push(buffer);
            chunksTotalSize += buffer.length;
          }
          // Call callback if provided
          if (typeof encoding === 'function') {
            encoding();
          } else if (typeof callback === 'function') {
            callback();
          }
          return true;
        };

        res.end = function(chunk) {
          // If true streaming was enabled, end is already overridden
          if (streamingEnabled) {
            // This shouldn't be reached, but just in case
            return originalEnd.call(res, chunk);
          }
          
          if (chunk) {
            chunks.push(Buffer.from(chunk));
          }

          if (chunks.length > 0) {
            const buffer = Buffer.concat(chunks);
            return compressAndSend(buffer, originalEnd);
          }

          restoreOriginalMethods();
          return originalEnd.call(res);
        };
        
        // Mark methods as successfully intercepted
        methodsIntercepted = true;

        // Handle response finish/close events for cleanup
        res.on('finish', restoreOriginalMethods);
        res.on('close', restoreOriginalMethods);

        next();
      } catch (error) {
        // If middleware setup fails, restore and pass error to next
        console.error('Compression middleware setup error:', error);
        // Ensure cleanup happens even if interception partially succeeded
        if (methodsIntercepted) {
          restoreOriginalMethods();
        }
        next(error);
      }
    },
  };
}

/**
 * Helper to check if content type is compressible
 */
export function isCompressible(contentType) {
  if (!contentType) return false;
  return DEFAULT_CONFIG.compressibleTypes.some(type =>
    contentType.toLowerCase().includes(type.toLowerCase())
  );
}

/**
 * Helper to get compression algorithm name
 */
export function getAlgorithmName(encoding) {
  const names = {
    br: 'Brotli',
    gzip: 'Gzip',
    deflate: 'Deflate',
    zstd: 'Zstandard',
  };
  return names[encoding] || encoding;
}
