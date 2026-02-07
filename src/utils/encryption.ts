// Request/Response encryption utilities
import * as crypto from 'crypto';

// Extended interfaces for GCM-specific methods
interface GCMCipher extends crypto.Cipher {
  setAAD(buffer: Buffer): this;
  getAuthTag(): Buffer;
}

interface GCMDecipher extends crypto.Decipher {
  setAAD(buffer: Buffer): this;
  setAuthTag(buffer: Buffer): this;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: string;
  keyRotation: string;
  secretKey?: string;
  ivLength: number;
  tagLength: number;
  keyDerivationRounds: number;
  distributedMode: boolean;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  timestamp: number;
  keyId: string;
  version: number;
  algorithm: string;
}

export interface KeyMetadata {
  id: string;
  version: number;
  created: number;
  expires: number;
  algorithm: string;
  status: 'active' | 'rotating' | 'deprecated' | 'revoked';
}

export class EncryptionManager {
  private config: EncryptionConfig;
  private keys: Map<string, Buffer> = new Map();
  private keyMetadata: Map<string, KeyMetadata> = new Map();
  private currentKeyId: string;
  private keyVersion: number = 1;
  private rotationTimer?: NodeJS.Timeout;

  constructor(config: EncryptionConfig) {
    this.config = {
      enabled: config.enabled,
      algorithm: config.algorithm || 'aes-256-gcm',
      keyRotation: config.keyRotation || '24h',
      ivLength: config.ivLength || 12, // 96 bits for GCM
      tagLength: config.tagLength || 16, // 128 bits for GCM
      keyDerivationRounds: config.keyDerivationRounds || 100000,
      distributedMode: config.distributedMode || false,
      secretKey: config.secretKey,
    };

    // Validate algorithm
    if (!this.isValidAlgorithm(this.config.algorithm)) {
      throw new Error(`Unsupported encryption algorithm: ${this.config.algorithm}`);
    }

    this.currentKeyId = this.generateKeyId();
    this.initializeKeys();
    this.setupKeyRotation();
  }

  /**
   * Check if algorithm supports authenticated encryption
   */
  private isAuthenticatedMode(algorithm: string): boolean {
    return algorithm.includes('gcm') || algorithm.includes('poly1305');
  }

  /**
   * Validate encryption algorithm
   */
  private isValidAlgorithm(algorithm: string): boolean {
    const supportedAlgorithms = [
      'aes-256-gcm',
      'aes-192-gcm', 
      'aes-128-gcm',
      'chacha20-poly1305'
    ];
    return supportedAlgorithms.includes(algorithm);
  }

  /**
   * Initialize encryption keys
   */
  private initializeKeys(): void {
    if (this.config.secretKey) {
      // Derive key from secret using PBKDF2
      const salt = crypto.createHash('sha256').update(this.currentKeyId).digest();
      const derivedKey = crypto.pbkdf2Sync(
        this.config.secretKey,
        salt,
        this.config.keyDerivationRounds,
        this.getKeyLength(),
        'sha256'
      );
      this.keys.set(this.currentKeyId, derivedKey);
    } else {
      // Generate random key
      const key = crypto.randomBytes(this.getKeyLength());
      this.keys.set(this.currentKeyId, key);
    }

    // Create key metadata
    const now = Date.now();
    const rotationMs = this.parseTimeString(this.config.keyRotation);
    
    this.keyMetadata.set(this.currentKeyId, {
      id: this.currentKeyId,
      version: this.keyVersion,
      created: now,
      expires: now + rotationMs,
      algorithm: this.config.algorithm,
      status: 'active',
    });
  }

  /**
   * Get key length based on algorithm
   */
  private getKeyLength(): number {
    switch (this.config.algorithm) {
      case 'aes-256-gcm':
        return 32; // 256 bits
      case 'aes-192-gcm':
        return 24; // 192 bits
      case 'aes-128-gcm':
        return 16; // 128 bits
      case 'chacha20-poly1305':
        return 32; // 256 bits
      default:
        return 32;
    }
  }

