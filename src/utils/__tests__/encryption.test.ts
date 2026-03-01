/**
 * Comprehensive tests for the fixed encryption implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'crypto';
import { EncryptionManager, createEncryptionManager } from '../encryption';

describe('Fixed Encryption Implementation', () => {
  let encryptionManager: EncryptionManager;

  beforeEach(() => {
    // Use a test secret key
    process.env.ENCRYPTION_SECRET_KEY = 'test-secret-key-for-encryption-testing-12345';
    process.env.ENCRYPTION_ENABLED = 'true';
    
    encryptionManager = createEncryptionManager({
      enabled: true,
      algorithm: 'aes-256-gcm',
      keyRotation: '1h',
      distributedMode: false,
    });
  });

  afterEach(() => {
    encryptionManager?.cleanup();
    delete process.env.ENCRYPTION_SECRET_KEY;
    delete process.env.ENCRYPTION_ENABLED;
  });

  describe('Proper GCM Implementation', () => {
    it('should use createCipheriv instead of deprecated createCipher', () => {
      const testData = { message: 'test data', timestamp: Date.now() };
      
      // This should not throw and should use proper GCM mode
      const encrypted = encryptionManager.encrypt(testData);
      
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('keyId');
      expect(encrypted).toHaveProperty('version');
      expect(encrypted).toHaveProperty('algorithm');
      
      // IV should be 12 bytes (96 bits) for GCM
      expect(Buffer.from(encrypted.iv, 'hex')).toHaveLength(12);
      
      // Tag should be 16 bytes (128 bits) for GCM
      expect(Buffer.from(encrypted.tag, 'hex')).toHaveLength(16);
    });

    it('should successfully decrypt data encrypted with proper GCM', () => {
      const originalData = { 
        message: 'sensitive data', 
        userId: 12345,
        permissions: ['read', 'write']
      };
      
      const encrypted = encryptionManager.encrypt(originalData);
      const decrypted = encryptionManager.decrypt(encrypted);
      const parsedData = JSON.parse(decrypted);
      
      expect(parsedData).toEqual(originalData);
    });

    it('should detect tampering with authentication tag', () => {
      const testData = { message: 'important data' };
      const encrypted = encryptionManager.encrypt(testData);
      
      // Tamper with the authentication tag
      const tamperedTag = Buffer.from(encrypted.tag, 'hex');
      if (tamperedTag.length > 0) {
        tamperedTag[0] = tamperedTag[0]! ^ 0xFF; // Flip bits
        encrypted.tag = tamperedTag.toString('hex');
      }
      
      expect(() => {
        encryptionManager.decrypt(encrypted);
      }).toThrow(/Authentication failed/);
    });

    it('should detect tampering with encrypted data', () => {
      const testData = { message: 'important data' };
      const encrypted = encryptionManager.encrypt(testData);
      
      // Tamper with the encrypted data
      const tamperedData = Buffer.from(encrypted.encrypted, 'hex');
      if (tamperedData.length > 0) {
        tamperedData[0] = tamperedData[0]! ^ 0xFF; // Flip bits
        encrypted.encrypted = tamperedData.toString('hex');
      }
      
      expect(() => {
        encryptionManager.decrypt(encrypted);
      }).toThrow(/Authentication failed/);
    });

    it('should use different IVs for each encryption', () => {
      const testData = { message: 'same data' };
      
      const encrypted1 = encryptionManager.encrypt(testData);
      const encrypted2 = encryptionManager.encrypt(testData);
      
      // IVs should be different
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      
      // But both should decrypt to the same data
      expect(encryptionManager.decrypt(encrypted1)).toBe(encryptionManager.decrypt(encrypted2));
    });
  });

  describe('Key Versioning for Distributed Systems', () => {
    it('should include version information in encrypted data', () => {
      const testData = { message: 'versioned data' };
      const encrypted = encryptionManager.encrypt(testData);
      
      expect(encrypted.version).toBe(1);
      expect(encrypted.keyId).toMatch(/^key_1_/);
    });

    it('should increment version on key rotation', () => {
      const initialStats = encryptionManager.getStats();
      expect(initialStats.currentVersion).toBe(1);
      
      // Force key rotation
      encryptionManager.forceKeyRotation();
      
      const newStats = encryptionManager.getStats();
      expect(newStats.currentVersion).toBe(2);
      expect(newStats.currentKeyId).toMatch(/^key_2_/);
    });

    it('should maintain multiple key versions for decryption', () => {
      const testData = { message: 'multi-version test' };
      
      // Encrypt with version 1
      const encrypted1 = encryptionManager.encrypt(testData);
      expect(encrypted1.version).toBe(1);
      
      // Rotate to version 2
      encryptionManager.forceKeyRotation();
      
      // Encrypt with version 2
      const encrypted2 = encryptionManager.encrypt(testData);
      expect(encrypted2.version).toBe(2);
      
      // Should be able to decrypt both versions
      const decrypted1 = encryptionManager.decrypt(encrypted1);
      const decrypted2 = encryptionManager.decrypt(encrypted2);
      
      expect(JSON.parse(decrypted1)).toEqual(testData);
      expect(JSON.parse(decrypted2)).toEqual(testData);
    });

    it('should track key metadata properly', () => {
      const metadata = encryptionManager.getKeyMetadata();
      
      expect(metadata).toHaveLength(1);
      if (metadata.length > 0) {
        expect(metadata[0]).toHaveProperty('id');
        expect(metadata[0]).toHaveProperty('version');
        expect(metadata[0]).toHaveProperty('created');
        expect(metadata[0]).toHaveProperty('expires');
        expect(metadata[0]).toHaveProperty('algorithm');
        expect(metadata[0]).toHaveProperty('status');
        expect(metadata[0]!.status).toBe('active');
      }
    });

    it('should handle key cleanup in distributed mode', () => {
      const distributedManager = createEncryptionManager({
        enabled: true,
        distributedMode: true,
        keyRotation: '1h',
      });

      // Rotate keys multiple times
      for (let i = 0; i < 5; i++) {
        distributedManager.forceKeyRotation();
      }

      const stats = distributedManager.getStats();
      
      // Should keep more keys in distributed mode
      expect(stats.totalKeys).toBeGreaterThan(3);
      expect(stats.totalKeys).toBeLessThanOrEqual(10);
      
      distributedManager.cleanup();
    });

    it('should revoke keys properly', () => {
      const testData = { message: 'revocation test' };
      const encrypted = encryptionManager.encrypt(testData);
      
      // Should decrypt successfully initially
      expect(() => encryptionManager.decrypt(encrypted)).not.toThrow();
      
      // Revoke the key
      const revoked = encryptionManager.revokeKey(encrypted.keyId);
      expect(revoked).toBe(true);
      
      // Should fail to decrypt after revocation
      expect(() => encryptionManager.decrypt(encrypted)).toThrow(/not found or expired/);
    });
  });

  describe('Algorithm Support', () => {
    it('should support AES-256-GCM', () => {
      const manager = createEncryptionManager({
        enabled: true,
        algorithm: 'aes-256-gcm',
      });
      
      const testData = { algorithm: 'aes-256-gcm' };
      const encrypted = manager.encrypt(testData);
      const decrypted = manager.decrypt(encrypted);
      
      expect(JSON.parse(decrypted)).toEqual(testData);
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      
      manager.cleanup();
    });

    it('should support AES-192-GCM', () => {
      const manager = createEncryptionManager({
        enabled: true,
        algorithm: 'aes-192-gcm',
      });
      
      const testData = { algorithm: 'aes-192-gcm' };
      const encrypted = manager.encrypt(testData);
      const decrypted = manager.decrypt(encrypted);
      
      expect(JSON.parse(decrypted)).toEqual(testData);
      expect(encrypted.algorithm).toBe('aes-192-gcm');
      
      manager.cleanup();
    });

    it('should support ChaCha20-Poly1305', () => {
      const manager = createEncryptionManager({
        enabled: true,
        algorithm: 'chacha20-poly1305',
      });
      
      const testData = { algorithm: 'chacha20-poly1305' };
      const encrypted = manager.encrypt(testData);
      const decrypted = manager.decrypt(encrypted);
      
      expect(JSON.parse(decrypted)).toEqual(testData);
      expect(encrypted.algorithm).toBe('chacha20-poly1305');
      
      manager.cleanup();
    });

    it('should reject unsupported algorithms', () => {
      expect(() => {
        createEncryptionManager({
          enabled: true,
          algorithm: 'aes-256-cbc', // Not supported
        });
      }).toThrow(/Unsupported encryption algorithm/);
    });
  });

  describe('Key Derivation', () => {
    it('should derive keys consistently from secret', () => {
      const secret = 'consistent-secret-key';
      
      const manager1 = createEncryptionManager({
        enabled: true,
        secretKey: secret,
      });
      
      const manager2 = createEncryptionManager({
        enabled: true,
        secretKey: secret,
      });
      
      const testData = { message: 'consistency test' };
      
      // Encrypt with manager1
      const encrypted = manager1.encrypt(testData);
      
      // Should be able to decrypt with manager2 (same secret)
      const decrypted = manager2.decrypt(encrypted);
      expect(JSON.parse(decrypted)).toEqual(testData);
      
      manager1.cleanup();
      manager2.cleanup();
    });

    it('should use PBKDF2 for key derivation', () => {
      const spy = vi.spyOn(crypto, 'pbkdf2Sync');
      
      createEncryptionManager({
        enabled: true,
        secretKey: 'test-secret',
        keyDerivationRounds: 50000,
      });
      
      expect(spy).toHaveBeenCalledWith(
        'test-secret',
        expect.any(Buffer), // salt
        50000, // rounds
        32, // key length for AES-256
        'sha256'
      );
      
      spy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing keys gracefully', () => {
      const testData = { message: 'missing key test' };
      const encrypted = encryptionManager.encrypt(testData);
      
      // Manually remove the key
      encryptionManager.revokeKey(encrypted.keyId);
      
      expect(() => {
        encryptionManager.decrypt(encrypted);
      }).toThrow(/not found or expired/);
    });

    it('should handle malformed encrypted data', () => {
      const malformedData = {
        encrypted: 'invalid-hex',
        iv: 'invalid-hex',
        tag: 'invalid-hex',
        timestamp: Date.now(),
        keyId: 'fake-key',
        version: 1,
        algorithm: 'aes-256-gcm',
      };
      
      expect(() => {
        encryptionManager.decrypt(malformedData);
      }).toThrow();
    });

    it('should validate encryption is enabled', () => {
      const disabledManager = createEncryptionManager({
        enabled: false,
      });
      
      expect(() => {
        disabledManager.encrypt({ message: 'test' });
      }).toThrow(/Encryption is not enabled/);
      
      expect(() => {
        disabledManager.decrypt({
          encrypted: 'test',
          iv: 'test',
          tag: 'test',
          timestamp: Date.now(),
          keyId: 'test',
          version: 1,
          algorithm: 'aes-256-gcm',
        });
      }).toThrow(/Encryption is not enabled/);
    });
  });

  describe('Performance', () => {
    it('should encrypt/decrypt large data efficiently', () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `item-${i}`.repeat(100), // ~600KB total
        }))
      };
      
      const start = performance.now();
      const encrypted = encryptionManager.encrypt(largeData);
      const decrypted = encryptionManager.decrypt(encrypted);
      const duration = performance.now() - start;
      
      expect(JSON.parse(decrypted)).toEqual(largeData);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle many encryption operations efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        const data = { iteration: i, timestamp: Date.now() };
        const encrypted = encryptionManager.encrypt(data);
        const decrypted = encryptionManager.decrypt(encrypted);
        expect(JSON.parse(decrypted)).toEqual(data);
      }
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000); // 100 operations in under 1 second
    });
  });
});