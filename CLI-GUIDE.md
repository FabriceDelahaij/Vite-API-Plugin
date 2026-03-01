# CLI Tool Guide (Optional)

The Vite API Routes Plugin includes an optional CLI tool for scaffolding, testing, and managing your API routes. The CLI provides convenience features but is not required for basic plugin functionality.

## Installation

The CLI requires additional dependencies that are not installed by default:

```bash
# Install the main plugin
npm install vite-api-routes-plugin

# Install CLI dependencies (optional)
npm install commander chalk inquirer
```

The CLI binary is available as `vite-api-routes`:

```bash
npx vite-api-routes --help
```

> **Important:** If CLI dependencies are not installed, the plugin will still work perfectly for basic API route functionality. The CLI is purely for convenience and scaffolding.

## Commands

### `init` - Initialize Project

Initialize a new Vite API Routes project with interactive prompts.

```bash
vite-api-routes init [options]
```

**Options:**
- `-t, --template <template>` - Project template (basic, auth, full)
- `--typescript` - Use TypeScript
- `-f, --force` - Overwrite existing files

**Templates:**
- `basic` - Simple API routes setup
- `auth` - Includes authentication system
- `full` - Complete setup with all features

**Example:**
```bash
# Interactive setup
vite-api-routes init

# Quick TypeScript setup
vite-api-routes init --template full --typescript
```

### `generate` - Generate Components

Generate API routes, CRUD operations, authentication systems, and more.

```bash
vite-api-routes generate <type> [name] [options]
```

**Types:**
- `route` - Single API route
- `crud` - Full CRUD operations
- `auth` - Authentication system
- `middleware` - Custom middleware
- `test` - Test files

**Options:**
- `--typescript` - Generate TypeScript files
- `-t, --template <template>` - Template to use
- `-f, --force` - Overwrite existing files

#### Generate Route

```bash
# Basic route
vite-api-routes generate route users

# With template
vite-api-routes generate route users --template protected
```

**Available templates:**
- `basic` - GET/POST methods
- `crud` - All HTTP methods
- `protected` - Requires authentication
- `upload` - File upload handling

#### Generate CRUD

```bash
vite-api-routes generate crud posts
```

Creates:
- `pages/api/posts.js` - Collection endpoints (GET, POST)
- `pages/api/posts/[id].js` - Item endpoints (GET, PUT, DELETE)
- `tests/api/posts.test.js` - Test suite

#### Generate Auth System

```bash
vite-api-routes generate auth
```

Creates:
- `pages/api/auth/login.js` - Login endpoint
- `pages/api/auth/register.js` - Registration endpoint
- `pages/api/auth/logout.js` - Logout endpoint
- `pages/api/auth/me.js` - Current user endpoint
- `utils/auth-middleware.js` - Authentication middleware
- `tests/auth.test.js` - Auth tests

#### Generate Middleware

```bash
vite-api-routes generate middleware cors
```

Creates:
- `utils/cors-middleware.js` - Middleware implementation
- `tests/middleware/cors.test.js` - Middleware tests

### `test` - Run Tests

Run API tests using Vitest.

```bash
vite-api-routes test [options]
```

**Options:**
- `-w, --watch` - Watch mode
- `-c, --coverage` - Generate coverage report
- `-u, --ui` - Open test UI
- `--filter <pattern>` - Filter tests by pattern
- `--timeout <ms>` - Test timeout in milliseconds

**Examples:**
```bash
# Run all tests
vite-api-routes test

# Watch mode with coverage
vite-api-routes test --watch --coverage

# Test UI
vite-api-routes test --ui

# Filter tests
vite-api-routes test --filter "auth"
```

### `docs` - Generate Documentation

Generate API documentation in various formats.

```bash
vite-api-routes docs [options]
```

**Options:**
- `-o, --output <directory>` - Output directory (default: docs)
- `-f, --format <format>` - Output format (markdown, html, json)
- `--include-examples` - Include code examples
- `--include-tests` - Include test examples

**Formats:**
- `markdown` - Generates README.md
- `html` - Generates index.html
- `json` - Generates OpenAPI spec

**Examples:**
```bash
# Generate markdown docs
vite-api-routes docs

# Generate HTML docs
vite-api-routes docs --format html

# Generate OpenAPI spec
vite-api-routes docs --format json
```

### `migrate` - Migrate from Other Frameworks

Migrate existing API routes from other frameworks.

```bash
vite-api-routes migrate [options]
```

**Options:**
- `--from <framework>` - Source framework (nextjs, express, fastify, koa)
- `--src <directory>` - Source directory
- `--dest <directory>` - Destination directory
- `--typescript` - Convert to TypeScript
- `--dry-run` - Show what would be migrated

**Supported frameworks:**
- `nextjs` - Next.js API routes
- `express` - Express.js routes
- `fastify` - Fastify routes
- `koa` - Koa.js middleware

