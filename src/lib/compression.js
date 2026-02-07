/**
 * Response Compression Middleware
 * Supports Brotli and Gzip compression with automatic algorithm selection
 */

import { createBrotliCompress, createGzip } from 'zlib';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

// ============================================================================
// Compression Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  enabled: true,
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Compression level (0-9 for gzip, 0-11 for brotli)
  algorithms: ['br', 'gzip', 'deflate'], // Preferred order
  compressibleTypes: [
    'text/html',
    'text/css',
    'text/javascript',
    'text/plain',
    'text/xml',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/xml+rss',
    'application/xhtml+xml',
    'application/x-javascript',
    'image/svg+xml',
  ],
  excludePatterns: [], // Regex patterns to exclude from compression
};

// ============================================================================
// Compression Manager
// ============================================================================

export class CompressionManager {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.stats = {
      totalRequests: 0,
      compressed: 0,
      uncompressed: 0,
      bytesIn: 0,
      bytesOut: 0,
      compressionRatio: 0,
    };
  }

  /**
   * Check if content should be compressed
   */
  shouldCompress(contentType, contentLength, url) {
    // Check if compression is enabled
    if (!this.config.enabled) return false;

    // Check content length threshold
    if (contentLength < this.config.threshold) return false;

    // Check if content type is compressible
    if (contentType) {
      const isCompressible = this.config.compressibleTypes.some(type =>
        contentType.toLowerCase().includes(type.toLowerCase())
      );
      if (!isCompressible) return false;
    }

    // Check exclude patterns
    if (this.config.excludePatterns.length > 0) {
      const isExcluded = this.config.excludePatterns.some(pattern =>
        new RegExp(pattern).test(url)
      );
      if (isExcluded) return false;
    }

    return true;
  }

  /**
   * Select best compression algorithm based on Accept-Encoding header
   */
  selectAlgorithm(acceptEncoding) {
    if (!acceptEncoding) return null;

    const accepted = acceptEncoding.toLowerCase().split(',').map(s => s.trim());

    // Check in order of preference
    for (const algo of this.config.algorithms) {
      if (accepted.includes(algo)) {
        return algo;
      }
    }

    return null;
  }

  /**
   * Compress buffer using specified algorithm
   */
  async compressBuffer(buffer, algorithm) {
    const { promisify } = await import('util');
    const zlib = await import('zlib');

    const originalSize = buffer.length;

    try {
      let compressed;

      switch (algorithm) {
        case 'br':
          compressed = await promisify(zlib.brotliCompress)(buffer, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: this.config.level,
            },
          });
          break;

        case 'gzip':
          compressed = await promisify(zlib.gzip)(buffer, {
            level: this.config.level,
          });
          break;

        case 'deflate':
          compressed = await promisify(zlib.deflate)(buffer, {
            level: this.config.level,
          });
          break;

        default:
          return { buffer, algorithm: null, originalSize, compressedSize: originalSize };
      }

      const compressedSize = compressed.length;

      // Update stats
      this.stats.bytesIn += originalSize;
      this.stats.bytesOut += compressedSize;
      this.stats.compressed++;
      this.stats.compressionRatio = 
        this.stats.bytesIn > 0 
          ? ((this.stats.bytesIn - this.stats.bytesOut) / this.stats.bytesIn * 100).toFixed(2)
          : 0;

      return {
        buffer: compressed,
        algorithm,
        originalSize,
        compressedSize,
        ratio: ((originalSize - compressedSize) / originalSize * 100).toFixed(2),
      };
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
    return {
      ...this.stats,
      compressionRate: this.stats.totalRequests > 0
        ? ((this.stats.compressed / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
    };
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
    };
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

      // Store original methods
      const originalJson = res.json;
      const originalSend = res.send;
      const originalEnd = res.end;

      // Helper to compress and send response
      const compressAndSend = async (data, originalMethod) => {
        const contentType = res.getHeader('content-type') || '';
        const acceptEncoding = req.headers['accept-encoding'] || '';

        // Convert data to buffer
        let buffer;
        if (Buffer.isBuffer(data)) {
          buffer = data;
        } else if (typeof data === 'string') {
          buffer = Buffer.from(data);
        } else if (typeof data === 'object') {
          buffer = Buffer.from(JSON.stringify(data));
        } else {
          buffer = Buffer.from(String(data));
        }

        const contentLength = buffer.length;

        // Check if should compress
        if (!compressionManager.shouldCompress(contentType, contentLength, req.url)) {
          compressionManager.stats.uncompressed++;
          return originalMethod.call(res, data);
        }

        // Select compression algorithm
        const algorithm = compressionManager.selectAlgorithm(acceptEncoding);
        if (!algorithm) {
          compressionManager.stats.uncompressed++;
          return originalMethod.call(res, data);
        }

        // Compress the buffer
        const result = await compressionManager.compressBuffer(buffer, algorithm);

        if (result.algorithm) {
          // Set compression headers
          res.setHeader('Content-Encoding', result.algorithm);
          res.setHeader('Content-Length', result.compressedSize);
          res.setHeader('X-Original-Size', result.originalSize);
          res.setHeader('X-Compressed-Size', result.compressedSize);
          res.setHeader('X-Compression-Ratio', result.ratio + '%');

          // Remove Vary header if present and add Accept-Encoding
          const vary = res.getHeader('Vary');
          if (vary) {
            res.setHeader('Vary', vary + ', Accept-Encoding');
          } else {
            res.setHeader('Vary', 'Accept-Encoding');
          }

          // Send compressed data
          res.end(result.buffer);
        } else {
          // Compression failed, send original
          originalMethod.call(res, data);
        }
      };

      // Intercept json()
      res.json = function(data) {
        res.setHeader('Content-Type', 'application/json');
        return compressAndSend(data, originalJson);
      };

      // Intercept send()
      res.send = function(data) {
        if (typeof data === 'object' && !Buffer.isBuffer(data)) {
          res.setHeader('Content-Type', 'application/json');
        }
        return compressAndSend(data, originalSend);
      };

      // Intercept end()
      const chunks = [];
      const originalWrite = res.write;

      res.write = function(chunk) {
        if (chunk) {
          chunks.push(Buffer.from(chunk));
        }
        return true; // Don't actually write yet
      };

      res.end = function(chunk) {
        if (chunk) {
          chunks.push(Buffer.from(chunk));
        }

        if (chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          return compressAndSend(buffer, originalEnd);
        }

        return originalEnd.call(res);
      };

      next();
    },
  };
}

/**
 * Helper to check if content type is compressible
 */
export function isCompressible(contentType) {
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
  };
  return names[encoding] || encoding;
}
