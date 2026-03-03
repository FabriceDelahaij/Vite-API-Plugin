import { test, expect } from '@playwright/test';

test.describe('CORS Configuration', () => {
  test('OPTIONS request returns CORS headers', async ({ request }) => {
    const response = await request.fetch('/api/hello', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
      },
    });
    
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBeDefined();
  });

  test('GET request includes CORS headers', async ({ request }) => {
    const response = await request.get('/api/hello', {
      headers: {
        'Origin': 'http://localhost:3000',
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBeDefined();
  });
});
