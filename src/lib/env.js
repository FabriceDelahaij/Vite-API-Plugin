/**
 * Environment variable utilities
 * Secure loading, validation, and management of environment variables
 */

import crypto from 'crypto';

/**
 * Environment variable schema for validation
 */
export const EnvSchema = {
  // Required variables
  required: [
    'JWT_SECRET',
    'NODE_ENV',
  ],

  // Optional variables with defaults
  optional: {
    PORT: '5173',
    HOST: 'localhost',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    RATE_LIMIT_WINDOW_MS: '900000',
    RATE_LIMIT_MAX_REQUESTS: '100',
    COOKIE_DOMAIN: '',
    SESSION_SECRET: '',
  },

  // Sensitive variables (should never be logged)
  sensitive: [
    'JWT_SECRET',
    'SESSION_SECRET',
    'COOKIE_SECRET',
    'API_KEY',
    'API_TOKEN',
    'DATABASE_URL',
    'SENTRY_DSN',
    'PRIVATE_KEY',
  ],

  // Validation rules
  rules: {
    JWT_SECRET: (value) => {
      if (value.length < 32) {
        return 'JWT_SECRET must be at least 32 characters';
      }
      return null;
    },
    NODE_ENV: (value) => {
      const valid = ['development', 'production', 'test', 'staging'];
      if (!valid.includes(value)) {
        return `NODE_ENV must be one of: ${valid.join(', ')}`;
      }
      return null;
    },
    PORT: (value) => {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return 'PORT must be a valid port number (1-65535)';
      }
      return null;
    },
    ALLOWED_ORIGINS: (value) => {
      const origins = value.split(',').map(o => o.trim());
      for (const origin of origins) {
        try {
          new URL(origin);
        } catch {
          return `Invalid URL in ALLOWED_ORIGINS: ${origin}`;
        }
      }
      return null;
    },
  },
};

/**
 * Load and validate environment variables
 */
