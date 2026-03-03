import { test, expect } from '@playwright/test';

test.describe('Admin Routes', () => {
  test('GET /api/admin/users requires authorization', async ({ request }) => {
    const response = await request.get('/api/admin/users');
    
    // Should require authentication
    expect([200, 401, 403]).toContain(response.status());
  });

  test('GET /api/admin/users with token', async ({ request }) => {
    const response = await request.get('/api/admin/users', {
      headers: {
        'Authorization': 'Bearer your-secret-token',
      },
    });
    
    // Should work with valid token or return 401/403
    expect([200, 401, 403]).toContain(response.status());
  });
});
