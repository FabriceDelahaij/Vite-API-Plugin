# E2E Tests with Playwright

This directory contains end-to-end tests for the Vite API Routes Plugin using Playwright.

## Setup

Install Playwright:

```bash
npm install -D @playwright/test
npx playwright install
```

## Running Tests

Run all E2E tests:

```bash
npx playwright test
```

Run tests in UI mode:

```bash
npx playwright test --ui
```

Run specific test file:

```bash
npx playwright test tests/e2e/auth.spec.ts
```

Run tests in headed mode:

```bash
npx playwright test --headed
```

## Test Coverage

- **api-routes.spec.ts** - Basic API endpoint tests
- **auth.spec.ts** - Authentication and authorization flows
- **compression.spec.ts** - Compression feature tests
- **cache.spec.ts** - Caching functionality tests
- **cors.spec.ts** - CORS configuration tests
- **security.spec.ts** - Security features and headers
- **error-handling.spec.ts** - Error handling scenarios
- **modern-api.spec.ts** - Modern API route patterns
- **admin.spec.ts** - Admin route authorization
- **request-id.spec.ts** - Request ID tracking

## Configuration

The Playwright configuration is in `playwright.config.ts` and includes:

- Automatic dev server startup
- Base URL configuration
- Retry logic for CI
- HTML reporter
- Trace on first retry

## Writing New Tests

Use the Playwright Test API:

```typescript
import { test, expect } from '@playwright/test';

test('my test', async ({ request }) => {
  const response = await request.get('/api/endpoint');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data).toHaveProperty('field');
});
```

## CI Integration

Tests are configured to run in CI with:
- 2 retries on failure
- Single worker for stability
- Automatic server startup
