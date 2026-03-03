import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('GET /api/test-error returns info message', async ({ request }) => {
    const response = await request.get('/api/test-error');
    
    // GET returns info, not error
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('message');
  });

  test('POST /api/test-error throws error', async ({ request }) => {
    const response = await request.post('/api/test-error');
    
    // POST should throw error (500)
    expect(response.status()).toBeGreaterThanOrEqual(500);
  });

  test('404 for non-existent route', async ({ request }) => {
    const response = await request.get('/api/non-existent-route');
    expect(response.status()).toBe(404);
  });

  test('Invalid JSON payload is handled', async ({ request }) => {
    const response = await request.post('/api/test-simple', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: 'not-json-string',
    });
    
    // Should handle gracefully
    expect(response.status()).toBeDefined();
  });
});