  /**
   * Setup automatic key rotation
   */
  private setupKeyRotation(): void {
    if (this.config.keyRotation && !this.config.distributedMode) {
      const rotationMs = this.parseTimeString(this.config.keyRotation);
      
      this.rotationTimer = setInterval(() => {
        this.rotateKeys();
      }, rotationMs);
    }
  }

  /**
   * Encrypt data using proper GCM mode with createCipheriv
   */
  encrypt(data: string | object): EncryptedData {
    if (!this.config.enabled) {
      throw new Error('Encryption is not enabled');
    }

    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const key = this.keys.get(this.currentKeyId);
    
    if (!key) {
      throw new Error('No encryption key available');
    }

    // Generate random IV for GCM (96 bits recommended)
    const iv = crypto.randomBytes(this.config.ivLength);
    
    // Create cipher with proper createCipheriv and IV
    const cipher = crypto.createCipheriv(this.config.algorithm, key, iv) as GCMCipher;
    
    // Set additional authenticated data (AAD) for GCM
    const aad = Buffer.from(JSON.stringify({
      keyId: this.currentKeyId,
      version: this.keyVersion,
      timestamp: Date.now()
    }));
    
    // Set AAD for authenticated encryption modes
    if (this.isAuthenticatedMode(this.config.algorithm)) {
      cipher.setAAD(aad);
    }
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag for GCM (must be called after final())
    let tag: Buffer;
    if (this.isAuthenticatedMode(this.config.algorithm)) {
      tag = cipher.getAuthTag();
    } else {
      // Fallback for non-authenticated modes (though we only support authenticated modes)
      tag = Buffer.alloc(0);
    }

    const result: EncryptedData = {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      timestamp: Date.now(),
      keyId: this.currentKeyId,
      version: this.keyVersion,
      algorithm: this.config.algorithm,
    };

    return result;
  }

