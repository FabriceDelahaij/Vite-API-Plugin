# TypeScript Guide for Vite API Routes

Complete TypeScript integration guide for the Vite API Routes plugin with modern App Router style.

## 🎯 Type Safety Benefits

- **Request/Response Types** - Full type safety for API handlers
- **Validation** - Compile-time validation of request/response shapes
- **IntelliSense** - Better IDE support and autocomplete
- **Error Prevention** - Catch type errors at build time
- **Documentation** - Types serve as living documentation

## 📁 Project Structure

```
project/
├── types/
│   └── api.ts              # API type definitions
├── utils/
│   └── api-helpers.ts      # TypeScript utility functions
├── pages/api/
│   ├── auth/
│   │   └── login.ts        # Authentication endpoint
│   ├── protected/
│   │   └── profile.ts      # Protected route
│   ├── users/
│   │   └── [id].ts         # Dynamic route
│   └── posts.ts            # CRUD operations
└── tsconfig.json           # TypeScript configuration
```

## 🔧 TypeScript Configuration

Create or update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "jsx": "preserve",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "pages/**/*",
    "types/**/*",
    "utils/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

## 🏗️ Core Type Definitions

### Extended Request Interface

```typescript
// types/api.ts
export interface ApiRequest extends Request {
  ip: string;
  user?: User;
  cookies: Record<string, string>;
  getCsrfToken(): string;
}
```

### Response Types

```typescript
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  field?: string;
  code?: string;
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}
```

### Handler Types

```typescript
export type GetHandler = (request: ApiRequest) => Promise<Response>;
export type PostHandler = (request: ApiRequest) => Promise<Response>;
export type PutHandler = (request: ApiRequest) => Promise<Response>;
export type DeleteHandler = (request: ApiRequest) => Promise<Response>;
```

## 🎯 Basic API Route Example

