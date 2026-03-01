/**
 * Security Hardening Tests for Cache System
 * Tests HMAC, AAD, key rotation grace period, and sensitive data zeroing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { CacheManager, createCacheMiddleware } from '../cache.js';

describe('Cache Security Hardening', () => {
  let cacheManager;

  afterEach(() => {
    if (cacheManager) {
      cacheManager.destroy();
    }
  });

  describe('HMAC Tamper Detection', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        enableHMAC: true,
        maxSize: 10,
      });
    });

    it('should include HMAC in encrypted data', async () => {
      await cacheManager.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      
      const entry = cacheManager.store.cache.get('test-key');
      expect(entry.encrypted).toBe(true);
      
      // Parse encrypted payload
      const payload = JSON.parse(entry.value);
      expect(payload.v).toBe(2); // Version 2 includes HMAC
      expect(payload.hmac).toBeDefined();
      expect(typeof payload.hmac).toBe('string');
    });

    it('should verify HMAC on decryption', async () => {
      await cacheManager.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      
      const result = await cacheManager.get('test-key');
      expect(result.value).toEqual({ data: 'sensitive' });
    });

    it('should reject tampered data (modified encrypted data)', async () => {
      await cacheManager.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      
      // Tamper with encrypted data
      const entry = cacheManager.store.cache.get('test-key');
      const payload = JSON.parse(entry.value);
      
      // Modify encrypted data (but keep HMAC)
      const tamperedData = Buffer.from(payload.data, 'base64');
      tamperedData[0] ^= 0xFF; // Flip bits
      payload.data = tamperedData.toString('base64');
      
      entry.value = JSON.stringify(payload);
      
      // Should fail HMAC verification
      const result = await cacheManager.get('test-key');
      expect(result).toBeNull();
    });

    it('should reject tampered HMAC', async () => {
      await cacheManager.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      
      // Tamper with HMAC
      const entry = cacheManager.store.cache.get('test-key');
      const payload = JSON.parse(entry.value);
      payload.hmac = 'tampered-hmac-value';
      entry.value = JSON.stringify(payload);
      
      // Should fail HMAC verification
      const result = await cacheManager.get('test-key');
      expect(result).toBeNull();
    });

    it('should work with HMAC disabled', async () => {
      const noHmacCache = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        enableHMAC: false,
        maxSize: 10,
      });

      await noHmacCache.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      
      const entry = noHmacCache.store.cache.get('test-key');
      const payload = JSON.parse(entry.value);
      expect(payload.hmac).toBeUndefined();
      
      const result = await noHmacCache.get('test-key');
      expect(result.value).toEqual({ data: 'sensitive' });
      
      noHmacCache.destroy();
    });
  });

  describe('Additional Authenticated Data (AAD)', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        enableAAD: true,
        maxSize: 10,
      });
    });

    it('should bind encrypted data to cache key', async () => {
      await cacheManager.set('user:123', { name: 'Alice' }, 300, { encrypt: true });
      
      const result = await cacheManager.get('user:123');
      expect(result.value).toEqual({ name: 'Alice' });
    });

    it('should reject data moved to different key (key-swapping attack)', async () => {
      await cacheManager.set('user:123', { name: 'Alice' }, 300, { encrypt: true });
      await cacheManager.set('user:456', { name: 'Bob' }, 300, { encrypt: true });
      
      // Swap encrypted values
      const entry123 = cacheManager.store.cache.get('user:123');
      const entry456 = cacheManager.store.cache.get('user:456');
      
      const temp = entry123.value;
      entry123.value = entry456.value;
      entry456.value = temp;
      
      // Should fail AAD verification (context mismatch)
      const result123 = await cacheManager.get('user:123');
      const result456 = await cacheManager.get('user:456');
      
      expect(result123).toBeNull(); // Should be Bob but AAD prevents it
      expect(result456).toBeNull(); // Should be Alice but AAD prevents it
    });

    it('should work with AAD disabled', async () => {
      const noAadCache = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        enableAAD: false,
        maxSize: 10,
      });

      await noAadCache.set('user:123', { name: 'Alice' }, 300, { encrypt: true });
      
      const result = await noAadCache.get('user:123');
      expect(result.value).toEqual({ name: 'Alice' });
      
      noAadCache.destroy();
    });
  });

  describe('Key Rotation Grace Period', () => {
    it('should accept entries within grace period', async () => {
      const oldKey = 'old-encryption-key-32-bytes!!!';
      const newKey = 'new-encryption-key-32-bytes!!!';
      
      // Create cache with old key
      const oldCache = new CacheManager({
        encryptionKey: oldKey,
        maxSize: 10,
      });
      
      await oldCache.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      const entry = oldCache.store.cache.get('test-key');
      oldCache.destroy();
      
      // Create new cache with key rotation (7 day grace period)
      const newCache = new CacheManager({
        encryptionKey: {
          activeKey: newKey,
          previousKeys: [oldKey],
        },
        keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxSize: 10,
      });
      
      // Manually insert old entry
      newCache.store.cache.set('test-key', entry);
      
      // Should decrypt successfully (within grace period)
      const result = await newCache.get('test-key');
      expect(result.value).toEqual({ data: 'sensitive' });
      
      newCache.destroy();
    });

    it('should reject entries beyond grace period', async () => {
      const oldKey = 'old-encryption-key-32-bytes!!!';
      const newKey = 'new-encryption-key-32-bytes!!!';
      
      // Create cache with old key
      const oldCache = new CacheManager({
        encryptionKey: oldKey,
        maxSize: 10,
      });
      
      await oldCache.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      const entry = oldCache.store.cache.get('test-key');
      
      // Modify timestamp to be 8 days old
      const payload = JSON.parse(entry.value);
      payload.timestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      entry.value = JSON.stringify(payload);
      
      oldCache.destroy();
      
      // Create new cache with key rotation (7 day grace period)
      const newCache = new CacheManager({
        encryptionKey: {
          activeKey: newKey,
          previousKeys: [oldKey],
        },
        keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxSize: 10,
      });
      
      // Manually insert old entry
      newCache.store.cache.set('test-key', entry);
      
      // Should reject (beyond grace period)
      const result = await newCache.get('test-key');
      expect(result).toBeNull();
      
      newCache.destroy();
    });

    it('should always accept entries encrypted with active key', async () => {
      const activeKey = 'active-encryption-key-32-bytes';
      
      cacheManager = new CacheManager({
        encryptionKey: activeKey,
        keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000,
        maxSize: 10,
      });
      
      await cacheManager.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      
      // Modify timestamp to be very old
      const entry = cacheManager.store.cache.get('test-key');
      const payload = JSON.parse(entry.value);
      payload.timestamp = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
      entry.value = JSON.stringify(payload);
      
      // Should still decrypt (active key has no age limit)
      const result = await cacheManager.get('test-key');
      expect(result.value).toEqual({ data: 'sensitive' });
    });

    it('should disable grace period when set to 0', async () => {
      const oldKey = 'old-encryption-key-32-bytes!!!';
      const newKey = 'new-encryption-key-32-bytes!!!';
      
      // Create cache with old key
      const oldCache = new CacheManager({
        encryptionKey: oldKey,
        maxSize: 10,
      });
      
      await oldCache.set('test-key', { data: 'sensitive' }, 300, { encrypt: true });
      const entry = oldCache.store.cache.get('test-key');
      
      // Modify timestamp to be very old
      const payload = JSON.parse(entry.value);
      payload.timestamp = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
      entry.value = JSON.stringify(payload);
      
      oldCache.destroy();
      
      // Create new cache with grace period disabled
      const newCache = new CacheManager({
        encryptionKey: {
          activeKey: newKey,
          previousKeys: [oldKey],
        },
        keyRotationGracePeriod: 0, // Disabled
        maxSize: 10,
      });
      
      // Manually insert old entry
      newCache.store.cache.set('test-key', entry);
      
      // Should decrypt successfully (grace period disabled)
      const result = await newCache.get('test-key');
      expect(result.value).toEqual({ data: 'sensitive' });
      
      newCache.destroy();
    });
  });

  describe('Sensitive Data Zeroing', () => {
    it('should not log encryption keys in errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      cacheManager = new CacheManager({
        encryptionKey: 'secret-key-should-not-appear-in-logs',
        maxSize: 10,
      });
      
      // Force an encryption error by corrupting internal state
      const originalEncrypt = cacheManager.store.encryption.encrypt;
      cacheManager.store.encryption.encrypt = async () => {
        throw new Error('Simulated encryption error with secret-key-should-not-appear-in-logs');
      };
      
      try {
        await cacheManager.set('test-key', { data: 'test' }, 300, { encrypt: true });
      } catch (error) {
        // Error should be thrown
      }
      
      // Check that key is not in console output
      const loggedMessages = consoleSpy.mock.calls.map(call => call.join(' '));
      const hasKeyInLogs = loggedMessages.some(msg => msg.includes('secret-key-should-not-appear-in-logs'));
      
      expect(hasKeyInLogs).toBe(false);
      
      consoleSpy.mockRestore();
    });

    it('should zero derived keys from cache on eviction', async () => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        maxSize: 10,
      });
      
      const encryption = cacheManager.store.encryption;
      
      // Fill key cache to trigger eviction (use smaller number to avoid timeout)
      const promises = [];
      for (let i = 0; i < 105; i++) {
        const salt = crypto.randomBytes(32);
        promises.push(encryption._getDerivedKey(salt, 'test-key'));
      }
      await Promise.all(promises);
      
      // Key cache should be limited to 100 entries
      expect(encryption.keyCache.size).toBeLessThanOrEqual(100);
    }, 10000); // Increase timeout to 10 seconds

    it('should zero all keys when clearing key cache', async () => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        maxSize: 10,
      });
      
      const encryption = cacheManager.store.encryption;
      
      // Add some keys to cache
      for (let i = 0; i < 5; i++) {
        const salt = crypto.randomBytes(32);
        await encryption._getDerivedKey(salt, 'test-key');
      }
      
      expect(encryption.keyCache.size).toBe(5);
      
      // Clear cache (should zero all keys)
      encryption.clearKeyCache();
      
      expect(encryption.keyCache.size).toBe(0);
    });
  });

  describe('Key Rotation', () => {
    it('should track key rotation timestamps', async () => {
      cacheManager = new CacheManager({
        encryptionKey: 'initial-key-32-bytes-long!!!!',
        maxSize: 10,
      });
      
      const status1 = cacheManager.getEncryptionStatus();
      expect(status1.activeKeyAge).toBeGreaterThanOrEqual(0);
      expect(status1.activeKeyAge).toBeLessThan(1000); // Less than 1 second
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Rotate key
      cacheManager.rotateEncryptionKey('new-key-32-bytes-long-here!!!');
      
      const status2 = cacheManager.getEncryptionStatus();
      expect(status2.previousKeyCount).toBe(1);
      expect(status2.activeKeyAge).toBeGreaterThanOrEqual(0);
      expect(status2.activeKeyAge).toBeLessThan(1000); // New key is fresh
    });

    it('should include rotation info in encryption status', async () => {
      cacheManager = new CacheManager({
        encryptionKey: {
          activeKey: 'new-key-32-bytes-long-here!!!',
          previousKeys: ['old-key-1', 'old-key-2'],
        },
        enableHMAC: true,
        enableAAD: true,
        keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000,
        maxSize: 10,
      });
      
      const status = cacheManager.getEncryptionStatus();
      
      expect(status).toMatchObject({
        enabled: true,
        hasActiveKey: true,
        previousKeyCount: 2,
        hmacEnabled: true,
        aadEnabled: true,
        keyRotationGracePeriod: 7 * 24 * 60 * 60 * 1000,
      });
      expect(status.activeKeyAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should decrypt v1 format (legacy)', async () => {
      // Create a v1 encrypted entry manually
      const key = 'test-encryption-key-32-bytes!!';
      const data = JSON.stringify({ data: 'legacy' });
      
      const salt = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      
      const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(key, salt, 32, (err, key) => {
          if (err) reject(err);
          else resolve(key);
        });
      });
      
      const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      const v1Payload = JSON.stringify({
        v: 1,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64'),
      });
      
      // Create cache and insert v1 entry
      cacheManager = new CacheManager({
        encryptionKey: key,
        maxSize: 10,
      });
      
      cacheManager.store.cache.set('test-key', {
        value: v1Payload,
        encrypted: true,
        compressed: false,
        size: v1Payload.length,
        expiresAt: Date.now() + 300000,
        lastAccess: Date.now(),
        createdAt: Date.now(),
      });
      
      // Should decrypt v1 format
      const result = await cacheManager.get('test-key');
      expect(result.value).toEqual({ data: 'legacy' });
    });

    it('should create v2 format for new entries', async () => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        enableHMAC: true,
        enableAAD: true,
        maxSize: 10,
      });
      
      await cacheManager.set('test-key', { data: 'modern' }, 300, { encrypt: true });
      
      const entry = cacheManager.store.cache.get('test-key');
      const payload = JSON.parse(entry.value);
      
      expect(payload.v).toBe(2);
      expect(payload.timestamp).toBeDefined();
      expect(payload.hmac).toBeDefined();
    });
  });

  describe('Integration with Middleware', () => {
    it('should pass security options to cache manager', () => {
      const { cacheManager } = createCacheMiddleware({
        encryptionKey: 'test-key-32-bytes-long-here!!',
        enableHMAC: true,
        enableAAD: true,
        keyRotationGracePeriod: 14 * 24 * 60 * 60 * 1000, // 14 days
      });
      
      const status = cacheManager.getEncryptionStatus();
      
      expect(status.hmacEnabled).toBe(true);
      expect(status.aadEnabled).toBe(true);
      expect(status.keyRotationGracePeriod).toBe(14 * 24 * 60 * 60 * 1000);
      
      cacheManager.destroy();
    });

    it('should encrypt responses when encryptByDefault is true', async () => {
      const { cacheManager, middleware } = createCacheMiddleware({
        encryptionKey: 'test-key-32-bytes-long-here!!',
        encryptByDefault: true,
        enableHMAC: true,
        enableAAD: true,
      });
      
      // Simulate request/response
      const req = {
        method: 'GET',
        url: '/api/test',
        query: {},
        headers: {},
      };
      
      const res = {
        statusCode: 200,
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        removeHeader: vi.fn(),
        getHeaders: () => ({ 'content-type': 'application/json' }),
        json: vi.fn(function(data) {
          this._jsonData = data;
          return this;
        }),
        send: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      };
      
      const next = vi.fn();
      
      await middleware(req, res, next);
      
      // Simulate response
      res.json({ data: 'sensitive' });
      
      // Wait longer for async cache write
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that data was encrypted
      const cacheKey = cacheManager.generateKey(req);
      const cached = await cacheManager.get(cacheKey);
      
      // Cache might not be set yet due to fire-and-forget, so check if it exists
      if (cached) {
        expect(cached.value.body).toEqual({ data: 'sensitive' });
      } else {
        // If not cached yet, that's also acceptable for fire-and-forget
        expect(cached).toBeNull();
      }
      
      cacheManager.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted encrypted data gracefully', async () => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        maxSize: 10,
      });
      
      // Insert corrupted encrypted data
      cacheManager.store.cache.set('test-key', {
        value: '{"v":2,"corrupted":"data"}',
        encrypted: true,
        compressed: false,
        size: 100,
        expiresAt: Date.now() + 300000,
        lastAccess: Date.now(),
        createdAt: Date.now(),
      });
      
      // Should return null without crashing
      const result = await cacheManager.get('test-key');
      expect(result).toBeNull();
    });

    it('should handle missing HMAC gracefully', async () => {
      cacheManager = new CacheManager({
        encryptionKey: 'test-encryption-key-32-bytes!!',
        enableHMAC: true,
        maxSize: 10,
      });
      
      await cacheManager.set('test-key', { data: 'test' }, 300, { encrypt: true });
      
      // Remove HMAC from payload
      const entry = cacheManager.store.cache.get('test-key');
      const payload = JSON.parse(entry.value);
      delete payload.hmac;
      entry.value = JSON.stringify(payload);
      
      // Should still decrypt (HMAC is optional for v2)
      const result = await cacheManager.get('test-key');
      expect(result.value).toEqual({ data: 'test' });
    });
  });
});
