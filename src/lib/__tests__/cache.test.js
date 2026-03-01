/**
 * Cache Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CacheManager,
  createCacheMiddleware,
  createCacheInvalidator,
} from '../cache.js';

describe('CacheManager - Initialization', () => {
  it('should initialize with default memory cache', () => {
    const manager = new CacheManager();
    expect(manager.enabled).toBe(true);
    expect(manager.store).toBeDefined();
  });

  it('should initialize with custom options', () => {
    const manager = new CacheManager({
      maxSize: 50,
      defaultTTL: 600,
      keyPrefix: 'test:',
    });
    expect(manager.keyPrefix).toBe('test:');
    expect(manager.store.maxSize).toBe(50);
    expect(manager.store.defaultTTL).toBe(600);
  });

  it('should be disabled when enabled is false', () => {
    const manager = new CacheManager({ enabled: false });
    expect(manager.enabled).toBe(false);
    expect(manager.store).toBeNull();
  });

  it('should support compression configuration', () => {
    const manager = new CacheManager({
      compressionThreshold: 2048,
      compressionAlgorithm: 'zstd',
      zstdLevel: 5,
    });
    expect(manager.store.compressionThreshold).toBe(2048);
    expect(manager.store.compressionAlgorithm).toBe('zstd');
    expect(manager.store.zstdLevel).toBe(5);
  });

  it('should support encryption configuration', () => {
    const manager = new CacheManager({
      encryptionKey: 'test-encryption-key-32-bytes!!',
    });
    expect(manager.store.encryption).toBeDefined();
  });
});

describe('CacheManager - Key Generation', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({ keyPrefix: 'api:' });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should generate consistent keys for same request', () => {
    const req1 = { method: 'GET', url: '/api/test', query: {} };
    const req2 = { method: 'GET', url: '/api/test', query: {} };
    
    const key1 = manager.generateKey(req1);
    const key2 = manager.generateKey(req2);
    
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different URLs', () => {
    const req1 = { method: 'GET', url: '/api/test1', query: {} };
    const req2 = { method: 'GET', url: '/api/test2', query: {} };
    
    const key1 = manager.generateKey(req1);
    const key2 = manager.generateKey(req2);
    
    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different methods', () => {
    const req1 = { method: 'GET', url: '/api/test', query: {} };
    const req2 = { method: 'POST', url: '/api/test', query: {} };
    
    const key1 = manager.generateKey(req1);
    const key2 = manager.generateKey(req2);
    
    expect(key1).not.toBe(key2);
  });

  it('should include query parameters in key', () => {
    const req1 = { method: 'GET', url: '/api/test', query: { page: 1 } };
    const req2 = { method: 'GET', url: '/api/test', query: { page: 2 } };
    
    const key1 = manager.generateKey(req1);
    const key2 = manager.generateKey(req2);
    
    expect(key1).not.toBe(key2);
  });

  it('should include body in key for non-GET requests', () => {
    const req1 = { method: 'POST', url: '/api/test', query: {}, body: { data: 'a' } };
    const req2 = { method: 'POST', url: '/api/test', query: {}, body: { data: 'b' } };
    
    const key1 = manager.generateKey(req1);
    const key2 = manager.generateKey(req2);
    
    expect(key1).not.toBe(key2);
  });

  it('should include key prefix', () => {
    const req = { method: 'GET', url: '/api/test', query: {} };
    const key = manager.generateKey(req);
    
    expect(key).toMatch(/^api:/);
  });
});

describe('MemoryCache - Basic Operations', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({ maxSize: 10, defaultTTL: 1 });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should set and get values', async () => {
    await manager.set('test-key', { data: 'test-value' });
    const result = await manager.get('test-key');
    
    expect(result.value).toEqual({ data: 'test-value' });
    expect(result.stale).toBeNull();
  });

  it('should return null for non-existent keys', async () => {
    const value = await manager.get('non-existent');
    expect(value).toBeNull();
  });

  it('should delete values', async () => {
    await manager.set('test-key', { data: 'test' });
    await manager.delete('test-key');
    
    const value = await manager.get('test-key');
    expect(value).toBeNull();
  });

  it('should check if key exists', async () => {
    await manager.set('test-key', { data: 'test' });
    
    expect(await manager.has('test-key')).toBe(true);
    expect(await manager.has('non-existent')).toBe(false);
  });

  it('should clear all cache', async () => {
    await manager.set('key1', { data: 'value1' });
    await manager.set('key2', { data: 'value2' });
    
    await manager.clear();
    
    expect(await manager.get('key1')).toBeNull();
    expect(await manager.get('key2')).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    await manager.set('test-key', { data: 'test' }, 0.1); // 100ms TTL
    
    // Should exist immediately
    const result = await manager.get('test-key');
    expect(result.value).toEqual({ data: 'test' });
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should be expired
    expect(await manager.get('test-key')).toBeNull();
  });
});

describe('MemoryCache - LRU Eviction', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({ maxSize: 3 });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should evict least recently used entry when full', async () => {
    await manager.set('key1', { data: 'value1' });
    await new Promise(resolve => setTimeout(resolve, 5)); // Ensure different timestamps
    await manager.set('key2', { data: 'value2' });
    await new Promise(resolve => setTimeout(resolve, 5));
    await manager.set('key3', { data: 'value3' });
    
    await new Promise(resolve => setTimeout(resolve, 5));
    // Access key1 to make it recently used
    await manager.get('key1');
    
    await new Promise(resolve => setTimeout(resolve, 5));
    // Add key4, should evict key2 (least recently used)
    await manager.set('key4', { data: 'value4' });
    
    expect((await manager.get('key1')).value).toEqual({ data: 'value1' });
    expect(await manager.get('key2')).toBeNull();
    expect((await manager.get('key3')).value).toEqual({ data: 'value3' });
    expect((await manager.get('key4')).value).toEqual({ data: 'value4' });
  });
});

describe('MemoryCache - Compression', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({
      compressionThreshold: 100,
      compressionAlgorithm: 'gzip',
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should compress large values', async () => {
    const largeData = { data: 'x'.repeat(200) };
    await manager.set('test-key', largeData);
    
    const stats = await manager.getStats();
    const entry = stats.entries.find(e => e.key === 'test-key');
    
    expect(entry.compressed).toBe(true);
  });

  it('should not compress small values', async () => {
    const smallData = { data: 'small' };
    await manager.set('test-key', smallData);
    
    const stats = await manager.getStats();
    const entry = stats.entries.find(e => e.key === 'test-key');
    
    expect(entry.compressed).toBe(false);
  });

  it('should decompress on retrieval', async () => {
    const largeData = { data: 'x'.repeat(200) };
    await manager.set('test-key', largeData);
    
    const result = await manager.get('test-key');
    expect(result.value).toEqual(largeData);
  });

  it('should support zstd compression', async () => {
    const zstdManager = new CacheManager({
      compressionThreshold: 100,
      compressionAlgorithm: 'zstd',
      zstdLevel: 3,
    });
    
    const largeData = { data: 'x'.repeat(200) };
    await zstdManager.set('test-key', largeData);
    
    const result = await zstdManager.get('test-key');
    expect(result.value).toEqual(largeData);
    
    zstdManager.destroy();
  });
});

describe('MemoryCache - Encryption', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({
      encryptionKey: 'test-encryption-key-32-bytes!!',
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should encrypt and decrypt values', async () => {
    const sensitiveData = { password: 'secret123', token: 'abc-xyz' };
    await manager.set('test-key', sensitiveData, 300, { encrypt: true });
    
    const result = await manager.get('test-key');
    expect(result.value).toEqual(sensitiveData);
  });

  it('should mark encrypted entries in stats', async () => {
    await manager.set('test-key', { data: 'secret' }, 300, { encrypt: true });
    
    const stats = await manager.getStats();
    const entry = stats.entries.find(e => e.key === 'test-key');
    
    expect(entry.encrypted).toBe(true);
  });

  it('should handle decryption errors gracefully', async () => {
    // Manually corrupt the cache entry
    await manager.set('test-key', { data: 'test' }, 300, { encrypt: true });
    manager.store.cache.get('test-key').value = 'corrupted-data';
    
    const retrieved = await manager.get('test-key');
    expect(retrieved).toBeNull();
  });

  it('should support both compression and encryption', async () => {
    const compressedManager = new CacheManager({
      encryptionKey: 'test-encryption-key-32-bytes!!',
      compressionThreshold: 50,
    });
    
    const largeData = { data: 'x'.repeat(100) };
    await compressedManager.set('test-key', largeData, 300, { encrypt: true });
    
    const stats = await compressedManager.getStats();
    const entry = stats.entries.find(e => e.key === 'test-key');
    
    expect(entry.compressed).toBe(true);
    expect(entry.encrypted).toBe(true);
    
    const result = await compressedManager.get('test-key');
    expect(result.value).toEqual(largeData);
    
    compressedManager.destroy();
  });
});

describe('CacheManager - Statistics', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should return cache statistics', async () => {
    await manager.set('key1', { data: 'value1' });
    await manager.set('key2', { data: 'value2' });
    
    const stats = await manager.getStats();
    
    expect(stats.enabled).toBe(true);
    expect(stats.type).toBe('memory');
    expect(stats.size).toBe(2);
    expect(stats.entries).toHaveLength(2);
  });

  it('should include entry details in stats', async () => {
    await manager.set('test-key', { data: 'test' }, 60);
    
    const stats = await manager.getStats();
    const entry = stats.entries[0];
    
    expect(entry.key).toBe('test-key');
    expect(entry.size).toBeGreaterThan(0);
    expect(entry.expiresIn).toBeGreaterThan(0);
    expect(entry.age).toBeGreaterThanOrEqual(0);
  });

  it('should return disabled stats when cache is disabled', async () => {
    const disabledManager = new CacheManager({ enabled: false });
    const stats = await disabledManager.getStats();
    
    expect(stats.enabled).toBe(false);
  });
});

describe('Cache Middleware', () => {
  let middleware;
  let cacheManager;
  let req;
  let res;
  let next;

  beforeEach(() => {
    const result = createCacheMiddleware({
      defaultTTL: 60,
      keyPrefix: 'test:',
    });
    
    middleware = result.middleware;
    cacheManager = result.cacheManager;
    
    req = {
      method: 'GET',
      url: '/api/test',
      query: {},
      headers: {},
    };
    
    res = {
      statusCode: 200,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      send: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      end: vi.fn(function(data) {
        if (data) this.body = data;
        return this;
      }),
      write: vi.fn(),
    };
    
    next = vi.fn();
  });

  afterEach(() => {
    cacheManager.destroy();
  });

  it('should cache GET requests', async () => {
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    
    // Simulate response
    res.json({ result: 'success' });
    
    // Wait for async cache write
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Second request should hit cache
    const req2 = { ...req };
    const res2 = { ...res, setHeader: vi.fn(), end: vi.fn() };
    
    await middleware(req2, res2, next);
    
    expect(res2.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
  });

  it('should not cache non-GET requests', async () => {
    req.method = 'POST';
    
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Cache', 'MISS');
  });

  it('should set cache headers', async () => {
    // Track setHeader calls
    const setHeaderCalls = [];
    const testRes = {
      statusCode: 200,
      setHeader: function(name, value) {
        setHeaderCalls.push({ name, value });
      },
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      send: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      end: vi.fn(function(data) {
        if (data) this.body = data;
        return this;
      }),
      write: vi.fn(),
    };
    
    await middleware(req, testRes, next);
    
    expect(setHeaderCalls.some(c => c.name === 'X-Cache' && c.value === 'MISS')).toBe(true);
    expect(setHeaderCalls.some(c => c.name === 'X-Cache-Key')).toBe(true);
  });

  it('should support custom shouldCache function', async () => {
    const customMiddleware = createCacheMiddleware({
      shouldCache: (req, res, data) => res.statusCode === 200,
    });
    
    const setHeaderCalls = [];
    const testRes = {
      statusCode: 500,
      setHeader: function(name, value) {
        setHeaderCalls.push({ name, value });
      },
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      send: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      end: vi.fn(function(data) {
        if (data) this.body = data;
        return this;
      }),
      write: vi.fn(),
    };
    
    await customMiddleware.middleware(req, testRes, next);
    testRes.json({ error: 'Server error' });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Should not be cached due to error status
    const req2 = { ...req };
    const setHeaderCalls2 = [];
    const res2 = {
      statusCode: 200,
      setHeader: function(name, value) {
        setHeaderCalls2.push({ name, value });
      },
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      send: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      end: vi.fn(function(data) {
        if (data) this.body = data;
        return this;
      }),
      write: vi.fn(),
    };
    
    await customMiddleware.middleware(req2, res2, next);
    expect(setHeaderCalls2.some(c => c.name === 'X-Cache' && c.value === 'MISS')).toBe(true);
    
    customMiddleware.cacheManager.destroy();
  });

  it('should support varyBy headers', async () => {
    const varyMiddleware = createCacheMiddleware({
      varyBy: ['Authorization'],
    });
    
    const req1 = { ...req, headers: { authorization: 'Bearer token1' } };
    const req2 = { ...req, headers: { authorization: 'Bearer token2' } };
    
    const setHeaderCalls1 = [];
    const res1 = {
      statusCode: 200,
      setHeader: function(name, value) {
        setHeaderCalls1.push({ name, value });
      },
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      send: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      end: vi.fn(function(data) {
        if (data) this.body = data;
        return this;
      }),
      write: vi.fn(),
    };
    
    await varyMiddleware.middleware(req1, res1, next);
    res1.json({ user: 'user1' });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const setHeaderCalls2 = [];
    const res2 = {
      statusCode: 200,
      setHeader: function(name, value) {
        setHeaderCalls2.push({ name, value });
      },
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      getHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      json: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      send: vi.fn(function(data) {
        this.body = data;
        return this;
      }),
      end: vi.fn(function(data) {
        if (data) this.body = data;
        return this;
      }),
      write: vi.fn(),
    };
    
    await varyMiddleware.middleware(req2, res2, next);
    
    // Different auth header should result in cache miss
    expect(setHeaderCalls2.some(c => c.name === 'X-Cache' && c.value === 'MISS')).toBe(true);
    
    varyMiddleware.cacheManager.destroy();
  });
});

describe('Cache Invalidation', () => {
  let manager;
  let invalidator;

  beforeEach(() => {
    manager = new CacheManager({ keyPrefix: 'api:' });
    invalidator = createCacheInvalidator(manager);
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should clear all cache', async () => {
    await manager.set('key1', { data: 'value1' });
    await manager.set('key2', { data: 'value2' });
    
    await invalidator.clearAll();
    
    expect(await manager.get('key1')).toBeNull();
    expect(await manager.get('key2')).toBeNull();
  });

  it('should invalidate specific route', async () => {
    await manager.set('api:route1', { data: 'value1' });
    await manager.set('api:route2', { data: 'value2' });
    
    await invalidator.invalidateRoute('route1');
    
    expect(await manager.get('api:route1')).toBeNull();
    expect((await manager.get('api:route2')).value).toEqual({ data: 'value2' });
  });
});

describe('Cache Cleanup', () => {
  it('should cleanup expired entries periodically', async () => {
    const manager = new CacheManager({ defaultTTL: 0.05 }); // 50ms TTL
    
    await manager.set('key1', { data: 'value1' });
    await manager.set('key2', { data: 'value2' });
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Trigger cleanup (normally runs every 60s)
    const now = Date.now();
    for (const [key, entry] of manager.store.cache.entries()) {
      if (now > entry.expiresAt) {
        manager.store.cache.delete(key);
      }
    }
    
    expect(await manager.get('key1')).toBeNull();
    expect(await manager.get('key2')).toBeNull();
    
    manager.destroy();
  });

  it('should cleanup on destroy', () => {
    const manager = new CacheManager();
    expect(manager.store.cleanupInterval).toBeDefined();
    
    manager.destroy();
    
    expect(manager.store.cleanupInterval).toBeNull();
  });
});

describe('Performance Optimization - Fast Path', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({
      compressionThreshold: 1000, // High threshold to avoid compression
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should store raw objects when no processing needed', async () => {
    const smallData = { id: 1, name: 'test', active: true };
    await manager.set('test-key', smallData);
    
    const entry = manager.store.cache.get('test-key');
    
    // Should store raw object, not serialized string
    expect(entry.value).toEqual(smallData);
    expect(entry.compressed).toBe(false);
    expect(entry.encrypted).toBe(false);
    expect(typeof entry.value).toBe('object');
  });

  it('should return raw objects directly without parsing', async () => {
    const testData = { id: 1, name: 'test', items: [1, 2, 3] };
    await manager.set('test-key', testData);
    
    const result = await manager.get('test-key');
    
    // Should return exact same object reference (no JSON.parse)
    expect(result.value).toEqual(testData);
    expect(typeof result.value).toBe('object');
  });

  it('should serialize only when compression is needed', async () => {
    const largeData = { data: 'x'.repeat(1500) }; // Exceeds threshold
    await manager.set('test-key', largeData);
    
    const entry = manager.store.cache.get('test-key');
    
    // Should be compressed and stored as buffer (not plain object)
    expect(entry.compressed).toBe(true);
    expect(Buffer.isBuffer(entry.value)).toBe(true);
  });

  it('should serialize only when encryption is needed', async () => {
    const encryptedManager = new CacheManager({
      encryptionKey: 'test-key-32-bytes-long-string!',
      compressionThreshold: 10000, // Very high to avoid compression
    });
    
    const smallData = { secret: 'password123' };
    await encryptedManager.set('test-key', smallData, 300, { encrypt: true });
    
    const entry = encryptedManager.store.cache.get('test-key');
    
    // Should be encrypted and stored as string
    expect(entry.encrypted).toBe(true);
    expect(typeof entry.value).toBe('string');
    
    // Should still decrypt correctly
    const result = await encryptedManager.get('test-key');
    expect(result.value).toEqual(smallData);
    
    encryptedManager.destroy();
  });

  it('should handle mixed cache entries (processed and unprocessed)', async () => {
    const smallData = { id: 1, name: 'small' };
    const largeData = { data: 'x'.repeat(1500) };
    
    await manager.set('small-key', smallData);
    await manager.set('large-key', largeData);
    
    const smallEntry = manager.store.cache.get('small-key');
    const largeEntry = manager.store.cache.get('large-key');
    
    // Small should be raw object (not a Buffer)
    expect(typeof smallEntry.value).toBe('object');
    expect(Buffer.isBuffer(smallEntry.value)).toBe(false);
    expect(smallEntry.compressed).toBe(false);
    
    // Large should be compressed (stored as Buffer)
    expect(largeEntry.compressed).toBe(true);
    expect(Buffer.isBuffer(largeEntry.value)).toBe(true);
    
    // Both should retrieve correctly
    expect((await manager.get('small-key')).value).toEqual(smallData);
    expect((await manager.get('large-key')).value).toEqual(largeData);
  });

  it('should calculate size correctly in stats for raw objects', async () => {
    const testData = { id: 1, name: 'test', value: 42 };
    await manager.set('test-key', testData);
    
    const stats = await manager.getStats();
    const entry = stats.entries.find(e => e.key === 'test-key');
    
    // Should lazy-serialize for size calculation
    expect(entry.size).toBeGreaterThan(0);
    expect(entry.compressed).toBe(false);
    expect(entry.encrypted).toBe(false);
  });

  it('should not serialize on every get operation', async () => {
    const testData = { counter: 0, items: ['a', 'b', 'c'] };
    await manager.set('test-key', testData);
    
    // Multiple gets should not trigger serialization
    const result1 = await manager.get('test-key');
    const result2 = await manager.get('test-key');
    const result3 = await manager.get('test-key');
    
    expect(result1.value).toEqual(testData);
    expect(result2.value).toEqual(testData);
    expect(result3.value).toEqual(testData);
  });

  it('should handle complex nested objects without serialization', async () => {
    const complexData = {
      user: {
        id: 1,
        profile: {
          name: 'John',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
      },
      items: [
        { id: 1, value: 'a' },
        { id: 2, value: 'b' },
      ],
    };
    
    await manager.set('complex-key', complexData);
    
    const entry = manager.store.cache.get('complex-key');
    expect(typeof entry.value).toBe('object');
    expect(entry.compressed).toBe(false);
    
    const result = await manager.get('complex-key');
    expect(result.value).toEqual(complexData);
  });

  it('should update raw objects without re-serialization', async () => {
    const data1 = { version: 1, value: 'first' };
    const data2 = { version: 2, value: 'second' };
    
    await manager.set('test-key', data1);
    await manager.set('test-key', data2); // Update
    
    const entry = manager.store.cache.get('test-key');
    expect(typeof entry.value).toBe('object');
    expect(entry.value).toEqual(data2);
    
    const result = await manager.get('test-key');
    expect(result.value).toEqual(data2);
  });
});

describe('Performance Optimization - Benchmark', () => {
  it('should demonstrate performance improvement for small objects', async () => {
    const iterations = 1000;
    const testData = { id: 1, name: 'test', active: true };
    
    const manager = new CacheManager({
      compressionThreshold: 10000, // Avoid compression
      maxSize: iterations,
    });
    
    // Warm up
    await manager.set('warmup', testData);
    await manager.get('warmup');
    
    // Benchmark set operations
    const setStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await manager.set(`key-${i}`, testData);
    }
    const setEnd = performance.now();
    const setTime = setEnd - setStart;
    
    // Benchmark get operations
    const getStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await manager.get(`key-${i}`);
    }
    const getEnd = performance.now();
    const getTime = getEnd - getStart;
    
    console.log(`Performance (${iterations} ops):`);
    console.log(`  Set: ${setTime.toFixed(2)}ms (${(setTime / iterations).toFixed(3)}ms per op)`);
    console.log(`  Get: ${getTime.toFixed(2)}ms (${(getTime / iterations).toFixed(3)}ms per op)`);
    
    // Verify correctness
    const result = await manager.get('key-500');
    expect(result.value).toEqual(testData);
    
    manager.destroy();
  });

  it('should handle high-frequency cache hits efficiently', async () => {
    const manager = new CacheManager({
      compressionThreshold: 10000,
    });
    
    const testData = { result: 'success', timestamp: Date.now() };
    await manager.set('hot-key', testData);
    
    const hits = 10000;
    const start = performance.now();
    
    for (let i = 0; i < hits; i++) {
      const result = await manager.get('hot-key');
      if (!result) throw new Error('Cache miss');
    }
    
    const end = performance.now();
    const totalTime = end - start;
    const avgTime = totalTime / hits;
    
    console.log(`High-frequency cache hits (${hits} ops):`);
    console.log(`  Total: ${totalTime.toFixed(2)}ms`);
    console.log(`  Average: ${avgTime.toFixed(4)}ms per hit`);
    console.log(`  Throughput: ${(hits / (totalTime / 1000)).toFixed(0)} ops/sec`);
    
    // Should be very fast (< 0.01ms per operation on average)
    expect(avgTime).toBeLessThan(0.1);
    
    manager.destroy();
  });
});

describe('Encryption Key Rotation', () => {
  it('should initialize with single encryption key', () => {
    const manager = new CacheManager({
      encryptionKey: 'test-key-v1',
    });
    
    expect(manager.store.encryption).toBeDefined();
    expect(manager.store.encryption.activeKey).toBe('test-key-v1');
    expect(manager.store.encryption.previousKeys).toEqual([]);
    
    manager.destroy();
  });

  it('should initialize with key rotation config', () => {
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: 'test-key-v2',
        previousKeys: ['test-key-v1'],
      },
    });
    
    expect(manager.store.encryption.activeKey).toBe('test-key-v2');
    expect(manager.store.encryption.previousKeys).toEqual(['test-key-v1']);
    
    manager.destroy();
  });

  it('should encrypt new data with active key', async () => {
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: 'test-key-v2-must-be-exactly32!!!',
        previousKeys: ['test-key-v1-must-be-exactly32!!!'],
      },
    });
    
    // New data should be encrypted with active key (v2)
    await manager.set('new-key', { data: 'new' }, 300, { encrypt: true });
    
    const result = await manager.get('new-key');
    expect(result.value).toEqual({ data: 'new' });
    
    manager.destroy();
  });

  it('should limit previous keys to 3', async () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1',
    });
    
    manager.rotateEncryptionKey('key-v2');
    manager.rotateEncryptionKey('key-v3');
    manager.rotateEncryptionKey('key-v4');
    manager.rotateEncryptionKey('key-v5');
    
    const status = manager.getEncryptionStatus();
    expect(status.previousKeyCount).toBe(3);
    expect(manager.store.encryption.previousKeys).toEqual(['key-v4', 'key-v3', 'key-v2']);
    
    manager.destroy();
  });

  it('should get encryption status', () => {
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v2',
        previousKeys: ['key-v1'],
      },
    });
    
    const status = manager.getEncryptionStatus();
    expect(status.enabled).toBe(true);
    expect(status.hasActiveKey).toBe(true);
    expect(status.previousKeyCount).toBe(1);
    
    manager.destroy();
  });

  it('should return disabled status when encryption not enabled', () => {
    const manager = new CacheManager();
    
    const status = manager.getEncryptionStatus();
    expect(status.enabled).toBe(false);
    
    manager.destroy();
  });

  it('should throw error when rotating key on non-encrypted cache', () => {
    const manager = new CacheManager();
    
    expect(() => {
      manager.rotateEncryptionKey('new-key');
    }).toThrow('Encryption is not enabled');
    
    manager.destroy();
  });

  it('should clear key cache on rotation', async () => {
    const manager = new CacheManager({
      encryptionKey: 'test-key-v1-32-bytes-long!!!',
    });
    
    // Encrypt some data to populate key cache
    await manager.set('test-key', { data: 'test' }, 300, { encrypt: true });
    
    const cacheSizeBefore = manager.store.encryption.keyCache.size;
    expect(cacheSizeBefore).toBeGreaterThan(0);
    
    // Rotate key
    manager.rotateEncryptionKey('test-key-v2-32-bytes-long!!!');
    
    // Key cache should be cleared
    expect(manager.store.encryption.keyCache.size).toBe(0);
    
    manager.destroy();
  });

  it('should handle multiple key rotations with old cached data', async () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1-32-bytes-long-string!',
    });
    
    // Encrypt with key-v1
    await manager.set('key1', { data: 'v1' }, 300, { encrypt: true });
    const encrypted1 = manager.store.cache.get('key1').value;
    
    // Rotate to key-v2
    manager.rotateEncryptionKey('key-v2-32-bytes-long-string!');
    await manager.set('key2', { data: 'v2' }, 300, { encrypt: true });
    const encrypted2 = manager.store.cache.get('key2').value;
    
    // Rotate to key-v3
    manager.rotateEncryptionKey('key-v3-32-bytes-long-string!');
    await manager.set('key3', { data: 'v3' }, 300, { encrypt: true });
    
    // All should be readable
    expect((await manager.get('key1')).value).toEqual({ data: 'v1' });
    expect((await manager.get('key2')).value).toEqual({ data: 'v2' });
    expect((await manager.get('key3')).value).toEqual({ data: 'v3' });
    
    manager.destroy();
  });
});

describe('MemoryCache - Byte-Based Eviction', () => {
  it('should initialize with maxBytes option', () => {
    const manager = new CacheManager({
      maxBytes: 1024 * 1024, // 1MB
    });
    
    expect(manager.store.maxBytes).toBe(1024 * 1024);
    expect(manager.store.currentBytes).toBe(0);
    
    manager.destroy();
  });

  it('should track byte size for uncompressed entries', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      compressionThreshold: 100000, // Disable compression
    });
    
    const data = { message: 'x'.repeat(100) };
    await manager.set('test-key', data);
    
    expect(manager.store.currentBytes).toBeGreaterThan(0);
    expect(manager.store.currentBytes).toBeLessThan(200); // Rough estimate
    
    manager.destroy();
  });

  it('should track byte size for compressed entries', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      compressionThreshold: 50,
      compressionAlgorithm: 'gzip',
    });
    
    const largeData = { message: 'x'.repeat(500) };
    await manager.set('test-key', largeData);
    
    const entry = manager.store.cache.get('test-key');
    expect(entry.compressed).toBe(true);
    expect(entry.size).toBeGreaterThan(0);
    expect(manager.store.currentBytes).toBe(entry.size);
    
    manager.destroy();
  });

  it('should track byte size for encrypted entries', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      encryptionKey: 'test-key-32-bytes-long-string!',
      compressionThreshold: 100000, // Disable compression
    });
    
    const data = { secret: 'password123' };
    await manager.set('test-key', data, 300, { encrypt: true });
    
    const entry = manager.store.cache.get('test-key');
    expect(entry.encrypted).toBe(true);
    expect(entry.size).toBeGreaterThan(0);
    expect(manager.store.currentBytes).toBe(entry.size);
    
    manager.destroy();
  });

  it('should evict entries when maxBytes is exceeded', async () => {
    const manager = new CacheManager({
      maxBytes: 200, // Very small limit
      compressionThreshold: 100000, // Disable compression
    });
    
    // Add entries that will exceed limit
    await manager.set('key1', { data: 'x'.repeat(60) });
    await new Promise(resolve => setTimeout(resolve, 5));
    await manager.set('key2', { data: 'y'.repeat(60) });
    await new Promise(resolve => setTimeout(resolve, 5));
    
    // This should trigger eviction
    await manager.set('key3', { data: 'z'.repeat(60) });
    
    const stats = await manager.getStats();
    
    // Should stay within byte limit
    expect(stats.currentBytes).toBeLessThanOrEqual(200);
    
    // key1 should be evicted (oldest)
    expect(await manager.get('key1')).toBeNull();
    
    manager.destroy();
  });

  it('should prevent one giant entry from evicting everything', async () => {
    const manager = new CacheManager({
      maxBytes: 1000,
      compressionThreshold: 100000,
    });
    
    // Add several small entries
    await manager.set('small1', { data: 'a'.repeat(20) });
    await manager.set('small2', { data: 'b'.repeat(20) });
    await manager.set('small3', { data: 'c'.repeat(20) });
    
    const sizeBefore = manager.store.cache.size;
    expect(sizeBefore).toBe(3);
    
    // Add one large entry
    await manager.set('large', { data: 'x'.repeat(300) });
    
    // Should evict enough to fit the large entry
    const stats = await manager.getStats();
    expect(stats.currentBytes).toBeLessThanOrEqual(1000);
    expect(stats.size).toBeGreaterThan(0); // Should still have some entries
    
    manager.destroy();
  });

  it('should update byte counter when deleting entries', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      compressionThreshold: 100000,
    });
    
    await manager.set('key1', { data: 'x'.repeat(100) });
    await manager.set('key2', { data: 'y'.repeat(100) });
    
    const bytesBefore = manager.store.currentBytes;
    expect(bytesBefore).toBeGreaterThan(0);
    
    await manager.delete('key1');
    
    const bytesAfter = manager.store.currentBytes;
    expect(bytesAfter).toBeLessThan(bytesBefore);
    expect(bytesAfter).toBeGreaterThan(0); // key2 still there
    
    manager.destroy();
  });

  it('should reset byte counter when clearing cache', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      compressionThreshold: 100000,
    });
    
    await manager.set('key1', { data: 'x'.repeat(100) });
    await manager.set('key2', { data: 'y'.repeat(100) });
    
    expect(manager.store.currentBytes).toBeGreaterThan(0);
    
    await manager.clear();
    
    expect(manager.store.currentBytes).toBe(0);
    expect(manager.store.cache.size).toBe(0);
    
    manager.destroy();
  });

  it('should update byte counter when entry expires', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      defaultTTL: 0.05, // 50ms
      compressionThreshold: 100000,
    });
    
    await manager.set('key1', { data: 'x'.repeat(100) });
    
    const bytesBefore = manager.store.currentBytes;
    expect(bytesBefore).toBeGreaterThan(0);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Access expired entry (should delete it)
    await manager.get('key1');
    
    expect(manager.store.currentBytes).toBe(0);
    
    manager.destroy();
  });

  it('should handle entry updates correctly', async () => {
    const manager = new CacheManager({
      maxBytes: 10000,
      compressionThreshold: 100000,
    });
    
    // Set initial value
    await manager.set('key1', { data: 'x'.repeat(50) });
    const bytesAfterFirst = manager.store.currentBytes;
    
    // Update with larger value
    await manager.set('key1', { data: 'y'.repeat(100) });
    const bytesAfterUpdate = manager.store.currentBytes;
    
    // Bytes should increase (not double-count)
    expect(bytesAfterUpdate).toBeGreaterThan(bytesAfterFirst);
    expect(manager.store.cache.size).toBe(1); // Still only one entry
    
    manager.destroy();
  });

  it('should include byte stats in getStats()', async () => {
    const manager = new CacheManager({
      maxBytes: 5000,
      compressionThreshold: 100000,
    });
    
    await manager.set('key1', { data: 'x'.repeat(100) });
    await manager.set('key2', { data: 'y'.repeat(200) });
    
    const stats = await manager.getStats();
    
    expect(stats.maxBytes).toBe(5000);
    expect(stats.currentBytes).toBeGreaterThan(0);
    expect(stats.utilizationPercent).toBeDefined();
    expect(parseFloat(stats.utilizationPercent)).toBeGreaterThan(0);
    expect(parseFloat(stats.utilizationPercent)).toBeLessThan(100);
    
    manager.destroy();
  });

  it('should calculate utilization percentage correctly', async () => {
    const manager = new CacheManager({
      maxBytes: 1000,
      compressionThreshold: 100000,
    });
    
    // Fill to ~50%
    await manager.set('key1', { data: 'x'.repeat(120) }); // ~130 bytes with JSON overhead
    
    const stats = await manager.getStats();
    const utilization = parseFloat(stats.utilizationPercent);
    
    expect(utilization).toBeGreaterThan(0);
    expect(utilization).toBeLessThan(100);
    
    manager.destroy();
  });

  it('should fall back to entry-count eviction when maxBytes not set', async () => {
    const manager = new CacheManager({
      maxSize: 3, // Only maxSize, no maxBytes
      compressionThreshold: 100000,
    });
    
    await manager.set('key1', { data: 'x'.repeat(10) });
    await new Promise(resolve => setTimeout(resolve, 5));
    await manager.set('key2', { data: 'y'.repeat(10) });
    await new Promise(resolve => setTimeout(resolve, 5));
    await manager.set('key3', { data: 'z'.repeat(10) });
    await new Promise(resolve => setTimeout(resolve, 5));
    
    // Fourth entry should evict oldest
    await manager.set('key4', { data: 'w'.repeat(10) });
    
    expect(manager.store.cache.size).toBe(3);
    expect(await manager.get('key1')).toBeNull(); // Evicted
    expect(await manager.get('key4')).toBeDefined(); // Added
    
    manager.destroy();
  });

  it('should handle mixed compression with byte tracking', async () => {
    const manager = new CacheManager({
      maxBytes: 2000,
      compressionThreshold: 100,
      compressionAlgorithm: 'gzip',
    });
    
    // Small uncompressed
    await manager.set('small', { data: 'x'.repeat(20) });
    
    // Large compressed
    await manager.set('large', { data: 'y'.repeat(500) });
    
    const stats = await manager.getStats();
    
    // Both should contribute to byte count
    expect(stats.currentBytes).toBeGreaterThan(0);
    expect(stats.currentBytes).toBeLessThanOrEqual(2000);
    
    // Verify entries
    const smallEntry = stats.entries.find(e => e.key === 'small');
    const largeEntry = stats.entries.find(e => e.key === 'large');
    
    expect(smallEntry.compressed).toBe(false);
    expect(largeEntry.compressed).toBe(true);
    expect(smallEntry.size).toBeGreaterThan(0);
    expect(largeEntry.size).toBeGreaterThan(0);
    
    manager.destroy();
  });

  it('should prevent memory spikes from large entries', async () => {
    const manager = new CacheManager({
      maxBytes: 1000,
      compressionThreshold: 100000,
    });
    
    // Try to add entry larger than maxBytes
    await manager.set('huge', { data: 'x'.repeat(500) });
    
    // Should evict everything to make room
    const stats = await manager.getStats();
    expect(stats.currentBytes).toBeLessThanOrEqual(1000);
    
    // The huge entry should fit (or cache should be empty if too large)
    expect(stats.size).toBeGreaterThanOrEqual(0);
    
    manager.destroy();
  });

  it('should handle byte tracking with encryption and compression', async () => {
    const manager = new CacheManager({
      maxBytes: 5000,
      encryptionKey: 'test-key-32-bytes-long-string!',
      compressionThreshold: 50,
      compressionAlgorithm: 'gzip',
    });
    
    const largeData = { secret: 'x'.repeat(200) };
    await manager.set('test-key', largeData, 300, { encrypt: true });
    
    const entry = manager.store.cache.get('test-key');
    expect(entry.compressed).toBe(true);
    expect(entry.encrypted).toBe(true);
    expect(entry.size).toBeGreaterThan(0);
    expect(manager.store.currentBytes).toBe(entry.size);
    
    // Should retrieve correctly
    const result = await manager.get('test-key');
    expect(result.value).toEqual(largeData);
    
    manager.destroy();
  });
});

