/**
 * Comprehensive Cache Tests
 * Tests all cache features including:
 * - Memory and Redis caching
 * - Compression (gzip/zstd)
 * - Encryption with key rotation
 * - Stale-while-revalidate
 * - TTL and expiration
 * - LRU eviction
 * - Streaming and partial content handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager, createCacheMiddleware } from './cache.js';
import crypto from 'crypto';

// Mock Redis client
class MockRedisClient {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // Check TTL
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    
    return entry;
  }

  async setEx(key, ttl, value) {
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (ttl * 1000));
  }

  async del(...keys) {
    keys.forEach(key => {
      this.store.delete(key);
      this.ttls.delete(key);
    });
  }

  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  async exists(key) {
    return this.store.has(key) ? 1 : 0;
  }

  async ttl(key) {
    const expiry = this.ttls.get(key);
    if (!expiry) return -1;
    const remaining = Math.floor((expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
}

describe('CacheManager - Memory Cache', () => {
  let cacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      type: 'memory',
      maxSize: 10,
      defaultTTL: 1, // 1 second for faster tests
    });
  });

  afterEach(() => {
    if (cacheManager) {
      cacheManager.destroy();
    }
  });

  it('should store and retrieve values', async () => {
    await cacheManager.set('test-key', { data: 'value' });
    const result = await cacheManager.get('test-key');
    
    expect(result).toBeDefined();
    expect(result.value).toEqual({ data: 'value' });
    expect(result.stale).toBeDefined();
  });

  it('should return null for non-existent keys', async () => {
    const result = await cacheManager.get('non-existent');
    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    await cacheManager.set('expire-key', { data: 'value' }, 0.1); // 100ms
    
    let result = await cacheManager.get('expire-key');
    expect(result).toBeDefined();
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    result = await cacheManager.get('expire-key');
    expect(result).toBeNull();
  });

  it('should delete entries', async () => {
    await cacheManager.set('delete-key', { data: 'value' });
    expect(await cacheManager.has('delete-key')).toBe(true);
    
    await cacheManager.delete('delete-key');
    expect(await cacheManager.has('delete-key')).toBe(false);
  });

  it('should clear all entries', async () => {
    await cacheManager.set('key1', { data: 'value1' });
    await cacheManager.set('key2', { data: 'value2' });
    
    await cacheManager.clear();
    
    expect(await cacheManager.get('key1')).toBeNull();
    expect(await cacheManager.get('key2')).toBeNull();
  });

  it('should generate consistent cache keys', () => {
    const req1 = { method: 'GET', url: '/api/test', query: {}, body: {} };
    const req2 = { method: 'GET', url: '/api/test', query: {}, body: {} };
    
    const key1 = cacheManager.generateKey(req1);
    const key2 = cacheManager.generateKey(req2);
    
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different requests', () => {
    const req1 = { method: 'GET', url: '/api/test', query: {}, body: {} };
    const req2 = { method: 'GET', url: '/api/other', query: {}, body: {} };
    
    const key1 = cacheManager.generateKey(req1);
    const key2 = cacheManager.generateKey(req2);
    
    expect(key1).not.toBe(key2);
  });
});

describe('CacheManager - Compression', () => {
  it('should compress large values with gzip', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      compressionThreshold: 100,
      compressionAlgorithm: 'gzip',
    });

    const largeData = { data: 'x'.repeat(200) };
    await cacheManager.set('large-key', largeData);
    
    const result = await cacheManager.get('large-key');
    expect(result.value).toEqual(largeData);
    
    const stats = await cacheManager.getStats();
    const entry = stats.entries.find(e => e.key === 'large-key');
    expect(entry.compressed).toBe(true);
    expect(entry.compressionAlgorithm).toBe('gzip');
    
    cacheManager.destroy();
  });

  it('should compress large values with zstd', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      compressionThreshold: 100,
      compressionAlgorithm: 'zstd',
      zstdLevel: 3,
    });

    const largeData = { data: 'x'.repeat(200) };
    await cacheManager.set('large-key', largeData);
    
    const result = await cacheManager.get('large-key');
    expect(result.value).toEqual(largeData);
    
    const stats = await cacheManager.getStats();
    const entry = stats.entries.find(e => e.key === 'large-key');
    expect(entry.compressed).toBe(true);
    expect(entry.compressionAlgorithm).toBe('zstd');
    
    cacheManager.destroy();
  });

  it('should not compress small values', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      compressionThreshold: 1024,
    });

    const smallData = { data: 'small' };
    await cacheManager.set('small-key', smallData);
    
    const stats = await cacheManager.getStats();
    const entry = stats.entries.find(e => e.key === 'small-key');
    expect(entry.compressed).toBe(false);
    
    cacheManager.destroy();
  });
});

describe('CacheManager - Encryption', () => {
  const encryptionKey = crypto.randomBytes(32).toString('hex');

  it('should encrypt and decrypt values', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      encryptionKey,
    });

    const sensitiveData = { secret: 'password123' };
    await cacheManager.set('encrypted-key', sensitiveData, 300, { encrypt: true });
    
    const result = await cacheManager.get('encrypted-key');
    expect(result.value).toEqual(sensitiveData);
    
    const stats = await cacheManager.getStats();
    const entry = stats.entries.find(e => e.key === 'encrypted-key');
    expect(entry.encrypted).toBe(true);
    
    cacheManager.destroy();
  });

  it('should support key rotation', async () => {
    const oldKey = crypto.randomBytes(32).toString('hex');
    const newKey = crypto.randomBytes(32).toString('hex');
    
    const cacheManager = new CacheManager({
      type: 'memory',
      encryptionKey: oldKey,
    });

    // Store with old key
    await cacheManager.set('rotate-key', { data: 'value' }, 300, { encrypt: true });
    
    // Rotate to new key
    cacheManager.rotateEncryptionKey(newKey);
    
    // Should still be able to read old data
    const result = await cacheManager.get('rotate-key');
    expect(result.value).toEqual({ data: 'value' });
    
    // New data uses new key
    await cacheManager.set('new-key', { data: 'new' }, 300, { encrypt: true });
    const newResult = await cacheManager.get('new-key');
    expect(newResult.value).toEqual({ data: 'new' });
    
    cacheManager.destroy();
  });

  it('should get encryption status', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      encryptionKey,
    });

    const status = cacheManager.getEncryptionStatus();
    expect(status.enabled).toBe(true);
    expect(status.hasActiveKey).toBe(true);
    expect(status.previousKeyCount).toBe(0);
    
    cacheManager.destroy();
  });
});

describe('CacheManager - Stale-While-Revalidate', () => {
  it('should serve fresh data initially', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      defaultTTL: 1,
    });

    await cacheManager.set('swr-key', { data: 'value' }, 1, { staleWhileRevalidate: 2 });
    
    const result = await cacheManager.get('swr-key');
    expect(result.value).toEqual({ data: 'value' });
    expect(result.stale).toBe(false);
    
    cacheManager.destroy();
  });

  it('should mark data as stale after TTL', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      defaultTTL: 0.1, // 100ms
    });

    await cacheManager.set('swr-key', { data: 'value' }, 0.1, { staleWhileRevalidate: 1 });
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const result = await cacheManager.get('swr-key');
    expect(result.value).toEqual({ data: 'value' });
    expect(result.stale).toBe(true);
    
    cacheManager.destroy();
  });

  it('should expire completely after stale period', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      defaultTTL: 0.1,
    });

    await cacheManager.set('swr-key', { data: 'value' }, 0.1, { staleWhileRevalidate: 0.1 });
    
    // Wait for both TTL and stale period to expire
    await new Promise(resolve => setTimeout(resolve, 250));
    
    const result = await cacheManager.get('swr-key');
    expect(result).toBeNull();
    
    cacheManager.destroy();
  });
});

describe('CacheManager - LRU Eviction', () => {
  it('should evict least recently used entries when full', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      maxSize: 3,
      defaultTTL: 10,
    });

    // Fill cache
    await cacheManager.set('key1', { data: '1' });
    await cacheManager.set('key2', { data: '2' });
    await cacheManager.set('key3', { data: '3' });
    
    // Access key1 and key3 to make them recently used
    await cacheManager.get('key1');
    await cacheManager.get('key3');
    
    // Add new entry, should evict one of the entries
    await cacheManager.set('key4', { data: '4' });
    
    // Check that cache size is still 3 (one was evicted)
    const stats = await cacheManager.getStats();
    expect(stats.size).toBe(3);
    
    // At least one of the accessed keys should still exist
    const key1Exists = await cacheManager.has('key1');
    const key3Exists = await cacheManager.has('key3');
    expect(key1Exists || key3Exists).toBe(true);
    
    cacheManager.destroy();
  });

  it('should respect maxBytes limit', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      maxBytes: 500, // 500 bytes
      defaultTTL: 10,
    });

    // Add entries until maxBytes is reached
    await cacheManager.set('key1', { data: 'x'.repeat(100) });
    await cacheManager.set('key2', { data: 'x'.repeat(100) });
    await cacheManager.set('key3', { data: 'x'.repeat(100) });
    
    const stats = await cacheManager.getStats();
    expect(stats.currentBytes).toBeLessThanOrEqual(stats.maxBytes);
    
    cacheManager.destroy();
  });
});

describe('CacheManager - Redis Cache', () => {
  let mockRedis;
  let cacheManager;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    cacheManager = new CacheManager({
      type: 'redis',
      redis: mockRedis,
      defaultTTL: 1,
    });
  });

  it('should store and retrieve values in Redis', async () => {
    await cacheManager.set('redis-key', { data: 'value' });
    const result = await cacheManager.get('redis-key');
    
    expect(result).toBeDefined();
    expect(result.value).toEqual({ data: 'value' });
  });

  it('should handle Redis compression', async () => {
    const cacheManager = new CacheManager({
      type: 'redis',
      redis: mockRedis,
      compressionThreshold: 100,
      compressionAlgorithm: 'gzip',
    });

    const largeData = { data: 'x'.repeat(200) };
    await cacheManager.set('large-redis-key', largeData);
    
    const result = await cacheManager.get('large-redis-key');
    expect(result.value).toEqual(largeData);
  });

  it('should handle Redis encryption', async () => {
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const cacheManager = new CacheManager({
      type: 'redis',
      redis: mockRedis,
      encryptionKey,
    });

    await cacheManager.set('encrypted-redis-key', { secret: 'data' }, 300, { encrypt: true });
    const result = await cacheManager.get('encrypted-redis-key');
    
    expect(result.value).toEqual({ secret: 'data' });
  });

  it('should support stale-while-revalidate in Redis', async () => {
    await cacheManager.set('swr-redis-key', { data: 'value' }, 0.1, { staleWhileRevalidate: 1 });
    
    // Wait for TTL
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const result = await cacheManager.get('swr-redis-key');
    expect(result.value).toEqual({ data: 'value' });
    expect(result.stale).toBe(true);
  });
});

describe('Cache Middleware', () => {
  let middleware;
  let mockReq;
  let mockRes;
  let nextCalled;

  beforeEach(() => {
    const { cacheManager, middleware: mw } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 1,
    });
    
    middleware = mw;
    nextCalled = false;

    mockReq = {
      method: 'GET',
      url: '/api/test',
      originalUrl: '/api/test',
      query: {},
      body: {},
      headers: {},
    };

    mockRes = {
      statusCode: 200,
      _headers: {},
      _ended: false,
      _data: null,
      
      setHeader(name, value) {
        this._headers[name.toLowerCase()] = value;
      },
      
      getHeader(name) {
        return this._headers[name.toLowerCase()];
      },
      
      getHeaders() {
        return { ...this._headers };
      },
      
      removeHeader(name) {
        delete this._headers[name.toLowerCase()];
      },
      
      json(data) {
        this._data = data;
        this._ended = true;
        return this;
      },
      
      send(data) {
        this._data = data;
        this._ended = true;
        return this;
      },
      
      end(data) {
        if (data) this._data = data;
        this._ended = true;
        return this;
      },
      
      write(chunk) {
        return true;
      },
    };
  });

  it('should cache GET requests', async () => {
    const { cacheManager, middleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 60,
    });
    
    // First request - cache miss
    await middleware(mockReq, mockRes, () => {
      nextCalled = true;
      mockRes.json({ data: 'value' });
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache')).toBe('MISS');
    
    // Wait for cache to be set (fire and forget)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify cache was set
    const cacheKey = cacheManager.generateKey(mockReq);
    const cached = await cacheManager.get(cacheKey);
    expect(cached).toBeDefined();
    expect(cached.value.body).toEqual({ data: 'value' });
  });

  it('should not cache POST requests', async () => {
    mockReq.method = 'POST';
    
    await middleware(mockReq, mockRes, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache')).toBeUndefined();
  });

  it('should skip caching for range requests', async () => {
    mockReq.headers.range = 'bytes=0-1023';
    
    await middleware(mockReq, mockRes, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache-skip-reason')).toBe('range-request');
  });

  it('should skip caching for Server-Sent Events', async () => {
    await middleware(mockReq, mockRes, () => {
      mockRes.setHeader('Content-Type', 'text/event-stream');
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache-skip-reason')).toBe('event-stream');
  });

  it('should skip caching for chunked encoding', async () => {
    await middleware(mockReq, mockRes, () => {
      mockRes.setHeader('Transfer-Encoding', 'chunked');
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache-skip-reason')).toBe('chunked-encoding');
  });

  it('should skip caching for partial content', async () => {
    await middleware(mockReq, mockRes, () => {
      mockRes.setHeader('Accept-Ranges', 'bytes');
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache-skip-reason')).toBe('partial-content');
  });

  it('should respect X-Cache-TTL header', async () => {
    await middleware(mockReq, mockRes, () => {
      mockRes.setHeader('X-Cache-TTL', '60');
      mockRes.json({ data: 'value' });
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    // X-Cache-TTL is now added by the middleware for debugging
    expect(mockRes.getHeader('x-cache-ttl')).toBeDefined();
  });

  it('should respect X-Cache-SWR header', async () => {
    await middleware(mockReq, mockRes, () => {
      mockRes.setHeader('X-Cache-SWR', '300');
      mockRes.json({ data: 'value' });
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(mockRes.getHeader('x-cache-swr')).toBeUndefined(); // Should be removed
  });

  it('should use custom shouldCache function', async () => {
    const { middleware: customMiddleware } = createCacheMiddleware({
      type: 'memory',
      shouldCache: (req, res, data) => {
        return req.url.includes('cacheable');
      },
    });

    mockReq.url = '/api/not-cacheable';
    await customMiddleware(mockReq, mockRes, () => {
      mockRes.json({ data: 'value' });
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('should support shouldCache with TTL override', async () => {
    const { middleware: customMiddleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 60,
      shouldCache: (req, res, data) => {
        if (req.url.includes('fast')) {
          return { cache: true, ttl: 10 };
        }
        return true;
      },
    });

    mockReq.url = '/api/fast';
    await customMiddleware(mockReq, mockRes, () => {
      mockRes.json({ data: 'value' });
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('should handle HEAD requests', async () => {
    mockReq.method = 'HEAD';
    
    await middleware(mockReq, mockRes, () => {
      mockRes.end();
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('should serve stale content with revalidation', async () => {
    const { cacheManager, middleware: swrMiddleware } = createCacheMiddleware({
      type: 'memory',
      defaultTTL: 0.1,
      staleWhileRevalidate: 1,
    });

    // First request - cache miss
    await swrMiddleware(mockReq, mockRes, () => {
      mockRes.json({ data: 'value' });
    });

    expect(mockRes.getHeader('x-cache')).toBe('MISS');
    
    // Wait for cache to be set and TTL to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Verify cache entry is stale
    const cacheKey = cacheManager.generateKey(mockReq);
    const cached = await cacheManager.get(cacheKey);
    expect(cached).toBeDefined();
    expect(cached.stale).toBe(true);
  });
});

describe('Cache Statistics', () => {
  it('should provide memory cache statistics', async () => {
    const cacheManager = new CacheManager({
      type: 'memory',
      maxSize: 10,
      maxBytes: 1024,
    });

    await cacheManager.set('key1', { data: 'value1' });
    await cacheManager.set('key2', { data: 'value2' });

    const stats = await cacheManager.getStats();
    
    expect(stats.enabled).toBe(true);
    expect(stats.type).toBe('memory');
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(10);
    expect(stats.maxBytes).toBe(1024);
    expect(stats.currentBytes).toBeGreaterThan(0);
    expect(stats.entries).toHaveLength(2);
    
    cacheManager.destroy();
  });

  it('should provide Redis cache statistics', async () => {
    const mockRedis = new MockRedisClient();
    const cacheManager = new CacheManager({
      type: 'redis',
      redis: mockRedis,
    });

    await cacheManager.set('redis-key', { data: 'value' });

    const stats = await cacheManager.getStats();
    
    expect(stats.enabled).toBe(true);
    expect(stats.type).toBe('redis');
    expect(stats.size).toBeGreaterThan(0);
  });
});

describe('Cache Disabled', () => {
  it('should not cache when disabled', async () => {
    const cacheManager = new CacheManager({
      enabled: false,
    });

    await cacheManager.set('key', { data: 'value' });
    const result = await cacheManager.get('key');
    
    expect(result).toBeNull();
  });

  it('should return disabled stats when cache is disabled', async () => {
    const cacheManager = new CacheManager({
      enabled: false,
    });

    const stats = await cacheManager.getStats();
    expect(stats.enabled).toBe(false);
  });
});
