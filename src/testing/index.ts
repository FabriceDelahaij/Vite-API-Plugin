// Testing utilities for Vite API Routes
import type { ApiRequest, User } from '../types/api';

/**
 * Create a mock API request for testing
 */
export function createTestRequest(
  url: string,
  options: RequestInit & {
    ip?: string;
    user?: User;
    cookies?: Record<string, string>;
  } = {}
): ApiRequest {
  const { ip = '127.0.0.1', user, cookies = {}, ...requestOptions } = options;
  
  const request = new Request(url, requestOptions) as ApiRequest;
  
  // Add custom properties
  request.ip = ip;
  request.user = user;
  request.cookies = cookies;
  request.getCsrfToken = () => 'test-csrf-token';
  
  return request;
}

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    permissions: ['read'],
    ...overrides,
  };
}

/**
 * Create a mock admin user for testing
 */
export function createMockAdmin(overrides: Partial<User> = {}): User {
  return createMockUser({
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['read', 'write', 'delete', 'admin'],
    ...overrides,
  });
}

/**
 * Mock authentication middleware for testing
 */
export function mockAuth(user?: User) {
  return async (request: ApiRequest): Promise<boolean> => {
    if (user) {
      request.user = user;
      return true;
    }
    return false;
  };
}

/**
 * Test helper for API responses
 */
export class ApiTestHelper {
  static async expectSuccess(response: Response, expectedStatus = 200) {
    expect(response.status).toBe(expectedStatus);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('data');
    
    return data;
  }

  static async expectError(response: Response, expectedStatus = 400) {
    expect(response.status).toBe(expectedStatus);
    
    const data = await response.json();
    expect(data).toHaveProperty('error');
    
    return data;
  }

  static async expectJson(response: Response) {
    expect(response.headers.get('content-type')).toContain('application/json');
    return response.json();
  }

  static expectHeaders(response: Response, headers: Record<string, string>) {
    for (const [key, value] of Object.entries(headers)) {
      expect(response.headers.get(key)).toBe(value);
    }
  }

  static expectCookie(response: Response, name: string, options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  } = {}) {
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(`${name}=`);
    
    if (options.httpOnly) {
      expect(setCookie).toContain('HttpOnly');
    }
    if (options.secure) {
      expect(setCookie).toContain('Secure');
    }
    if (options.sameSite) {
      expect(setCookie).toContain(`SameSite=${options.sameSite}`);
    }
  }
}

/**
 * Database mock for testing
 */
export class MockDatabase {
  private data: Map<string, any[]> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.data.clear();
    
    // Initialize with test data
    this.data.set('users', [
      { id: 1, name: 'John Doe', email: 'john@example.com', role: 'user' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'admin' },
    ]);
    
    this.data.set('posts', [
      { id: 1, title: 'Test Post', content: 'Test content', authorId: 1 },
    ]);
  }

  find(table: string, predicate?: (item: any) => boolean) {
    const items = this.data.get(table) || [];
    return predicate ? items.filter(predicate) : items;
  }

  findOne(table: string, predicate: (item: any) => boolean) {
    const items = this.data.get(table) || [];
    return items.find(predicate);
  }

  create(table: string, item: any) {
    const items = this.data.get(table) || [];
    const newItem = { id: Date.now(), ...item };
    items.push(newItem);
    this.data.set(table, items);
    return newItem;
  }

  update(table: string, id: number, updates: any) {
    const items = this.data.get(table) || [];
    const index = items.findIndex(item => item.id === id);
    
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      this.data.set(table, items);
      return items[index];
    }
    
    return null;
  }

  delete(table: string, id: number) {
    const items = this.data.get(table) || [];
    const index = items.findIndex(item => item.id === id);
    
    if (index !== -1) {
      const deleted = items.splice(index, 1)[0];
      this.data.set(table, items);
      return deleted;
    }
    
    return null;
  }
}

/**
 * Rate limit testing helper
 */
export class RateLimitTester {
  static async testRateLimit(
    handler: (request: ApiRequest) => Promise<Response>,
    maxRequests: number,
    windowMs: number = 60000
  ) {
    const requests: Promise<Response>[] = [];
    
    // Send requests up to the limit
    for (let i = 0; i < maxRequests; i++) {
      const request = createTestRequest('http://localhost/api/test');
      requests.push(handler(request));
    }
    
    const responses = await Promise.all(requests);
    
    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBeLessThan(400);
    });
    
    // Next request should be rate limited
    const rateLimitedRequest = createTestRequest('http://localhost/api/test');
    const rateLimitedResponse = await handler(rateLimitedRequest);
    
    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.headers.get('retry-after')).toBeTruthy();
  }
}

/**
 * CSRF testing helper
 */
export class CsrfTester {
  static async testCsrfProtection(
    handler: (request: ApiRequest) => Promise<Response>
  ) {
    // Request without CSRF token should fail
    const requestWithoutToken = createTestRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const responseWithoutToken = await handler(requestWithoutToken);
    expect(responseWithoutToken.status).toBe(403);
    
    // Request with valid CSRF token should succeed
    const requestWithToken = createTestRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-csrf-token',
      },
    });
    
    const responseWithToken = await handler(requestWithToken);
    expect(responseWithToken.status).toBeLessThan(400);
  }
}

/**
 * File upload testing helper
 */
export class FileUploadTester {
  static createMockFile(
    name: string,
    content: string,
    type: string = 'text/plain'
  ): File {
    const blob = new Blob([content], { type });
    return new File([blob], name, { type });
  }

  static createFormData(files: Record<string, File>, fields: Record<string, string> = {}): FormData {
    const formData = new FormData();
    
    // Add files
    for (const [key, file] of Object.entries(files)) {
      formData.append(key, file);
    }
    
    // Add fields
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
    
    return formData;
  }

  static async testFileUpload(
    handler: (request: ApiRequest) => Promise<Response>,
    files: Record<string, File>,
    fields: Record<string, string> = {}
  ) {
    const formData = this.createFormData(files, fields);
    
    const request = createTestRequest('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    const response = await handler(request);
    expect(response.status).toBeLessThan(400);
    
    return response;
  }
}

/**
 * Performance testing helper
 */
export class PerformanceTester {
  static async measureResponseTime(
    handler: (request: ApiRequest) => Promise<Response>,
    request: ApiRequest
  ): Promise<{ response: Response; duration: number }> {
    const start = performance.now();
    const response = await handler(request);
    const end = performance.now();
    
    return {
      response,
      duration: end - start,
    };
  }

  static async testConcurrency(
    handler: (request: ApiRequest) => Promise<Response>,
    concurrentRequests: number = 10
  ) {
    const requests = Array.from({ length: concurrentRequests }, (_, i) =>
      createTestRequest(`http://localhost/api/test?id=${i}`)
    );
    
    const start = performance.now();
    const responses = await Promise.all(
      requests.map(request => handler(request))
    );
    const end = performance.now();
    
    return {
      responses,
      totalDuration: end - start,
      averageDuration: (end - start) / concurrentRequests,
    };
  }
}

// Export all utilities
export {
  createTestRequest as createMockRequest, // Alias for backward compatibility
};

// Vitest setup helpers
export function setupApiTests() {
  const mockDb = new MockDatabase();
  
  beforeEach(() => {
    mockDb.reset();
  });
  
  return { mockDb };
}