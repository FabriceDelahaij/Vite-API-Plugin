// Modern test endpoint to verify Sentry error tracking
import type { ApiRequest } from '../../src/types/api';

export async function GET(request: ApiRequest): Promise<Response> {
  return new Response(JSON.stringify({
    message: 'Error test endpoint',
    warning: 'Use POST to trigger a test error',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  // This error will be captured by Sentry
  throw new Error('Test error for Sentry - this is intentional for testing');
}