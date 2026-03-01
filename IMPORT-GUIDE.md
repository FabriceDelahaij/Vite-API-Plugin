# Import Guide - Using the Plugin as a Package

## Problem

When using the plugin as an npm package (`vite-api-routes-plugin`), imports were failing:

```typescript
// ❌ This was failing
import type { ApiRequest, User } from 'vite-api-routes-plugin';
import { createErrorResponse, validateRequired } from 'vite-api-routes-plugin';
```

## Solution

### 1. Created Main Entry Point

Created `src/index.ts` that exports all public APIs:

```typescript
// Type definitions
export type {
  ApiRequest,
  User,
  ApiSuccessResponse,
  ApiErrorResponse,
  // ... all other types
} from './types/api';

// Utility functions
export {
  createErrorResponse,
  createSuccessResponse,
  validateRequired,
  isValidEmail,
  // ... all other utilities
} from './utils/api-helpers';

// Authentication, CORS, Cookies, Cache, etc.
export { JWT, Password, createAuthMiddleware } from './lib/auth.js';
export { createCorsConfig, CorsPresets } from './lib/cors.js';
// ... etc
```

### 2. Updated TypeScript Configuration

Added path mapping in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "vite-api-routes-plugin": ["./src/index.ts"]
    }
  }
}
```

### 3. Updated package.json Exports

Fixed the exports order (types must come first):

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

## Usage

### In Your API Routes

```typescript
// pages/api/auth/register.ts
import type { ApiRequest, User, ApiSuccessResponse } from 'vite-api-routes-plugin';
import { 
  createErrorResponse, 
  createSuccessResponse, 
  validateRequired, 
  isValidEmail 
} from 'vite-api-routes-plugin';

export async function POST(request: ApiRequest): Promise<Response> {
  const body = await request.json();
  
  // Validate required fields
  const errors = validateRequired(body, ['username', 'email', 'password']);
  if (errors.length > 0) {
    return createErrorResponse('Missing required fields', 400);
  }
  
  // Validate email
  if (!isValidEmail(body.email)) {
    return createErrorResponse('Invalid email format', 400);
  }
  
  // Your logic here...
  return createSuccessResponse({ user: newUser }, 'User created');
}
```

### Available Imports

#### Types
```typescript
import type {
  // Request/Response
  ApiRequest,
  User,
  ApiSuccessResponse,
  ApiErrorResponse,
  
  // Configuration
  CorsConfig,
  RateLimitConfig,
  SecurityConfig,
  
  // Validation
  ValidationError,
  
  // Handlers
  GetHandler,
  PostHandler,
  // ... etc
} from 'vite-api-routes-plugin';
```

#### Utilities
```typescript
import {
  // Response helpers
  createJsonResponse,
  createErrorResponse,
  createSuccessResponse,
  
  // Validation
  validateRequired,
  isValidEmail,
  validateStringLength,
  
  // Pagination
  parsePagination,
  createPaginationResponse,
  
  // Rate limiting
  RateLimiter,
} from 'vite-api-routes-plugin';
```

#### Authentication
```typescript
import {
  JWT,
  Password,
  APIKeyAuth,
  SessionAuth,
  createAuthMiddleware,
  requireRole,
  requirePermission,
} from 'vite-api-routes-plugin';
```

#### CORS
```typescript
import {
  createCorsConfig,
  createEnvCorsConfig,
  CorsPresets,
  corsMiddleware,
} from 'vite-api-routes-plugin';
```

#### Cookies
```typescript
import {
  CookiePresets,
  CookieManager,
  serializeCookie,
  parseCookies,
  SignedCookie,
} from 'vite-api-routes-plugin';
```

#### Cache
```typescript
import {
  MemoryCache,
  CacheManager,
  createCacheMiddleware,
} from 'vite-api-routes-plugin';
```

#### Compression
```typescript
import {
  COMPRESSION_PRESETS,
  CompressionManager,
  createCompressionMiddleware,
} from 'vite-api-routes-plugin';
```

#### Request ID
```typescript
import {
  generateRequestId,
  requestIdMiddleware,
  RequestIdManager,
  createRequestLogger,
} from 'vite-api-routes-plugin';
```

#### Environment
```typescript
import {
  EnvLoader,
  SecretGenerator,
  EnvChecker,
  validateEnvironment,
} from 'vite-api-routes-plugin';
```

#### Encryption
```typescript
import {
  createEncryptionManager,
  withEncryption,
  ClientEncryption,
} from 'vite-api-routes-plugin';

