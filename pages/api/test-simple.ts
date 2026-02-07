// Simple test endpoint to verify JSON responses work
import type { ApiRequest } from '../../../src/types/api';

export async function GET(request: ApiRequest): Promise<Response> {
  const data = {
    message: 'Hello from GET endpoint',
    timestamp: new Date().toISOString(),
    method: 'GET',
    success: true,
  };

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  let body = null;
  
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const data = {
    message: 'Hello from POST endpoint',
    timestamp: new Date().toISOString(),
    method: 'POST',
    receivedBody: body,
    success: true,
  };

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}