export class EnvLoader {
  constructor(schema = EnvSchema) {
    this.schema = schema;
    this.env = {};
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Load environment variables
   */
  load() {
    // Load from process.env
    this.env = { ...process.env };

    // Apply defaults for optional variables
    for (const [key, defaultValue] of Object.entries(this.schema.optional)) {
      if (!this.env[key]) {
        this.env[key] = defaultValue;
        this.warnings.push(`Using default value for ${key}: ${defaultValue}`);
      }
    }

    return this;
  }

  /**
   * Validate environment variables
   */
  validate() {
    // Check required variables
    for (const key of this.schema.required) {
      if (!this.env[key]) {
        this.errors.push(`Missing required environment variable: ${key}`);
      }
    }

    // Run validation rules
    for (const [key, validator] of Object.entries(this.schema.rules)) {
      if (this.env[key]) {
        const error = validator(this.env[key]);
        if (error) {
          this.errors.push(`${key}: ${error}`);
        }
      }
    }

    // Check for sensitive variables in development
    if (this.env.NODE_ENV === 'development') {
      for (const key of this.schema.sensitive) {
        if (this.env[key] && this.env[key].includes('change-this')) {
          this.warnings.push(`${key} contains default value - change it for security`);
        }
      }
    }

    return this;
  }

  /**
   * Get environment variable
   */
  get(key, defaultValue = undefined) {
    return this.env[key] || defaultValue;
  }

  /**
   * Get required environment variable (throws if missing)
   */
  getRequired(key) {
    const value = this.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  /**
   * Get boolean environment variable
   */
  getBoolean(key, defaultValue = false) {
    const value = this.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get number environment variable
   */
  getNumber(key, defaultValue = 0) {
    const value = this.env[key];
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Get array environment variable (comma-separated)
   */
  getArray(key, defaultValue = []) {
    const value = this.env[key];
    if (!value) return defaultValue;
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }

  /**
   * Check if all validations passed
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Print validation results
   */
  printResults() {
    if (this.warnings.length > 0) {
      console.warn('\n⚠️  Environment Warnings:');
      this.warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    if (this.errors.length > 0) {
      console.error('\n❌ Environment Errors:');
      this.errors.forEach(error => console.error(`  - ${error}`));
      return false;
    }

    console.log('\n✅ Environment variables validated successfully');
    return true;
  }

  /**
   * Get safe environment object (sensitive values redacted)
   */
  getSafeEnv() {
    const safe = {};
    for (const [key, value] of Object.entries(this.env)) {
      if (this.schema.sensitive.includes(key)) {
        safe[key] = '[REDACTED]';
      } else {
        safe[key] = value;
      }
    }
    return safe;
  }

  /**
   * Export to .env format
   */
  toEnvFile() {
    let content = '# Environment Variables\n';
    content += `# Generated: ${new Date().toISOString()}\n\n`;

    for (const [key, value] of Object.entries(this.env)) {
      // Skip undefined values
      if (value === undefined) continue;

      // Add comment for sensitive variables
      if (this.schema.sensitive.includes(key)) {
        content += `# SENSITIVE: Keep this secret!\n`;
      }

      content += `${key}=${value}\n`;
    }

    return content;
  }
}

/**
 * Generate secure random secrets
 */
export class SecretGenerator {
  /**
   * Generate random hex string
   */
  static hex(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate random base64 string
   */
  static base64(length = 32) {
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Generate random base64url string (URL-safe)
   */
  static base64url(length = 32) {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate JWT secret (64 bytes = 128 hex chars)
   */
  static jwtSecret() {
    return this.hex(64);
  }

  /**
   * Generate API key
   */
  static apiKey(prefix = 'sk') {
    return `${prefix}_${this.hex(32)}`;
  }

  /**
   * Generate session secret
   */
  static sessionSecret() {
    return this.hex(32);
  }

  /**
   * Generate all required secrets
   */
  static generateAll() {
    return {
      JWT_SECRET: this.jwtSecret(),
      SESSION_SECRET: this.sessionSecret(),
      COOKIE_SECRET: this.sessionSecret(),
      API_TOKEN: this.apiKey('api'),
    };
  }
}

/**
 * Environment variable checker
 */
export class EnvChecker {
  /**
   * Check if running in production
   */
  static isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Check if running in development
   */
  static isDevelopment() {
    return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  }

  /**
   * Check if running in test
   */
  static isTest() {
    return process.env.NODE_ENV === 'test';
  }

  /**
   * Check if HTTPS is enabled
   */
  static isHttpsEnabled() {
    return this.isProduction() || process.env.HTTPS === 'true';
  }

  /**
   * Check if debug mode is enabled
   */
  static isDebugEnabled() {
    return process.env.DEBUG === 'true' || this.isDevelopment();
  }

  /**
   * Get current environment
   */
  static getEnvironment() {
    return process.env.NODE_ENV || 'development';
  }
}

/**
 * Validate environment on startup
 */
export function validateEnvironment(schema = EnvSchema) {
  const loader = new EnvLoader(schema);
  loader.load().validate();

  if (!loader.printResults()) {
    console.error('\n❌ Environment validation failed. Please fix the errors above.\n');
    process.exit(1);
  }

  return loader;
}

/**
 * Create .env.example file
 */
export function createEnvExample(schema = EnvSchema) {
  let content = '# Environment Variables Example\n';
  content += '# Copy this file to .env and fill in your values\n\n';

  // Required variables
  content += '# Required Variables\n';
  for (const key of schema.required) {
    if (schema.sensitive.includes(key)) {
      content += `${key}=your-secret-here-change-this\n`;
    } else {
      content += `${key}=\n`;
    }
  }

  content += '\n# Optional Variables (with defaults)\n';
  for (const [key, defaultValue] of Object.entries(schema.optional)) {
    content += `${key}=${defaultValue}\n`;
  }

  return content;
}

/**
 * CLI tool to generate secrets
 */
export function generateSecretsCommand() {
  console.log('\n🔐 Generated Secrets:\n');
  
  const secrets = SecretGenerator.generateAll();
  
  for (const [key, value] of Object.entries(secrets)) {
    console.log(`${key}=${value}`);
  }
  
  console.log('\n⚠️  Keep these secrets safe! Add them to your .env file.\n');
  console.log('💡 Tip: Never commit .env files to version control!\n');
}

/**
 * Mask sensitive values in logs
 */
export function maskSensitive(obj, sensitiveKeys = EnvSchema.sensitive) {
  const masked = { ...obj };
  
  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
      const value = masked[key];
      if (typeof value === 'string' && value.length > 8) {
        masked[key] = value.slice(0, 4) + '****' + value.slice(-4);
      } else {
        masked[key] = '[REDACTED]';
      }
    }
  }
  
  return masked;
}
