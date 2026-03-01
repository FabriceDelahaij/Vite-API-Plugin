/**
 * Cache Key Versioning Tests
 * 
 * Tests the cache versioning feature for zero-downtime cache busts
 * and safe schema changes (serialization/encryption/compression).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager, createCacheMiddleware } from './src/lib/cache.js';

// Test utilities
function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/api/data',
    originalUrl: options.url || '/api/data',
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {},
  };
}

function createMockResponse() {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    getHeaders() {
      return headers;
    },
    removeHeader(name) {
      delete headers[name.toLowerCase()];
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    end() {
      this.ended = true;
    },
    write() {},
  };
  return res;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Cache Key Versioning', () => {
  
  describe('Default Version', () => {
    it('should default to v1', async () => {
      const cacheManager = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
      });
      
      const stats = await cacheManager.getStats();
      expect(stats.cacheVersion).toBe('v1');
    });
    
    it('should include v1 in cache key', async () => {
      const cacheManager = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
      });
      
      const req = createMockRequest();
      const key = cacheManager.generateKey(req);
      
      expect(key).toMatch(/^test:v1:[a-f0-9]{16}$/);
    });
  });
  
  describe('Custom Version', () => {
    it('should use custom version in key', async () => {
      const cacheManager = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v2',
      });
      
      const req = createMockRequest();
      const key = cacheManager.generateKey(req);
      
      expect(key).toMatch(/^test:v2:[a-f0-9]{16}$/);
    });
    
    it('should expose version in stats', async () => {
      const cacheManager = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v2.1.0',
      });
      
      const stats = await cacheManager.getStats();
      expect(stats.cacheVersion).toBe('v2.1.0');
      expect(stats.keyPrefix).toBe('test:');
    });
  });
  
  describe('Version Isolation', () => {
    it('should create separate namespaces for different versions', async () => {
      const cache1 = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v1',
      });
      
      const cache2 = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v2',
      });
      
      const req = createMockRequest();
      const key1 = cache1.generateKey(req);
      const key2 = cache2.generateKey(req);
      
      expect(key1).not.toBe(key2);
      expect(key1).toContain('v1');
      expect(key2).toContain('v2');
    });
    
    it('should not share cache entries between versions', async () => {
      const cache1 = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v1',
      });
      
      const cache2 = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v2',
      });
      
      const req = createMockRequest();
      const key1 = cache1.generateKey(req);
      const key2 = cache2.generateKey(req);
      
      // Set in v1
      await cache1.set(key1, { data: 'v1 data' }, 60);
      
      // Should not exist in v2
      const result = await cache2.get(key2);
      expect(result).toBeNull();
    });
  });
  
  describe('Zero-Downtime Deployment', () => {
    it('should allow gradual migration from v1 to v2', async () => {
      // Old deployment (v1)
      const oldCache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v1',
        compressionAlgorithm: 'gzip',
      });
      
      const req = createMockRequest();
      const oldKey = oldCache.generateKey(req);
      await oldCache.set(oldKey, { data: 'old data' }, 60);
      
      // New deployment (v2) with different compression
      const newCache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v2',
        compressionAlgorithm: 'zstd',
      });
      
      const newKey = newCache.generateKey(req);
      
      // Old cache still works
      const oldResult = await oldCache.get(oldKey);
      expect(oldResult).not.toBeNull();
      expect(oldResult.value.data).toBe('old data');
      
      // New cache is empty (different namespace)
      const newResult = await newCache.get(newKey);
      expect(newResult).toBeNull();
      
      // Can populate new cache
      await newCache.set(newKey, { data: 'new data' }, 60);
      const newResult2 = await newCache.get(newKey);
      expect(newResult2).not.toBeNull();
      expect(newResult2.value.data).toBe('new data');
    });
  });
  
  describe('Rollback Support', () => {
    it('should allow rollback to previous version', async () => {
      // Deploy v2
      const v2Cache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v2',
      });
      
      const req = createMockRequest();
      const v2Key = v2Cache.generateKey(req);
      await v2Cache.set(v2Key, { data: 'v2 data' }, 60);
      
      // Rollback to v1
      const v1Cache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v1',
      });
      
      const v1Key = v1Cache.generateKey(req);
      
      // v1 namespace is separate (cache miss expected)
      const result = await v1Cache.get(v1Key);
      expect(result).toBeNull();
      
      // Can use v1 cache independently
      await v1Cache.set(v1Key, { data: 'v1 data' }, 60);
      const result2 = await v1Cache.get(v1Key);
      expect(result2).not.toBeNull();
      expect(result2.value.data).toBe('v1 data');
    });
  });
  
  describe('Semantic Versioning', () => {
    it('should support semantic version strings', async () => {
      const versions = [
        'v1.0.0',
        'v1.0.1',
        'v1.1.0',
        'v2.0.0',
        'v2.0.0-beta.1',
        'v2.0.0-rc.1',
      ];
      
      for (const version of versions) {
        const cache = new CacheManager({
          enabled: true,
          type: 'memory',
          keyPrefix: 'test:',
          cacheVersion: version,
        });
        
        const stats = await cache.getStats();
        expect(stats.cacheVersion).toBe(version);
        
        const req = createMockRequest();
        const key = cache.generateKey(req);
        expect(key).toContain(version);
      }
    });
  });
  
  describe('Key Format', () => {
    it('should follow consistent format: {prefix}{version}:{hash}', async () => {
      const cache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v1',
      });
      
      const req1 = createMockRequest({ url: '/api/users' });
      const req2 = createMockRequest({ url: '/api/posts' });
      const req3 = createMockRequest({ url: '/api/users', query: { id: '123' } });
      
      const key1 = cache.generateKey(req1);
      const key2 = cache.generateKey(req2);
      const key3 = cache.generateKey(req3);
      
      // All should match format
      const pattern = /^api:v1:[a-f0-9]{16}$/;
      expect(key1).toMatch(pattern);
      expect(key2).toMatch(pattern);
      expect(key3).toMatch(pattern);
      
      // Different requests should have different hashes
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });
  
  describe('Multiple Versions Coexist', () => {
    it('should allow multiple versions to coexist', async () => {
      const versions = ['v1', 'v2', 'v3', 'beta', 'canary'];
      const caches = [];
      
      for (const version of versions) {
        const cache = new CacheManager({
          enabled: true,
          type: 'memory',
          keyPrefix: 'test:',
          cacheVersion: version,
        });
        
        const req = createMockRequest();
        const key = cache.generateKey(req);
        await cache.set(key, { version }, 60);
        
        caches.push({ version, cache, key });
      }
      
      // Verify each version has its own data
      for (const { version, cache, key } of caches) {
        const result = await cache.get(key);
        expect(result).not.toBeNull();
        expect(result.value.version).toBe(version);
        
        const stats = await cache.getStats();
        expect(stats.cacheVersion).toBe(version);
      }
    });
  });
  
  describe('Middleware Integration', () => {
    it('should pass version to middleware', async () => {
      const { cacheManager } = createCacheMiddleware({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v2.5.0',
      });
      
      const stats = await cacheManager.getStats();
      expect(stats.cacheVersion).toBe('v2.5.0');
    });
    
    it('should generate versioned keys in middleware', async () => {
      const { cacheManager } = createCacheMiddleware({
        enabled: true,
        type: 'memory',
        keyPrefix: 'api:',
        cacheVersion: 'v3',
      });
      
      const req = createMockRequest();
      const key = cacheManager.generateKey(req);
      
      expect(key).toMatch(/^api:v3:[a-f0-9]{16}$/);
    });
  });
  
  describe('Cache Isolation', () => {
    it('should not affect other versions when clearing cache', async () => {
      const cache1 = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v1',
      });
      
      const cache2 = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v2',
      });
      
      const req = createMockRequest();
      const key1 = cache1.generateKey(req);
      const key2 = cache2.generateKey(req);
      
      // Populate both
      await cache1.set(key1, { data: 'v1' }, 60);
      await cache2.set(key2, { data: 'v2' }, 60);
      
      // Clear v1
      cache1.clear();
      
      // v1 should be empty
      const result1 = await cache1.get(key1);
      expect(result1).toBeNull();
      
      // v2 should still have data
      const result2 = await cache2.get(key2);
      expect(result2).not.toBeNull();
      expect(result2.value.data).toBe('v2');
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty version string', async () => {
      const cache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: '',
      });
      
      const req = createMockRequest();
      const key = cache.generateKey(req);
      
      // Should still work with empty version
      expect(key).toMatch(/^test::[a-f0-9]{16}$/);
    });
    
    it('should handle special characters in version', async () => {
      const cache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: 'v1.0.0-beta+build.123',
      });
      
      const req = createMockRequest();
      const key = cache.generateKey(req);
      
      expect(key).toContain('v1.0.0-beta+build.123');
    });
    
    it('should handle very long version strings', async () => {
      const longVersion = 'v' + '1'.repeat(100);
      const cache = new CacheManager({
        enabled: true,
        type: 'memory',
        keyPrefix: 'test:',
        cacheVersion: longVersion,
      });
      
      const req = createMockRequest();
      const key = cache.generateKey(req);
      
      expect(key).toContain(longVersion);
    });
  });
});