**Examples:**
```bash
# Migrate from Next.js
vite-api-routes migrate --from nextjs

# Dry run migration
vite-api-routes migrate --from express --dry-run

# Convert to TypeScript
vite-api-routes migrate --from nextjs --typescript
```

## Project Structure

The CLI generates a consistent project structure:

```
project/
├── pages/api/           # API routes
│   ├── auth/           # Authentication routes
│   ├── users.js        # User routes
│   └── posts/          # Post routes
│       └── [id].js     # Dynamic route
├── utils/              # Utility functions
│   ├── api-helpers.js  # API utilities
│   └── auth-middleware.js # Auth middleware
├── tests/              # Test files
│   ├── api/           # API tests
│   └── setup.js       # Test setup
├── types/              # TypeScript definitions (if TS)
│   └── api.ts         # API types
├── vite.config.js      # Vite configuration
├── package.json        # Dependencies
└── README.md          # Documentation
```

## Configuration Files

### package.json

The CLI updates your `package.json` with necessary scripts and dependencies:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "vite-api-routes-plugin": "^1.0.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

### vite.config.js

Generated Vite configuration:

```javascript
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      // Security features
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:5173'],
        credentials: true,
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100,
      },
      security: {
        enableCsrf: true,
        enableHelmet: true,
      },
    }),
  ],
});
```

### tsconfig.json (TypeScript)

TypeScript configuration with path mapping:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@/types/*": ["./types/*"],
      "@/utils/*": ["./utils/*"]
    }
  },
  "include": ["pages/**/*", "types/**/*", "utils/**/*", "tests/**/*"]
}
```

## Environment Variables

The CLI generates an `.env.example` file with common variables:

```bash
# Development
NODE_ENV=development
PORT=5173

# Security
JWT_SECRET=your-super-secret-jwt-key
API_TOKEN=your-api-token

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional: Encryption
ENCRYPTION_ENABLED=false
ENCRYPTION_ALGORITHM=aes-256-gcm
ENCRYPTION_KEY_ROTATION=24h

# Optional: Sentry
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

## Best Practices

### 1. Use TypeScript

Always use TypeScript for better type safety:

```bash
vite-api-routes init --typescript
```

### 2. Generate Tests

Always generate tests with your routes:

```bash
vite-api-routes generate route users --include-tests
```

### 3. Use Templates

Use appropriate templates for different use cases:

```bash
# For public endpoints
vite-api-routes generate route public --template basic

# For protected endpoints
vite-api-routes generate route admin --template protected

# For file uploads
vite-api-routes generate route upload --template upload
```

### 4. Document Your APIs

Generate documentation regularly:

```bash
vite-api-routes docs --format html --include-examples
```

### 5. Test Everything

Run tests frequently during development:

```bash
vite-api-routes test --watch --coverage
```

## Troubleshooting

### Command Not Found

If `vite-api-routes` command is not found, install the CLI dependencies:

```bash
# Install CLI dependencies
npm install commander chalk inquirer

# Then use the CLI
npx vite-api-routes --help

# Or install globally (after installing dependencies)
npm install -g vite-api-routes-plugin
```

### Missing Dependencies

If you see "CLI dependencies not found" error:

```bash
# Install the required CLI dependencies
npm install commander chalk inquirer

# Or use the plugin without CLI features
# The plugin works perfectly without CLI for basic API routes
```

### TypeScript Errors

If you encounter TypeScript errors:

1. Ensure TypeScript is installed:
   ```bash
   npm install --save-dev typescript @types/node
   ```

2. Check your `tsconfig.json` configuration

3. Run type checking:
   ```bash
   npm run type-check
   ```

### Test Failures

If tests are failing:

1. Check test setup in `tests/setup.js`
2. Ensure Vitest is installed:
   ```bash
   npm install --save-dev vitest
   ```
3. Run tests with verbose output:
   ```bash
   vite-api-routes test --reporter=verbose
   ```

### Migration Issues

If migration fails:

1. Use dry-run first:
   ```bash
   vite-api-routes migrate --from nextjs --dry-run
   ```

2. Check source directory exists
3. Backup your files before migration
4. Review generated files manually

## Examples

### Complete Project Setup

```bash
# 1. Initialize project
vite-api-routes init --template full --typescript

# 2. Generate auth system
vite-api-routes generate auth

# 3. Generate user CRUD
vite-api-routes generate crud users

# 4. Generate documentation
vite-api-routes docs --format html

# 5. Run tests
vite-api-routes test --coverage
```

### Migration from Next.js

```bash
# 1. Backup existing files
cp -r pages/api pages/api.backup

# 2. Dry run migration
vite-api-routes migrate --from nextjs --dry-run

# 3. Perform migration
vite-api-routes migrate --from nextjs --typescript

# 4. Test migrated routes
vite-api-routes test
```

This CLI tool makes it easy to scaffold, test, and maintain your Vite API routes with best practices built-in.