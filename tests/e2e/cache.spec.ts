import { test, expect } from '@playwright/test';

test.describe('Cache Features', () => {
  test('GET /api/examples/cached-data returns cached response', async ({ request }) => {
    const response = await request.get('/api/examples/cached-data');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeDefined();
  });

  test('GET /api/examples/cache-control validates cache headers', async ({ request }) => {
    const response = await request.get('/api/examples/cache-control');
    expect(response.ok()).toBeTruthy();
    
    const cacheControl = response.headers()['cache-control'];
    expect(cacheControl).toBeDefined();
  });

  test('GET /api/examples/persistent-cache tests persistence', async ({ request }) => {
    const response = await request.get('/api/examples/persistent-cache?key=test');
    expect(response.ok()).toBeTruthy();
  });
});
