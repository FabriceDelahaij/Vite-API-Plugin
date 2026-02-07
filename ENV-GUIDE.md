# Environment Variables Guide

Complete guide for managing environment variables securely in your Vite API routes.

## 🔐 Why Environment Variables?

Environment variables keep sensitive data out of your code:
- ✅ Secrets never committed to version control
- ✅ Different values per environment (dev/staging/prod)
- ✅ Easy to rotate credentials
- ✅ Follows 12-factor app principles

## 🚀 Quick Start

### 1. Generate Secrets

```bash
# Generate all required secrets
npm run generate-secrets

# Output:
# JWT_SECRET=a1b2c3d4e5f6...
# SESSION_SECRET=x1y2z3...
# COOKIE_SECRET=p1q2r3...
# API_TOKEN=api_s1t2u3...
```

### 2. Create .env File

```bash
# Create .env with generated secrets
npm run generate-secrets -- --create

# Or copy .env.example manually
cp .env.example .env
```

### 3. Edit .env File

```bash
# .env
JWT_SECRET=your-generated-secret-here
SESSION_SECRET=your-session-secret-here
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
NODE_ENV=development
```

### 4. Validate Environment

```bash
# Check if all required variables are set
npm run validate-env
```

## 📋 Required Variables

### JWT_SECRET (Required)

Used for signing JWT tokens. Must be at least 32 characters.

```bash
# Generate secure secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Add to .env
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6...
```

### NODE_ENV (Required)

Determines the environment mode.

```bash
NODE_ENV=development  # or production, staging, test
```

## 🔑 Optional Variables

### SESSION_SECRET

For session-based authentication:

```bash
SESSION_SECRET=your-session-secret-min-32-chars
```

### COOKIE_SECRET

For signed cookies:

```bash
COOKIE_SECRET=your-cookie-secret-min-32-chars
```

### ALLOWED_ORIGINS

CORS whitelist (comma-separated):

```bash
# Development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Production
ALLOWED_ORIGINS=https://example.com,https://www.example.com,https://app.example.com
```

### SENTRY_DSN

Error tracking with Sentry:

```bash
SENTRY_DSN=https://your-key@sentry.io/project-id
```

### SSL Certificates

For HTTPS in production:

```bash
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

### Rate Limiting

```bash
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100      # Max requests per window
```

### Server Configuration

```bash
PORT=5173
HOST=localhost
DEBUG=false
HTTPS=false
```

## 🛠️ Using Environment Variables

### In Configuration Files

```js
// vite.config.js
export default defineConfig({
  plugins: [
    apiRoutes({
      cors: {
        origin: process.env.ALLOWED_ORIGINS.split(','),
      },
      errorTracking: {
        enabled: !!process.env.SENTRY_DSN,
        dsn: process.env.SENTRY_DSN,
      },
    }),
  ],
});
```

### In API Routes

```js
// pages/api/example.js
export default function handler(req, res) {
  const apiKey = process.env.API_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  res.json({
    environment: process.env.NODE_ENV,
    debug: process.env.DEBUG === 'true',
  });
}
```

### Using EnvLoader

```js
import { EnvLoader } from './lib/env.js';

const env = new EnvLoader();
env.load().validate();

// Get values
const jwtSecret = env.getRequired('JWT_SECRET');
const port = env.getNumber('PORT', 5173);
const debug = env.getBoolean('DEBUG', false);
const origins = env.getArray('ALLOWED_ORIGINS');

// Check validity
if (!env.isValid()) {
  console.error('Environment validation failed');
  process.exit(1);
}
```

## 🔒 Security Best Practices

### 1. Never Commit .env Files

```bash
# .gitignore
.env
.env.local
.env.production
.env.*.local
```

### 2. Use Strong Secrets

```bash
# ❌ BAD - Too short
JWT_SECRET=secret123

# ✅ GOOD - Long and random
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6...
```

### 3. Different Secrets Per Environment

```bash
# Development
JWT_SECRET=dev-secret-a1b2c3d4...

# Production
JWT_SECRET=prod-secret-x1y2z3w4...
```

### 4. Rotate Secrets Regularly

```bash
# Generate new secrets periodically
npm run generate-secrets

# Update .env and restart application
```

### 5. Use Secret Management in Production

For production, use a secret management service:
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Secret Manager

### 6. Validate on Startup

```js
// server.js
import { validateEnvironment } from './lib/env.js';

// Validate before starting server
validateEnvironment();

// Start server
app.listen(process.env.PORT);
```

## 🧪 Environment Validation

### Automatic Validation

```js
import { validateEnvironment } from './lib/env.js';

// Validates and exits if errors found
const env = validateEnvironment();

// Use validated environment
const jwtSecret = env.get('JWT_SECRET');
```

### Custom Validation Rules

```js
import { EnvLoader } from './lib/env.js';

const schema = {
  required: ['JWT_SECRET', 'DATABASE_URL'],
  rules: {
    JWT_SECRET: (value) => {
      if (value.length < 32) {
        return 'JWT_SECRET must be at least 32 characters';
      }
      return null;
    },
    DATABASE_URL: (value) => {
      if (!value.startsWith('postgresql://')) {
        return 'DATABASE_URL must be a PostgreSQL connection string';
      }
      return null;
    },
  },
};

const env = new EnvLoader(schema);
env.load().validate();

