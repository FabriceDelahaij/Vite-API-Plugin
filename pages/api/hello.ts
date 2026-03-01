// Modern TypeScript API route with App Router style
import type { ApiRequest, ApiSuccessResponse } from '../../src/types/api';

interface HelloResponse {
  message: string;
  method: string;
  query: Record<string, string>;
  timestamp: string;
  ip: string;
}

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  
  const response: ApiSuccessResponse<HelloResponse> = {
    success: true,
    data: {
      message: 'Hello from TypeScript API!',
      method: 'GET',
      query,
      timestamp: new Date().toISOString(),
      ip: request.ip,
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    // No JSON body or invalid JSON
    body = null;
  }

  const response: ApiSuccessResponse<HelloResponse & { body: any }> = {
    success: true,
    data: {
      message: 'Hello from TypeScript API!',
      method: 'POST',
      query,
      timestamp: new Date().toISOString(),
      ip: request.ip,
      body,
    },
    message: 'POST request received successfully',
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const response: ApiSuccessResponse<HelloResponse & { body: any }> = {
    success: true,
    data: {
      message: 'Hello from TypeScript API!',
      method: 'PUT',
      query,
      timestamp: new Date().toISOString(),
      ip: request.ip,
      body,
    },
    message: 'PUT request received successfully',
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);

  const response: ApiSuccessResponse<HelloResponse> = {
    success: true,
    data: {
      message: 'Hello from TypeScript API!',
      method: 'DELETE',
      query,
      timestamp: new Date().toISOString(),
      ip: request.ip,
    },
    message: 'DELETE request received successfully',
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
