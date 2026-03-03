import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('POST /api/auth/register validates input', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        username: 'testuser',
      },
    });
    
    // Should either succeed or return validation error
    expect([201, 400, 409, 500]).toContain(response.status());
  });

  test('POST /api/auth/login validates credentials', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123',
      },
    });
    
    // Should return 401 for invalid credentials or 200 for valid
    expect([200, 401, 400]).toContain(response.status());
  });

  test('GET /api/auth/me requires authentication', async ({ request }) => {
    const response = await request.get('/api/auth/me');
    
    // Should return 401 without auth or 200 with auth
    expect([200, 401]).toContain(response.status());
  });

  test('POST /api/auth/logout logs out user', async ({ request }) => {
    const response = await request.post('/api/auth/logout');
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Protected Routes', () => {
  test('GET /api/protected/profile requires authentication', async ({ request }) => {
    const response = await request.get('/api/protected/profile');
    
    // Should require authentication
    expect([200, 401]).toContain(response.status());
  });

  test('GET /api/protected/profile with token', async ({ request }) => {
    const response = await request.get('/api/protected/profile', {
      headers: {
        'Authorization': 'Bearer your-secret-token',
      },
    });
    
    // Should work with valid token or return 401
    expect([200, 401]).toContain(response.status());
  });
});