if (!env.isValid()) {
  env.printResults();
  process.exit(1);
}
```

## 🔍 Environment Checkers

### Check Environment Type

```js
import { EnvChecker } from './lib/env.js';

if (EnvChecker.isProduction()) {
  // Production-only code
}

if (EnvChecker.isDevelopment()) {
  // Development-only code
}

if (EnvChecker.isTest()) {
  // Test-only code
}
```

### Check Features

```js
if (EnvChecker.isHttpsEnabled()) {
  // HTTPS is enabled
}

if (EnvChecker.isDebugEnabled()) {
  console.log('Debug mode active');
}
```

## 📊 Secret Generation

### Generate All Secrets

```bash
npm run generate-secrets

# Output:
# JWT_SECRET=...
# SESSION_SECRET=...
# COOKIE_SECRET=...
# API_TOKEN=...
```

### Generate Specific Secret Types

```js
import { SecretGenerator } from './lib/env.js';

// JWT secret (128 hex chars)
const jwtSecret = SecretGenerator.jwtSecret();

// API key with prefix
const apiKey = SecretGenerator.apiKey('sk');
// Output: sk_a1b2c3d4e5f6...

// Session secret
const sessionSecret = SecretGenerator.sessionSecret();

// Random hex
const hex = SecretGenerator.hex(32);

// Random base64
const base64 = SecretGenerator.base64(32);

// Random base64url (URL-safe)
const base64url = SecretGenerator.base64url(32);
```

## 🌍 Multiple Environments

### Development (.env)

```bash
NODE_ENV=development
JWT_SECRET=dev-secret-a1b2c3d4...
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DEBUG=true
HTTPS=false
```

### Staging (.env.staging)

```bash
NODE_ENV=staging
JWT_SECRET=staging-secret-x1y2z3w4...
ALLOWED_ORIGINS=https://staging.example.com
DEBUG=false
HTTPS=true
SSL_KEY_PATH=/etc/ssl/staging/key.pem
SSL_CERT_PATH=/etc/ssl/staging/cert.pem
```

### Production (.env.production)

```bash
NODE_ENV=production
JWT_SECRET=prod-secret-p1q2r3s4...
ALLOWED_ORIGINS=https://example.com,https://www.example.com
DEBUG=false
HTTPS=true
SSL_KEY_PATH=/etc/letsencrypt/live/example.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/example.com/fullchain.pem
SENTRY_DSN=https://your-key@sentry.io/project-id
```

### Load Environment-Specific File

```bash
# Load staging environment
NODE_ENV=staging node -r dotenv/config server.js dotenv_config_path=.env.staging

# Load production environment
NODE_ENV=production node -r dotenv/config server.js dotenv_config_path=.env.production
```

## 🔐 Masking Sensitive Values

### In Logs

```js
import { maskSensitive } from './lib/env.js';

const config = {
  JWT_SECRET: 'a1b2c3d4e5f6...',
  PORT: 5173,
  DATABASE_URL: 'postgresql://user:pass@localhost/db',
};

const masked = maskSensitive(config);
console.log(masked);
// {
//   JWT_SECRET: 'a1b2****f6...',
//   PORT: 5173,
//   DATABASE_URL: 'post****b',
// }
```

### Safe Environment Object

```js
import { EnvLoader } from './lib/env.js';

const env = new EnvLoader();
env.load();

// Get safe version (sensitive values redacted)
const safeEnv = env.getSafeEnv();
console.log(safeEnv);
// {
//   JWT_SECRET: '[REDACTED]',
//   PORT: '5173',
//   NODE_ENV: 'development',
// }
```

## 📝 Creating .env.example

### Automatic Generation

```bash
npm run generate-secrets -- --example
```

### Manual Creation

```bash
# .env.example
# Copy this file to .env and fill in your values

# Required
JWT_SECRET=your-secret-here-min-32-chars
NODE_ENV=development

# Optional
SESSION_SECRET=
COOKIE_SECRET=
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
SENTRY_DSN=
PORT=5173
```

## 🚨 Common Mistakes

### 1. Committing .env Files

```bash
# ❌ BAD - .env is committed
git add .env
git commit -m "Add config"

# ✅ GOOD - .env is gitignored
echo ".env" >> .gitignore
git add .gitignore
```

### 2. Using Weak Secrets

```bash
# ❌ BAD
JWT_SECRET=secret123

# ✅ GOOD
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6...
```

### 3. Hardcoding Secrets

```js
// ❌ BAD
const jwtSecret = 'hardcoded-secret';

// ✅ GOOD
const jwtSecret = process.env.JWT_SECRET;
```

### 4. Not Validating Environment

```js
// ❌ BAD - No validation
const secret = process.env.JWT_SECRET;
jwt.sign(payload, secret); // Might be undefined!

// ✅ GOOD - Validate first
validateEnvironment();
const secret = process.env.JWT_SECRET; // Guaranteed to exist
```

### 5. Exposing Secrets in Logs

```js
// ❌ BAD
console.log('Config:', process.env);

// ✅ GOOD
import { maskSensitive } from './lib/env.js';
console.log('Config:', maskSensitive(process.env));
```

## 📚 Resources

- [12-Factor App: Config](https://12factor.net/config)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Node.js Environment Variables](https://nodejs.org/api/process.html#process_process_env)
- [dotenv Documentation](https://github.com/motdotla/dotenv)