import type {
  EncryptionConfig,
  EncryptedData,
  KeyMetadata,
} from 'vite-api-routes-plugin';
```

## Development vs Production

### Development (Current Setup)
- Uses TypeScript path mapping
- Imports resolve to `src/index.ts`
- Works with `npm run dev`

### Production (After Build)
- Imports resolve to `dist/index.js` or `dist/index.d.ts`
- Requires running `npm run build` to compile
- Published package uses compiled files

## TypeScript Errors Fixed

### 1. UserWithPassword Interface
Changed from extending `User` to explicit interface:
```typescript
interface UserWithPassword {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  password: string;
  createdAt: string;
  updatedAt: string;
}
```

### 2. Validation Error Type
Added explicit type annotation:
```typescript
validationErrors.map((e: { field: string }) => e.field)
```

### 3. Encryption Time Parsing
Fixed type narrowing for units object:
```typescript
const multiplier = units[unit as keyof typeof units];
if (multiplier === undefined) {
  throw new Error(`Invalid time unit: ${unit}`);
}
return parseInt(value, 10) * multiplier;
```

## Testing

All imports now work correctly:

```bash
# Type checking passes
npx tsc --noEmit

# Development server works
npm run dev

# Imports resolve correctly in IDE
```

## Next Steps

For publishing the package:
1. Run `npm run build` to compile TypeScript
2. The `dist/` folder will contain compiled JavaScript and type definitions
3. Package consumers will import from the compiled files
4. All exports are properly typed and tree-shakeable


## Development Setup (Plugin Development)

When developing the plugin itself (not using it as a package), you need to:

1. **Create JavaScript version of utility files** for runtime:
   - `src/utils/api-helpers.js` (JavaScript version for runtime)
   - `src/utils/api-helpers.ts` (TypeScript version for types)

2. **Configure Vite alias** in `vite.config.js`:
   ```javascript
   import { fileURLToPath } from 'url';
   import path from 'path';
   
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   
   export default defineConfig({
     resolve: {
       alias: {
         'vite-api-routes-plugin': path.resolve(__dirname, './src/index.ts'),
       },
     },
     // ... rest of config
   });
   ```

3. **Update plugin imports** to use `src/` prefix:
   ```javascript
   // In vite-plugin-api-routes.js
   import { HotReloadManager } from './src/hmr/hot-reload-manager.js';
   import { CacheManager } from './src/lib/cache.js';
   // etc.
   ```

4. **Install required dependencies**:
   ```bash
   npm install --save-dev @babel/parser @babel/traverse
   ```

5. **Update src/index.ts** to export from `.js` files:
   ```typescript
   export {
     createJsonResponse,
     createErrorResponse,
     createSuccessResponse,
     // ... other exports
   } from './utils/api-helpers.js'; // Note the .js extension
   ```

## Testing

The imports have been tested and verified to work correctly:

```bash
# Test imports directly
node test-imports.js

# Start dev server
npm run dev

# Test GET endpoint
curl http://localhost:5173/api/auth/register

# Test POST request
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test@1234"}'
```

### Test Results

✅ Direct imports from `src/utils/api-helpers.js` work correctly
✅ API endpoints successfully use imports from `'vite-api-routes-plugin'`
✅ GET /api/auth/register returns 200 with requirements
✅ POST /api/auth/register successfully creates user
✅ All utility functions (`createSuccessResponse`, `createErrorResponse`, etc.) operational

## Additional Troubleshooting

### Runtime errors with imports

1. Verify that `src/utils/api-helpers.js` exists (JavaScript version)
2. Check that `src/index.ts` exports from `.js` files, not `.ts` files
3. Ensure all dependencies are installed (`@babel/parser`, `@babel/traverse`)
4. Verify plugin imports use `src/` prefix for local modules

### "Cannot find package '@babel/parser'"

Install the required Babel dependencies:
```bash
npm install --save-dev @babel/parser @babel/traverse
```

### Vite config errors

Make sure to define `__dirname` for ES modules:
```javascript
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

## Status

✅ **Imports working correctly**
✅ **Type definitions available**
✅ **Runtime functions operational**
✅ **API endpoints tested successfully**
✅ **Development setup complete**