  /**
   * Decrypt data using proper GCM mode with createDecipheriv
   */
  decrypt(encryptedData: EncryptedData): string {
    if (!this.config.enabled) {
      throw new Error('Encryption is not enabled');
    }

    const key = this.keys.get(encryptedData.keyId);
    if (!key) {
      throw new Error(`Encryption key ${encryptedData.keyId} not found or expired`);
    }

    // Validate algorithm compatibility
    if (encryptedData.algorithm && encryptedData.algorithm !== this.config.algorithm) {
      console.warn(`Algorithm mismatch: expected ${this.config.algorithm}, got ${encryptedData.algorithm}`);
    }

    try {
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      // Create decipher with proper createDecipheriv and IV
      const decipher = crypto.createDecipheriv(
        encryptedData.algorithm || this.config.algorithm, 
        key, 
        iv
      ) as GCMDecipher;
      
      // Set additional authenticated data (must match encryption AAD)
      const aad = Buffer.from(JSON.stringify({
        keyId: encryptedData.keyId,
        version: encryptedData.version || 1,
        timestamp: encryptedData.timestamp
      }));
      
      // Set AAD and auth tag for authenticated encryption modes
      const algorithm = encryptedData.algorithm || this.config.algorithm;
      if (this.isAuthenticatedMode(algorithm)) {
        decipher.setAAD(aad);
        // Set authentication tag for verification (must be called before update/final)
        decipher.setAuthTag(tag);
      }
      
      // Decrypt the data
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      if (error.message.includes('bad decrypt') || 
          error.message.includes('auth') || 
          error.message.includes('tag')) {
        throw new Error('Authentication failed: Data may have been tampered with or key is incorrect');
      }
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt API request body
   */
  encryptRequest(body: any): string {
    const encrypted = this.encrypt(body);
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypt API request body
   */
  decryptRequest(encryptedBody: string): any {
    const encryptedData: EncryptedData = JSON.parse(encryptedBody);
    const decrypted = this.decrypt(encryptedData);
    
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  /**
   * Encrypt API response
   */
  encryptResponse(response: any): Response {
    const encrypted = this.encrypt(response);
    
    return new Response(JSON.stringify(encrypted), {
      headers: {
        'Content-Type': 'application/json',
        'X-Encrypted': 'true',
        'X-Encryption-Algorithm': this.config.algorithm,
        'X-Key-Id': this.currentKeyId,
      },
    });
  }

  /**
   * Check if request is encrypted
   */
  isEncryptedRequest(request: Request): boolean {
    return request.headers.get('X-Encrypted') === 'true';
  }

  /**
   * Middleware to handle encrypted requests/responses
   */
  middleware() {
    return async (request: Request, handler: Function): Promise<Response> => {
      let processedRequest = request;

      // Decrypt request if encrypted
      if (this.isEncryptedRequest(request)) {
        try {
          const encryptedBody = await request.text();
          const decryptedBody = this.decryptRequest(encryptedBody);
          
          // Create new request with decrypted body
          processedRequest = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(decryptedBody),
          });
        } catch (error: any) {
          return new Response(JSON.stringify({
            error: 'Failed to decrypt request',
            message: error.message,
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Call the handler
      const response = await handler(processedRequest);

      // Encrypt response if client supports it
      const acceptsEncryption = request.headers.get('Accept-Encryption') === 'true';
      
      if (acceptsEncryption && response.headers.get('Content-Type')?.includes('application/json')) {
        try {
          const responseData = await response.json();
          return this.encryptResponse(responseData);
        } catch (error) {
          console.error('Failed to encrypt response:', error);
          return response; // Return original response if encryption fails
        }
      }

      return response;
    };
  }

  /**
   * Generate new encryption key
   */
  private generateKey(): Buffer {
    return crypto.randomBytes(this.getKeyLength());
  }

  /**
   * Generate cryptographically secure key ID
   */
  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    const version = this.keyVersion.toString(36);
    return `key_${version}_${timestamp}_${random}`;
  }

  /**
   * Rotate encryption keys with proper versioning for distributed systems
   */
  private rotateKeys(): void {
    const now = Date.now();
    
    // Mark current key as rotating
    const currentMetadata = this.keyMetadata.get(this.currentKeyId);
    if (currentMetadata) {
      currentMetadata.status = 'rotating';
      this.keyMetadata.set(this.currentKeyId, currentMetadata);
    }

    // Generate new key with incremented version
    this.keyVersion++;
    const newKeyId = this.generateKeyId();
    
    let newKey: Buffer;
    if (this.config.secretKey) {
      // Derive new key with version-specific salt
      const salt = crypto.createHash('sha256')
        .update(newKeyId)
        .update(this.keyVersion.toString())
        .digest();
      
      newKey = crypto.pbkdf2Sync(
        this.config.secretKey,
        salt,
        this.config.keyDerivationRounds,
        this.getKeyLength(),
        'sha256'
      );
    } else {
      newKey = crypto.randomBytes(this.getKeyLength());
    }

    this.keys.set(newKeyId, newKey);
    
    // Create metadata for new key
    const rotationMs = this.parseTimeString(this.config.keyRotation);
    this.keyMetadata.set(newKeyId, {
      id: newKeyId,
      version: this.keyVersion,
      created: now,
      expires: now + rotationMs,
      algorithm: this.config.algorithm,
      status: 'active',
    });

    // Update current key ID
    const previousKeyId = this.currentKeyId;
    this.currentKeyId = newKeyId;

    // In distributed mode, keep more keys for longer
    const maxKeys = this.config.distributedMode ? 10 : 3;
    const gracePeriod = this.config.distributedMode ? rotationMs * 2 : rotationMs;

    // Clean up old keys based on age and count
    this.cleanupOldKeys(maxKeys, gracePeriod);

    console.log(`🔑 Key rotated: ${previousKeyId} -> ${newKeyId} (version ${this.keyVersion})`);
    
    // Emit key rotation event for distributed systems
    if (this.config.distributedMode) {
      this.emitKeyRotationEvent(newKeyId, previousKeyId);
    }
  }

  /**
   * Clean up old keys with proper grace period for distributed systems
   */
  private cleanupOldKeys(maxKeys: number, gracePeriod: number): void {
    const now = Date.now();
    const keyEntries = Array.from(this.keyMetadata.entries());
    
    // Sort by creation time (oldest first)
    keyEntries.sort((a, b) => a[1].created - b[1].created);

    // Mark keys for deprecation/revocation
    for (const [keyId, metadata] of keyEntries) {
      if (keyId === this.currentKeyId) continue; // Never remove current key
      
      const age = now - metadata.created;
      
      if (age > gracePeriod * 2) {
        // Revoke very old keys
        metadata.status = 'revoked';
        this.keys.delete(keyId);
        this.keyMetadata.delete(keyId);
      } else if (age > gracePeriod) {
        // Deprecate old keys (keep for decryption only)
        metadata.status = 'deprecated';
      }
    }

    // If we still have too many keys, remove the oldest deprecated ones
    const remainingKeys = Array.from(this.keyMetadata.entries())
      .filter(([keyId]) => keyId !== this.currentKeyId);
    
    if (remainingKeys.length > maxKeys - 1) {
      const toRemove = remainingKeys
        .filter(([, metadata]) => metadata.status === 'deprecated')
        .sort((a, b) => a[1].created - b[1].created)
        .slice(0, remainingKeys.length - maxKeys + 1);

      for (const [keyId] of toRemove) {
        this.keys.delete(keyId);
        this.keyMetadata.delete(keyId);
        console.log(`🗑️  Removed old encryption key: ${keyId}`);
      }
    }
  }

  /**
   * Emit key rotation event for distributed systems
   */
  private emitKeyRotationEvent(newKeyId: string, previousKeyId: string): void {
    // In a real distributed system, this would publish to a message queue
    // or notify other instances via Redis, etc.
    const event = {
      type: 'key-rotation',
      newKeyId,
      previousKeyId,
      version: this.keyVersion,
      timestamp: Date.now(),
      instanceId: process.env.INSTANCE_ID || 'unknown',
    };
    
    // For now, just log the event
    console.log('🔄 Key rotation event:', event);
    
    // In production, you might do:
    // await this.messageQueue.publish('encryption.key-rotation', event);
    // await this.redis.publish('encryption:key-rotation', JSON.stringify(event));
  }

  /**
   * Handle key rotation event from other instances (for distributed systems)
   */
  async handleKeyRotationEvent(event: any): Promise<void> {
    if (!this.config.distributedMode) return;
    
    const { newKeyId, version, timestamp } = event;
    
    // Only process events from other instances
    if (event.instanceId === (process.env.INSTANCE_ID || 'unknown')) {
      return;
    }

    // Validate event is newer than our current version
    if (version <= this.keyVersion) {
      console.warn(`Ignoring old key rotation event: ${version} <= ${this.keyVersion}`);
      return;
    }

    console.log(`📡 Received key rotation event from distributed system: ${newKeyId}`);
    
    // In a real implementation, you would:
    // 1. Fetch the new key from a secure key management service
    // 2. Validate the key rotation is authorized
    // 3. Update local key store
    
    // For now, we'll just update our version tracking
    this.keyVersion = Math.max(this.keyVersion, version);
  }

  /**
   * Get key metadata for monitoring and debugging
   */
  getKeyMetadata(): KeyMetadata[] {
    return Array.from(this.keyMetadata.values())
      .sort((a, b) => b.created - a.created); // Newest first
  }

  /**
   * Get active key information (safe for logging)
   */
  getActiveKeyInfo(): { keyId: string; version: number; algorithm: string; created: number } {
    const metadata = this.keyMetadata.get(this.currentKeyId);
    if (!metadata) {
      throw new Error('No active key metadata found');
    }
    
    return {
      keyId: this.currentKeyId,
      version: metadata.version,
      algorithm: metadata.algorithm,
      created: metadata.created,
    };
  }

  /**
   * Force key rotation (for emergency situations)
   */
  forceKeyRotation(): void {
    console.log('🚨 Forcing immediate key rotation');
    this.rotateKeys();
  }

  /**
   * Revoke a specific key (for security incidents)
   */
  revokeKey(keyId: string): boolean {
    const metadata = this.keyMetadata.get(keyId);
    if (!metadata) {
      return false;
    }

    if (keyId === this.currentKeyId) {
      // If revoking current key, rotate first
      this.rotateKeys();
    }

    metadata.status = 'revoked';
    this.keys.delete(keyId);
    this.keyMetadata.set(keyId, metadata);
    
    console.log(`🚫 Revoked encryption key: ${keyId}`);
    return true;
  }

  /**
   * Parse time string to milliseconds
   */
  private parseTimeString(timeStr: string): number {
    const units: Record<string, number> = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
    };

    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match || match.length < 3) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }

    const value = match[1]!; // Non-null assertion since we verified match exists
    const unit = match[2]!;  // Non-null assertion since we verified match exists
    
    if (!value || !unit || !(unit in units)) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }

    return parseInt(value, 10) * units[unit];
  }

  /**
   * Get encryption statistics with key metadata
   */
  getStats() {
    const keyStats = Array.from(this.keyMetadata.values()).reduce((acc, metadata) => {
      acc[metadata.status] = (acc[metadata.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      enabled: this.config.enabled,
      algorithm: this.config.algorithm,
      currentKeyId: this.currentKeyId,
      currentVersion: this.keyVersion,
      totalKeys: this.keys.size,
      keyRotation: this.config.keyRotation,
      distributedMode: this.config.distributedMode,
      keyStats,
      keyMetadata: this.getKeyMetadata().map(metadata => ({
        id: metadata.id,
        version: metadata.version,
        status: metadata.status,
        created: new Date(metadata.created).toISOString(),
        expires: new Date(metadata.expires).toISOString(),
        algorithm: metadata.algorithm,
      })),
    };
  }

  /**
   * Cleanup resources and stop key rotation
   */
  cleanup(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }
    
    // Clear sensitive key material
    this.keys.clear();
    this.keyMetadata.clear();
    
    console.log('🧹 Encryption manager cleanup completed');
  }
}

/**
 * Create encryption manager instance with secure defaults
 */
export function createEncryptionManager(config: Partial<EncryptionConfig> = {}): EncryptionManager {
  const defaultConfig: EncryptionConfig = {
    enabled: process.env.ENCRYPTION_ENABLED === 'true',
    algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    keyRotation: process.env.ENCRYPTION_KEY_ROTATION || '24h',
    secretKey: process.env.ENCRYPTION_SECRET_KEY,
    ivLength: 12, // 96 bits for GCM (recommended)
    tagLength: 16, // 128 bits for GCM
    keyDerivationRounds: parseInt(process.env.ENCRYPTION_PBKDF2_ROUNDS || '100000'),
    distributedMode: process.env.ENCRYPTION_DISTRIBUTED_MODE === 'true',
  };

  // Validate configuration
  if (defaultConfig.enabled && !defaultConfig.secretKey) {
    console.warn('⚠️  ENCRYPTION_SECRET_KEY not set. Using random keys (not suitable for distributed systems)');
  }

  if (defaultConfig.distributedMode && !defaultConfig.secretKey) {
    throw new Error('ENCRYPTION_SECRET_KEY is required for distributed mode');
  }

  return new EncryptionManager({ ...defaultConfig, ...config });
}

/**
 * Encryption decorator for API routes
 */
export function withEncryption(encryptionManager: EncryptionManager) {
  return function (handler: Function) {
    return async function (request: Request): Promise<Response> {
      return encryptionManager.middleware()(request, handler);
    };
  };
}

/**
 * Client-side encryption helper
 */
export class ClientEncryption {
  private publicKey: string;
  private algorithm: string;

  constructor(publicKey: string, algorithm: string = 'aes-256-gcm') {
    this.publicKey = publicKey;
    this.algorithm = algorithm;
  }

  /**
   * Encrypt data for sending to server
   */
  async encryptForServer(data: any): Promise<string> {
    // In a real implementation, you would use the server's public key
    // This is a simplified version for demonstration
    const jsonData = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonData);
    
    // Generate a random key for symmetric encryption
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );

    // Export key for transmission (in real app, encrypt with server's public key)
    const exportedKey = await crypto.subtle.exportKey('raw', key);

    return JSON.stringify({
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
      key: Array.from(new Uint8Array(exportedKey)),
      algorithm: this.algorithm,
    });
  }

  /**
   * Decrypt response from server
   */
  async decryptFromServer(encryptedData: string): Promise<any> {
    const data = JSON.parse(encryptedData);
    
    // Import key
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(data.key),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(data.iv) },
      key,
      new Uint8Array(data.encrypted)
    );

    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decrypted);
    
    return JSON.parse(jsonString);
  }
}

// Export default encryption manager
export const defaultEncryption = createEncryptionManager();