```typescript
// pages/api/hello.ts
import type { ApiRequest, ApiSuccessResponse } from '../../types/api';

interface HelloResponse {
  message: string;
  timestamp: string;
}

export async function GET(request: ApiRequest): Promise<Response> {
  const response: ApiSuccessResponse<HelloResponse> = {
    success: true,
    data: {
      message: 'Hello from TypeScript API!',
      timestamp: new Date().toISOString(),
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  const body = await request.json();
  
  const response: ApiSuccessResponse<{ received: any }> = {
    success: true,
    data: { received: body },
    message: 'Data received successfully',
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## 🔐 Authentication Example

```typescript
// pages/api/auth/login.ts
import type { ApiRequest, User, ApiSuccessResponse, ApiErrorResponse } from '../../../types/api';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse extends ApiSuccessResponse<{
  user: User;
  token: string;
  csrfToken: string;
}> {}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const body: LoginRequest = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      const errorResponse: ApiErrorResponse = {
        error: 'Missing credentials',
        message: 'Email and password are required',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Authenticate user (mock implementation)
    if (email === 'admin@example.com' && password === 'password') {
      const user: User = {
        id: 1,
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
      };

      const response: LoginResponse = {
        success: true,
        data: {
          user,
          token: 'mock-jwt-token',
          csrfToken: request.getCsrfToken(),
        },
        message: 'Login successful',
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'auth_token=mock-token; HttpOnly; Secure; SameSite=Strict',
        },
      });
    }

    const errorResponse: ApiErrorResponse = {
      error: 'Invalid credentials',
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid request body',
      message: 'Request body must be valid JSON',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

## 🔄 Dynamic Routes with Types

```typescript
// pages/api/users/[id].ts
import type { ApiRequest, User, ApiSuccessResponse, ApiErrorResponse } from '../../../types/api';

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  // Type-safe ID validation
  if (!id || isNaN(Number(id))) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid user ID',
      field: 'id',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const user: User = {
    id: Number(id),
    name: `User ${id}`,
    email: `user${id}@example.com`,
    role: 'user',
  };
  
  const response: ApiSuccessResponse<User> = {
    success: true,
    data: user,
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## 📊 CRUD Operations with Pagination

```typescript
// pages/api/posts.ts
import type { 
  ApiRequest, 
  PaginatedResponse, 
  ApiSuccessResponse, 
  ApiErrorResponse 
} from '../../types/api';

interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  
  // Type-safe pagination parsing
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  
  // Validation with proper error types
  if (page < 1 || limit < 1 || limit > 100) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid pagination parameters',
      message: 'Page must be >= 1, limit must be between 1 and 100',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Mock data with proper typing
  const posts: Post[] = [
    {
      id: 1,
      title: 'First Post',
      content: 'Hello World',
      author: 'John Doe',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];
  
  // Type-safe pagination response
  const response: PaginatedResponse<Post> = {
    data: posts,
    pagination: {
      page,
      limit,
      total: posts.length,
      totalPages: Math.ceil(posts.length / limit),
      hasNext: false,
      hasPrev: false,
    },
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## 🛠️ Utility Functions

```typescript
// utils/api-helpers.ts
import type { ApiErrorResponse, ApiSuccessResponse } from '../types/api';

export function createJsonResponse<T>(
  data: T, 
  status: number = 200,
  headers: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function createErrorResponse(
  error: string,
  status: number = 400,
  message?: string
): Response {
  const errorResponse: ApiErrorResponse = {
    error,
    message,
  };
  
  return createJsonResponse(errorResponse, status);
}

export function createSuccessResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): Response {
  const successResponse: ApiSuccessResponse<T> = {
    success: true,
    data,
    message,
  };
  
  return createJsonResponse(successResponse, status);
}
```

## ✅ Input Validation

```typescript
// utils/validation.ts
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export function validateRequired(
  data: Record<string, any>, 
  requiredFields: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      errors.push({
        field,
        message: `${field} is required`,
        value: data[field],
      });
    }
  }
  
  return errors;
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
```

## 🔒 Protected Routes

```typescript
// pages/api/protected/profile.ts
import type { ApiRequest, User, ApiSuccessResponse, ApiErrorResponse } from '../../../types/api';

export async function GET(request: ApiRequest): Promise<Response> {
  // Type-safe user check
  const user: User | undefined = request.user;
  
  if (!user) {
    const errorResponse: ApiErrorResponse = {
      error: 'Unauthorized',
      message: 'Authentication required',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const response: ApiSuccessResponse<{ user: User }> = {
    success: true,
    data: { user },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## 🧪 Testing with Types

```typescript
// tests/api.test.ts
import { describe, it, expect } from 'vitest';
import type { ApiRequest, User } from '../types/api';

// Mock ApiRequest for testing
function createMockRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const mockRequest = new Request('http://localhost/api/test') as ApiRequest;
  
  return Object.assign(mockRequest, {
    ip: '127.0.0.1',
    cookies: {},
    getCsrfToken: () => 'mock-csrf-token',
    ...overrides,
  });
}

describe('API Routes', () => {
  it('should handle GET request with proper types', async () => {
    const request = createMockRequest();
    
    // Your handler function would be imported and tested here
    // const response = await GET(request);
    // expect(response.status).toBe(200);
  });
});
```

## 📦 Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "type-check": "tsc --noEmit",
    "lint": "eslint pages utils types --ext .ts,.tsx"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "vite": "^5.0.0"
  }
}
```

## 🎯 Best Practices

### 1. **Strict Type Checking**
```typescript
// Enable strict mode in tsconfig.json
"strict": true,
"noImplicitAny": true,
"strictNullChecks": true
```

### 2. **Interface Segregation**
```typescript
// Separate interfaces for different concerns
interface CreateUserRequest {
  name: string;
  email: string;
}

interface UpdateUserRequest {
  name?: string;
  email?: string;
}
```

### 3. **Generic Response Types**
```typescript
// Reusable generic types
type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

### 4. **Validation Helpers**
```typescript
// Type-safe validation
function validateUser(data: unknown): data is CreateUserRequest {
  return typeof data === 'object' && 
         data !== null && 
         'name' in data && 
         'email' in data;
}
```

### 5. **Error Handling**
```typescript
// Consistent error handling
try {
  const body = await request.json();
  // Process body...
} catch (error) {
  return createErrorResponse('Invalid JSON body', 400);
}
```

## 🚀 Advanced Features

### Custom Middleware Types
```typescript
export interface AuthMiddleware {
  (request: ApiRequest): Promise<boolean>;
}

export interface RateLimitMiddleware {
  (request: ApiRequest): Promise<{ allowed: boolean; remaining: number }>;
}
```

### Plugin Configuration Types
```typescript
export interface PluginConfig {
  apiDir?: string;
  apiPrefix?: string;
  cors?: CorsConfig;
  rateLimit?: RateLimitConfig;
  security?: SecurityConfig;
  auth?: AuthMiddleware;
}
```

TypeScript integration provides excellent developer experience with full type safety, better IDE support, and compile-time error detection for your Vite API routes!