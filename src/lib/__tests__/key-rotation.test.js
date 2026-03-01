/**
 * Encryption Key Rotation Tests
 * Comprehensive test suite for cache encryption key rotation feature
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheManager } from '../cache.js';

describe('Key Rotation - Initialization', () => {
  it('should accept single string key', () => {
    const manager = new CacheManager({
      encryptionKey: 'simple-key-32-bytes-long-str!',
    });
    
    expect(manager.store.encryption).toBeDefined();
    expect(manager.store.encryption.activeKey).toBe('simple-key-32-bytes-long-str!');
    expect(manager.store.encryption.previousKeys).toEqual([]);
    
    manager.destroy();
  });

  it('should accept key rotation object', () => {
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v2-32-bytes-long-string!',
        previousKeys: ['key-v1-32-bytes-long-string!'],
      },
    });
    
    expect(manager.store.encryption.activeKey).toBe('key-v2-32-bytes-long-string!');
    expect(manager.store.encryption.previousKeys).toEqual(['key-v1-32-bytes-long-string!']);
    
    manager.destroy();
  });

  it('should accept multiple previous keys', () => {
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v3',
        previousKeys: ['key-v2', 'key-v1'],
      },
    });
    
    expect(manager.store.encryption.previousKeys).toHaveLength(2);
    expect(manager.store.encryption.previousKeys).toEqual(['key-v2', 'key-v1']);
    
    manager.destroy();
  });

  it('should throw error if activeKey is missing', () => {
    expect(() => {
      new CacheManager({
        encryptionKey: {
          previousKeys: ['key-v1'],
        },
      });
    }).toThrow('activeKey is required');
  });

  it('should throw error if previousKeys is not an array', () => {
    expect(() => {
      new CacheManager({
        encryptionKey: {
          activeKey: 'key-v2',
          previousKeys: 'not-an-array',
        },
      });
    }).toThrow('previousKeys must be an array');
  });

  it('should handle empty previousKeys array', () => {
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v1',
        previousKeys: [],
      },
    });
    
    expect(manager.store.encryption.previousKeys).toEqual([]);
    
    manager.destroy();
  });
});

describe('Key Rotation - Basic Encryption/Decryption', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({
      encryptionKey: 'test-key-v1-must-be-32-bytes!',
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should encrypt and decrypt with active key', async () => {
    const data = { secret: 'confidential', token: 'abc123' };
    
    await manager.set('test', data, 300, { encrypt: true });
    const result = await manager.get('test');
    
    expect(result.value).toEqual(data);
  });

  it('should store encrypted data differently than plaintext', async () => {
    const data = { secret: 'test' };
    
    await manager.set('encrypted', data, 300, { encrypt: true });
    await manager.set('plaintext', data, 300, { encrypt: false });
    
    const encryptedEntry = manager.store.cache.get('encrypted');
    const plaintextEntry = manager.store.cache.get('plaintext');
    
    expect(encryptedEntry.encrypted).toBe(true);
    expect(plaintextEntry.encrypted).toBe(false);
    expect(encryptedEntry.value).not.toEqual(plaintextEntry.value);
  });

  it('should include version marker in encrypted data', async () => {
    await manager.set('test', { data: 'test' }, 300, { encrypt: true });
    
    const entry = manager.store.cache.get('test');
    const parsed = JSON.parse(entry.value);
    
    expect(parsed.v).toBe(2); // Version 2 includes HMAC and AAD support
    expect(parsed.salt).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.authTag).toBeDefined();
    expect(parsed.data).toBeDefined();
  });
});

describe('Key Rotation - Decryption with Previous Keys', () => {
  it('should decrypt data encrypted with previous key', async () => {
    // Step 1: Encrypt with key-v1
    const manager1 = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
    });
    
    await manager1.set('secret', { password: 'admin123' }, 300, { encrypt: true });
    const encryptedValue = manager1.store.cache.get('secret').value;
    
    manager1.destroy();
    
    // Step 2: Create new manager with key-v2 and key-v1 as previous
    const manager2 = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v2-must-be-32-bytes-long!',
        previousKeys: ['key-v1-must-be-32-bytes-long!'],
      },
    });
    
    // Manually inject the encrypted value
    manager2.store.cache.set('secret', {
      value: encryptedValue,
      encrypted: true,
      compressed: false,
      expiresAt: Date.now() + 300000,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
    
    // Should decrypt successfully with previous key
    const result = await manager2.get('secret');
    expect(result.value).toEqual({ password: 'admin123' });
    
    manager2.destroy();
  });

  it('should try active key first, then previous keys', async () => {
    // Encrypt with key-v1
    const manager1 = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
    });
    await manager1.set('old', { data: 'old' }, 300, { encrypt: true });
    const oldEncrypted = manager1.store.cache.get('old').value;
    manager1.destroy();
    
    // Create manager with key-v3 (active) and key-v2, key-v1 (previous)
    const manager2 = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v3-must-be-32-bytes-long!',
        previousKeys: [
          'key-v2-must-be-32-bytes-long!',
          'key-v1-must-be-32-bytes-long!',
        ],
      },
    });
    
    // Inject old encrypted data
    manager2.store.cache.set('old', {
      value: oldEncrypted,
      encrypted: true,
      compressed: false,
      expiresAt: Date.now() + 300000,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
    
    // Should decrypt with key-v1 (last in previous keys)
    const result = await manager2.get('old');
    expect(result.value).toEqual({ data: 'old' });
    
    manager2.destroy();
  });

  it('should fail gracefully if no key can decrypt', async () => {
    // Encrypt with key-v1
    const manager1 = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
    });
    await manager1.set('test', { data: 'test' }, 300, { encrypt: true });
    const encrypted = manager1.store.cache.get('test').value;
    manager1.destroy();
    
    // Try to decrypt with wrong keys
    const manager2 = new CacheManager({
      encryptionKey: {
        activeKey: 'key-v3-must-be-32-bytes-long!',
        previousKeys: ['key-v2-must-be-32-bytes-long!'],
      },
    });
    
    manager2.store.cache.set('test', {
      value: encrypted,
      encrypted: true,
      compressed: false,
      expiresAt: Date.now() + 300000,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
    
    // Should return null and delete entry
    const retrieved = await manager2.get('test');
    expect(retrieved).toBeNull();
    expect(manager2.store.cache.has('test')).toBe(false);
    
    manager2.destroy();
  });
});

describe('Key Rotation - rotateEncryptionKey() Method', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('should rotate to new key', async () => {
    // Encrypt with key-v1
    await manager.set('test', { data: 'secret' }, 300, { encrypt: true });
    
    // Rotate to key-v2
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    
    expect(manager.store.encryption.activeKey).toBe('key-v2-must-be-32-bytes-long!');
    expect(manager.store.encryption.previousKeys).toContain('key-v1-must-be-32-bytes-long!');
  });

  it('should still decrypt old data after rotation', async () => {
    const data = { secret: 'confidential' };
    
    // Encrypt with key-v1
    await manager.set('test', data, 300, { encrypt: true });
    
    // Rotate to key-v2
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    
    // Should still decrypt data encrypted with key-v1
    const result = await manager.get('test');
    expect(result.value).toEqual(data);
  });

  it('should encrypt new data with new active key', async () => {
    // Rotate to key-v2
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    
    // Encrypt new data
    await manager.set('new', { data: 'new' }, 300, { encrypt: true });
    
    // Should be decryptable
    const result = await manager.get('new');
    expect(result.value).toEqual({ data: 'new' });
  });

  it('should move current active key to previous keys', () => {
    const originalKey = manager.store.encryption.activeKey;
    
    manager.rotateEncryptionKey('new-key-32-bytes-long-string!');
    
    expect(manager.store.encryption.previousKeys[0]).toBe(originalKey);
  });

  it('should prepend to previous keys (newest first)', () => {
    manager.rotateEncryptionKey('key-v2');
    manager.rotateEncryptionKey('key-v3');
    
    expect(manager.store.encryption.previousKeys[0]).toBe('key-v2');
    expect(manager.store.encryption.previousKeys[1]).toBe('key-v1-must-be-32-bytes-long!');
  });

  it('should limit previous keys to 3', () => {
    manager.rotateEncryptionKey('key-v2');
    manager.rotateEncryptionKey('key-v3');
    manager.rotateEncryptionKey('key-v4');
    manager.rotateEncryptionKey('key-v5');
    
    expect(manager.store.encryption.previousKeys).toHaveLength(3);
    expect(manager.store.encryption.previousKeys).toEqual(['key-v4', 'key-v3', 'key-v2']);
  });

  it('should clear key derivation cache on rotation', async () => {
    // Populate key cache
    await manager.set('test', { data: 'test' }, 300, { encrypt: true });
    
    const cacheSizeBefore = manager.store.encryption.keyCache.size;
    expect(cacheSizeBefore).toBeGreaterThan(0);
    
    // Rotate
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    
    // Cache should be cleared
    expect(manager.store.encryption.keyCache.size).toBe(0);
  });

  it('should throw error if new key is not a string', () => {
    expect(() => {
      manager.rotateEncryptionKey(null);
    }).toThrow('New encryption key must be a non-empty string');
    
    expect(() => {
      manager.rotateEncryptionKey(123);
    }).toThrow('New encryption key must be a non-empty string');
    
    expect(() => {
      manager.rotateEncryptionKey({ key: 'test' });
    }).toThrow('New encryption key must be a non-empty string');
  });

  it('should throw error if new key is empty string', () => {
    expect(() => {
      manager.rotateEncryptionKey('');
    }).toThrow('New encryption key must be a non-empty string');
  });
});

describe('Key Rotation - CacheManager API', () => {
  it('should expose rotateEncryptionKey on CacheManager', () => {
    const manager = new CacheManager({
      encryptionKey: 'test-key',
    });
    
    expect(typeof manager.rotateEncryptionKey).toBe('function');
    
    manager.destroy();
  });

  it('should throw error when rotating on non-encrypted cache', () => {
    const manager = new CacheManager();
    
    expect(() => {
      manager.rotateEncryptionKey('new-key');
    }).toThrow('Encryption is not enabled');
    
    manager.destroy();
  });

  it('should throw error when rotating on disabled cache', () => {
    const manager = new CacheManager({ enabled: false });
    
    expect(() => {
      manager.rotateEncryptionKey('new-key');
    }).toThrow('Cache is not enabled');
  });
});

describe('Key Rotation - getEncryptionStatus()', () => {
  it('should return status for encrypted cache', () => {
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
    expect(status.cacheSize).toBe(0);
    
    manager.destroy();
  });

  it('should return disabled status for non-encrypted cache', () => {
    const manager = new CacheManager();
    
    const status = manager.getEncryptionStatus();
    
    expect(status.enabled).toBe(false);
    expect(status.hasActiveKey).toBeUndefined();
    
    manager.destroy();
  });

  it('should update status after rotation', () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1',
    });
    
    let status = manager.getEncryptionStatus();
    expect(status.previousKeyCount).toBe(0);
    
    manager.rotateEncryptionKey('key-v2');
    
    status = manager.getEncryptionStatus();
    expect(status.previousKeyCount).toBe(1);
    
    manager.destroy();
  });

  it('should reflect key cache size', async () => {
    const manager = new CacheManager({
      encryptionKey: 'test-key-32-bytes-long-string!',
    });
    
    // Populate key cache
    await manager.set('test1', { data: 'test1' }, 300, { encrypt: true });
    await manager.set('test2', { data: 'test2' }, 300, { encrypt: true });
    
    const status = manager.getEncryptionStatus();
    expect(status.cacheSize).toBeGreaterThan(0);
    
    manager.destroy();
  });
});

describe('Key Rotation - Multiple Rotations', () => {
  it('should handle multiple sequential rotations', async () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
    });
    
    // Encrypt with v1
    await manager.set('data-v1', { version: 1 }, 300, { encrypt: true });
    
    // Rotate to v2
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    await manager.set('data-v2', { version: 2 }, 300, { encrypt: true });
    
    // Rotate to v3
    manager.rotateEncryptionKey('key-v3-must-be-32-bytes-long!');
    await manager.set('data-v3', { version: 3 }, 300, { encrypt: true });
    
    // All should be readable
    expect((await manager.get('data-v1')).value).toEqual({ version: 1 });
    expect((await manager.get('data-v2')).value).toEqual({ version: 2 });
    expect((await manager.get('data-v3')).value).toEqual({ version: 3 });
    
    manager.destroy();
  });

  it('should drop oldest key after 4 rotations', () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1',
    });
    
    manager.rotateEncryptionKey('key-v2');
    manager.rotateEncryptionKey('key-v3');
    manager.rotateEncryptionKey('key-v4');
    manager.rotateEncryptionKey('key-v5');
    
    // Should keep only last 3 previous keys
    expect(manager.store.encryption.previousKeys).toEqual(['key-v4', 'key-v3', 'key-v2']);
    expect(manager.store.encryption.previousKeys).not.toContain('key-v1');
    
    manager.destroy();
  });

  it('should not decrypt data encrypted with dropped key', async () => {
    const manager1 = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
    });
    
    await manager1.set('old', { data: 'very-old' }, 300, { encrypt: true });
    const veryOldEncrypted = manager1.store.cache.get('old').value;
    manager1.destroy();
    
    // Rotate 4 times (key-v1 will be dropped)
    const manager2 = new CacheManager({
      encryptionKey: 'key-v2-must-be-32-bytes-long!',
    });
    manager2.rotateEncryptionKey('key-v3-must-be-32-bytes-long!');
    manager2.rotateEncryptionKey('key-v4-must-be-32-bytes-long!');
    manager2.rotateEncryptionKey('key-v5-must-be-32-bytes-long!');
    
    // Inject very old data
    manager2.store.cache.set('old', {
      value: veryOldEncrypted,
      encrypted: true,
      compressed: false,
      expiresAt: Date.now() + 300000,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
    
    // Should fail to decrypt (key-v1 was dropped)
    const retrieved = await manager2.get('old');
    expect(retrieved).toBeNull();
    
    manager2.destroy();
  });
});

describe('Key Rotation - Compression + Encryption', () => {
  it('should work with both compression and encryption', async () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
      compressionThreshold: 50,
      compressionAlgorithm: 'gzip',
    });
    
    const largeData = { data: 'x'.repeat(100) };
    
    await manager.set('test', largeData, 300, { encrypt: true });
    
    const entry = manager.store.cache.get('test');
    expect(entry.compressed).toBe(true);
    expect(entry.encrypted).toBe(true);
    
    const result = await manager.get('test');
    expect(result.value).toEqual(largeData);
    
    manager.destroy();
  });

  it('should decrypt compressed data after key rotation', async () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
      compressionThreshold: 50,
    });
    
    const largeData = { data: 'y'.repeat(100) };
    await manager.set('test', largeData, 300, { encrypt: true });
    
    // Rotate key
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    
    // Should still decrypt and decompress
    const result = await manager.get('test');
    expect(result.value).toEqual(largeData);
    
    manager.destroy();
  });

  it('should work with zstd compression', async () => {
    const manager = new CacheManager({
      encryptionKey: 'key-v1-must-be-32-bytes-long!',
      compressionThreshold: 50,
      compressionAlgorithm: 'zstd',
      zstdLevel: 3,
    });
    
    const largeData = { data: 'z'.repeat(100) };
    await manager.set('test', largeData, 300, { encrypt: true });
    
    manager.rotateEncryptionKey('key-v2-must-be-32-bytes-long!');
    
    const result = await manager.get('test');
    expect(result.value).toEqual(largeData);
    
    manager.destroy();
  });
});

describe('Key Rotation - Real-world Scenarios', () => {
  it('should simulate monthly key rotation', async () => {
    const manager = new CacheManager({
      encryptionKey: 'january-key-32-bytes-long!!!',
    });
    
    // January: cache some data
    await manager.set('user:1', { name: 'Alice' }, 300, { encrypt: true });
    
    // February: rotate key
    manager.rotateEncryptionKey('february-key-32-bytes-long!!');
    await manager.set('user:2', { name: 'Bob' }, 300, { encrypt: true });
    
    // March: rotate again
    manager.rotateEncryptionKey('march-key-32-bytes-long!!!!!');
    await manager.set('user:3', { name: 'Charlie' }, 300, { encrypt: true });
    
    // All data should be accessible
    expect((await manager.get('user:1')).value).toEqual({ name: 'Alice' });
    expect((await manager.get('user:2')).value).toEqual({ name: 'Bob' });
    expect((await manager.get('user:3')).value).toEqual({ name: 'Charlie' });
    
    manager.destroy();
  });

  it('should handle gradual cache refresh after rotation', async () => {
    const manager = new CacheManager({
      encryptionKey: 'old-key-32-bytes-long-string!',
    });
    
    // Cache data with old key
    await manager.set('config', { version: 1 }, 300, { encrypt: true });
    
    // Rotate to new key
    manager.rotateEncryptionKey('new-key-32-bytes-long-string!');
    
    // Old data still readable
    expect((await manager.get('config')).value).toEqual({ version: 1 });
    
    // Update with new data (uses new key)
    await manager.set('config', { version: 2 }, 300, { encrypt: true });
    
    // New data readable
    expect((await manager.get('config')).value).toEqual({ version: 2 });
    
    manager.destroy();
  });

  it('should support environment-based key configuration', () => {
    // Simulate loading from environment variables
    const envKeys = {
      active: process.env.CACHE_KEY_ACTIVE || 'key-v3-32-bytes-long-string!',
      previous: [
        process.env.CACHE_KEY_PREV_1 || 'key-v2-32-bytes-long-string!',
        process.env.CACHE_KEY_PREV_2 || 'key-v1-32-bytes-long-string!',
      ].filter(Boolean),
    };
    
    const manager = new CacheManager({
      encryptionKey: {
        activeKey: envKeys.active,
        previousKeys: envKeys.previous,
      },
    });
    
    expect(manager.store.encryption.activeKey).toBe(envKeys.active);
    expect(manager.store.encryption.previousKeys).toEqual(envKeys.previous);
    
    manager.destroy();
  });
});
