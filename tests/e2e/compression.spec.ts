import { test, expect } from '@playwright/test';

test.describe('Compression Features', () => {
  test('GET /api/examples/compression-test returns compressed data', async ({ request }) => {
    const response = await request.get('/api/examples/compression-test', {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeDefined();
  });

  test('GET /api/examples/compression-presets tests presets', async ({ request }) => {
    const response = await request.get('/api/examples/compression-presets');
    expect(response.ok()).toBeTruthy();
  });

  test('GET /api/examples/streaming-compression tests streaming', async ({ request }) => {
    const response = await request.get('/api/examples/streaming-compression');
    expect(response.ok()).toBeTruthy();
  });
});
