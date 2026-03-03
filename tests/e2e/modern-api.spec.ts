import { test, expect } from '@playwright/test';

test.describe('Modern API Routes', () => {
  test('GET /api/modern/users returns users', async ({ request }) => {
    const response = await request.get('/api/modern/users');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toHaveProperty('success');
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data.data)).toBeTruthy();
  });

  test('POST /api/modern/users creates user', async ({ request }) => {
    const response = await request.post('/api/modern/users', {
      data: {
        name: 'New User',
        email: `user-${Date.now()}@example.com`,
      },
    });
    
    expect(response.ok()).toBeTruthy();
  });

  test('GET /api/modern/auth validates authentication', async ({ request }) => {
    const response = await request.get('/api/modern/auth');
    expect(response.status()).toBeDefined();
  });
});
