/**
 * Example: Secure encryption with proper GCM mode and key versioning
 * Demonstrates the fixed encryption implementation
 */

import { createEncryptionManager } from '../../../src/utils/encryption.js';

// Create encryption manager with secure configuration
const encryption = createEncryptionManager({
  enabled: process.env.ENCRYPTION_ENABLED === 'true',
  algorithm: 'aes-256-gcm', // Proper GCM mode
  keyRotation: '24h',
  distributedMode: process.env.NODE_ENV === 'production',
  keyDerivationRounds: 100000, // Strong PBKDF2
});

export async function POST(request) {
  try {
    const { data, action } = await request.json();

    if (action === 'encrypt') {
      // Encrypt sensitive data
      const encrypted = encryption.encrypt(data);
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          encrypted: encrypted.encrypted,
          keyId: encrypted.keyId,
          version: encrypted.version,
          algorithm: encrypted.algorithm,
          timestamp: new Date(encrypted.timestamp).toISOString(),
          message: 'Data encrypted with proper AES-256-GCM mode',
        },
        // Don't return IV and tag in production for security
        debug: process.env.NODE_ENV === 'development' ? {
          iv: encrypted.iv,
          tag: encrypted.tag,
          ivLength: Buffer.from(encrypted.iv, 'hex').length,
          tagLength: Buffer.from(encrypted.tag, 'hex').length,
        } : undefined,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'decrypt') {
      // Decrypt data (requires full encrypted object)
      const decrypted = encryption.decrypt(data);
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          decrypted: JSON.parse(decrypted),
          message: 'Data decrypted successfully with authentication verification',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Invalid action. Use "encrypt" or "decrypt"',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Encryption error:', error);
    
    return new Response(JSON.stringify({
      error: 'Encryption operation failed',
      message: error.message,
      type: error.message.includes('Authentication failed') ? 'TAMPER_DETECTED' : 'ENCRYPTION_ERROR',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(request) {
  // Get encryption status and key information
  const stats = encryption.getStats();
  const activeKey = encryption.getActiveKeyInfo();
  
  return new Response(JSON.stringify({
    success: true,
    data: {
      encryptionEnabled: stats.enabled,
      algorithm: stats.algorithm,
      currentVersion: stats.currentVersion,
      totalKeys: stats.totalKeys,
      distributedMode: stats.distributedMode,
      activeKey: {
        keyId: activeKey.keyId,
        version: activeKey.version,
        algorithm: activeKey.algorithm,
        created: new Date(activeKey.created).toISOString(),
      },
      keyStats: stats.keyStats,
      securityFeatures: [
        'AES-256-GCM authenticated encryption',
        'Proper createCipheriv implementation',
        'PBKDF2 key derivation',
        'Key versioning for distributed systems',
        'Automatic key rotation',
        'Tamper detection via authentication tags',
      ],
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request) {
  // Force key rotation (admin operation)
  try {
    const { action } = await request.json();
    
    if (action === 'rotate-key') {
      encryption.forceKeyRotation();
      const newKeyInfo = encryption.getActiveKeyInfo();
      
      return new Response(JSON.stringify({
        success: true,
        data: {
          message: 'Key rotation completed',
          newKey: {
            keyId: newKeyInfo.keyId,
            version: newKeyInfo.version,
            created: new Date(newKeyInfo.created).toISOString(),
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'revoke-key') {
      const { keyId } = await request.json();
      const revoked = encryption.revokeKey(keyId);
      
      return new Response(JSON.stringify({
        success: revoked,
        data: {
          message: revoked ? 'Key revoked successfully' : 'Key not found',
          keyId,
        },
      }), {
        status: revoked ? 200 : 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Invalid action. Use "rotate-key" or "revoke-key"',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Key management operation failed',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}