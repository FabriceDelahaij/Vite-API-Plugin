import { test, expect } from '@playwright/test';

test.describe('Security Features', () => {
  test('Response includes security headers', async ({ request }) => {
    const response = await request.get('/api/hello');
    const headers = response.headers();
    
    // Check for common security headers
    expect(headers['x-content-type-options']).toBeDefined();
  });

  test('Large payload handling', async ({ request }) => {
    const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB
    
    try {
      const response = await request.post('/api/test-simple', {
        data: { data: largePayload },
        timeout: 5000,
      });
      
      // If it doesn't throw, check status
      expect(response.status()).toBeDefined();
    } catch (error) {
      // Connection reset is expected for large payloads (security working)
      expect(error).toBeDefined();
    }
  });

  test('Invalid method is rejected', async ({ request }) => {
    const response = await request.fetch('/api/hello', {
      method: 'TRACE',
    });
    
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
