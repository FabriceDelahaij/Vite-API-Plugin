import { test, expect } from '@playwright/test';

test.describe('API Routes - Basic Endpoints', () => {
  test('GET /api/hello returns success', async ({ request }) => {
    const response = await request.get('/api/hello');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toHaveProperty('success');
    expect(json).toHaveProperty('data');
    expect(json.data).toHaveProperty('message');
  });

  test('GET /api/test-simple returns data', async ({ request }) => {
    const response = await request.get('/api/test-simple');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeDefined();
  });

  test('GET /api/public/status returns public data', async ({ request }) => {
    const response = await request.get('/api/public/status');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toHaveProperty('success');
    expect(json.data).toHaveProperty('status');
  });
});

test.describe('API Routes - Posts', () => {
  test('GET /api/posts returns posts list', async ({ request }) => {
    const response = await request.get('/api/posts');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBeTruthy();
  });

  test('GET /api/posts/index returns posts', async ({ request }) => {
    const response = await request.get('/api/posts/');
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('API Routes - Dynamic Routes', () => {
  test('GET /api/users/[id] returns user data', async ({ request }) => {
    const response = await request.get('/api/users/123');
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json).toHaveProperty('success');
    expect(json.data).toHaveProperty('id');
  });
});
