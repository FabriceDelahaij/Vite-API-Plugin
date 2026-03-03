import { test, expect } from '@playwright/test';

test.describe('Request ID Tracking', () => {
  test('GET /api/examples/request-id-demo includes request ID', async ({ request }) => {
    const response = await request.get('/api/examples/request-id-demo');
    expect(response.ok()).toBeTruthy();
    
    const headers = response.headers();
    expect(headers['x-request-id']).toBeDefined();
  });

  test('Custom request ID is preserved', async ({ request }) => {
    const customId = 'custom-test-id-123';
    const response = await request.get('/api/hello', {
      headers: {
        'X-Request-ID': customId,
      },
    });
    
    expect(response.ok()).toBeTruthy();
    const headers = response.headers();
    expect(headers['x-request-id']).toBe(customId);
  });
});
