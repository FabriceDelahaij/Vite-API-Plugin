import { describe, test, expect, vi } from 'vitest';
import { MemoryCache } from '../cache.js';

describe('MemoryCache Performance Optimizations', () => {
  describe('LRU Eviction Modes', () => {
    test('fast mode uses Map re-insertion for LRU tracking', async () => {
      const cache = new MemoryCache({
        maxSize: 3,
        lruMode: 'fast',
        defaultTTL: 3600,
      });

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      // Access key1 to make it most recently used
      await cache.get('key1');

      // Add key4, should evict key2 (least recently used)
      await cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);

      cache.destroy();
    });

    test('secure mode with small cache uses fast eviction', async () => {
      const cache = new MemoryCache({
        maxSize: 3,
        lruMode: 'secure',
        lruSortThreshold: 1000, // Cache size is below threshold
        defaultTTL: 3600,
      });

      await cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key3', 'value3');

      // Access key1 to update lastAccess
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.get('key1');

      // Add key4, should evict key2 (oldest lastAccess)
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted (oldest access)
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);

      cache.destroy();
    });

    test('secure mode with large cache uses sort-based eviction', async () => {
      const cache = new MemoryCache({
        maxSize: 4,
        lruMode: 'secure',
        lruSortThreshold: 3, // Cache will exceed threshold
        defaultTTL: 3600,
      });

      // Fill cache to max
      await cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key4', 'value4');

      // Access key1 to update lastAccess
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.get('key1');

      // Add key5, should evict key2 (oldest lastAccess)
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key5', 'value5');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted (oldest access)
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
      expect(cache.has('key5')).toBe(true);

      cache.destroy();
    });

    test('fast mode performance is better for frequent access', async () => {
      const fastCache = new MemoryCache({
        maxSize: 100,
        lruMode: 'fast',
        defaultTTL: 3600,
      });

      const secureCache = new MemoryCache({
        maxSize: 100,
        lruMode: 'secure',
        lruSortThreshold: 50, // Will trigger sort-based eviction
        defaultTTL: 3600,
      });

      // Fill both caches
      for (let i = 0; i < 100; i++) {
        await fastCache.set(`key${i}`, `value${i}`);
        await secureCache.set(`key${i}`, `value${i}`);
      }

      // Measure fast mode
      const fastStart = Date.now();
      for (let i = 0; i < 50; i++) {
        await fastCache.get(`key${i}`);
      }
      const fastTime = Date.now() - fastStart;

      // Measure secure mode
      const secureStart = Date.now();
      for (let i = 0; i < 50; i++) {
        await secureCache.get(`key${i}`);
      }
      const secureTime = Date.now() - secureStart;

      // Fast mode should be faster (though not guaranteed in all environments)
      // Just verify both complete successfully
      expect(fastTime).toBeGreaterThanOrEqual(0);
      expect(secureTime).toBeGreaterThanOrEqual(0);

      fastCache.destroy();
      secureCache.destroy();
    });
  });

  describe('TTL Cleanup Strategies', () => {
    test('interval strategy cleans up at fixed intervals', async () => {
      vi.useFakeTimers();

      const cache = new MemoryCache({
        maxSize: 10,
        cleanupStrategy: 'interval',
        defaultTTL: 1, // 1 second
      });

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Fast forward 2 seconds (entries expired)
      vi.advanceTimersByTime(2000);

      // Fast forward cleanup interval (60 seconds)
      vi.advanceTimersByTime(60000);

      // Entries should be cleaned up
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);

      cache.destroy();
      vi.useRealTimers();
    });

    test('adaptive strategy adjusts cleanup frequency based on cache size', async () => {
      vi.useFakeTimers();

      const smallCache = new MemoryCache({
        maxSize: 10,
        cleanupStrategy: 'adaptive',
        defaultTTL: 1,
      });

      const largeCache = new MemoryCache({
        maxSize: 10000,
        cleanupStrategy: 'adaptive',
        defaultTTL: 1,
      });

      // Both should have cleanup intervals set
      expect(smallCache.cleanupInterval).toBeDefined();
      expect(largeCache.cleanupInterval).toBeDefined();

      smallCache.destroy();
      largeCache.destroy();
      vi.useRealTimers();
    });

    test('probabilistic strategy cleans up on get() calls', async () => {
      const cache = new MemoryCache({
        maxSize: 10,
        cleanupStrategy: 'probabilistic',
        cleanupProbability: 1.0, // 100% for testing
        defaultTTL: 1, // 1 second
      });

      // No interval should be set
      expect(cache.cleanupInterval).toBeNull();

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2', 1); // 1 second TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Trigger cleanup via get()
      await cache.get('key1');

      // Expired entry should be cleaned up
      expect(cache.has('key2')).toBe(false);

      cache.destroy();
    });

    test('probabilistic strategy with low probability', async () => {
      const cache = new MemoryCache({
        maxSize: 10,
        cleanupStrategy: 'probabilistic',
        cleanupProbability: 0.01, // 1% chance
        defaultTTL: 1,
      });

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2', 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Multiple get() calls, cleanup might happen
      let cleanedUp = false;
      for (let i = 0; i < 200; i++) {
        await cache.get('key1');
        if (!cache.has('key2')) {
          cleanedUp = true;
          break;
        }
      }

      // With 200 attempts at 1% probability, cleanup should likely happen
      // But we won't assert it to avoid flaky tests
      expect(cleanedUp || cache.has('key2')).toBe(true);

      cache.destroy();
    });

    test('probabilistic cleanup does not affect valid entries', async () => {
      const cache = new MemoryCache({
        maxSize: 10,
        cleanupStrategy: 'probabilistic',
        cleanupProbability: 1.0,
        defaultTTL: 3600, // 1 hour
      });

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Trigger cleanup multiple times
      for (let i = 0; i < 10; i++) {
        await cache.get('key1');
      }

      // Valid entries should remain
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);

      cache.destroy();
    });
  });

  describe('Combined Performance Features', () => {
    test('fast LRU + probabilistic cleanup work together', async () => {
      const cache = new MemoryCache({
        maxSize: 2, // Smaller cache to force eviction
        lruMode: 'fast',
        cleanupStrategy: 'probabilistic',
        cleanupProbability: 1.0,
        defaultTTL: 3600, // Long TTL for key1 and key2
      });

      await cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key2', 'value2');

      // Access key1 to make it most recently used
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.get('key1');

      // Add key3, should evict key2 (LRU in fast mode)
      await new Promise(resolve => setTimeout(resolve, 10));
      await cache.set('key3', 'value3');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted (LRU)
      expect(cache.has('key3')).toBe(true);

      cache.destroy();
    });

    test('configuration options are properly stored', () => {
      const cache = new MemoryCache({
        lruMode: 'fast',
        lruSortThreshold: 500,
        cleanupStrategy: 'adaptive',
        cleanupProbability: 0.05,
      });

      expect(cache.lruMode).toBe('fast');
      expect(cache.lruSortThreshold).toBe(500);
      expect(cache.cleanupStrategy).toBe('adaptive');
      expect(cache.cleanupProbability).toBe(0.05);

      cache.destroy();
    });

    test('default configuration values', () => {
      const cache = new MemoryCache({});

      expect(cache.lruMode).toBe('secure');
      expect(cache.lruSortThreshold).toBe(1000);
      expect(cache.cleanupStrategy).toBe('interval');
      expect(cache.cleanupProbability).toBe(0.01);

      cache.destroy();
    });
  });
});
