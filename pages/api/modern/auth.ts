// Modern authentication example with CSRF
import type { ApiRequest, ApiSuccessResponse, ApiErrorResponse } from '../../../src/types/api';

interface AuthResponse {
  csrfToken: string;
  user?: {
    username: string;
    role: string;
  };
}

export async function GET(request: ApiRequest): Promise<Response> {
  // Get CSRF token for login form
  const csrfToken = request.getCsrfToken();
  
  const response: ApiSuccessResponse<{ csrfToken: string; message: string }> = {
    success: true,
    data: {
      csrfToken,
      message: 'Use this token for login',
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  const body = await request.json();
  const { username, password } = body;
  
  // Validate credentials
  if (username === 'admin' && password === 'password123') {
    const csrfToken = request.getCsrfToken();
    
    const response: ApiSuccessResponse<AuthResponse> = {
      success: true,
      data: {
        csrfToken,
        user: { username, role: 'admin' },
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=secure-token; HttpOnly; Secure; SameSite=Strict; Max-Age=3600',
      },
    });
  }
  
  const response: ApiErrorResponse = {
    success: false,
    error: 'Invalid credentials',
  };

  return new Response(JSON.stringify(response), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request: ApiRequest): Promise<Response> {
  // Logout endpoint
  const response: ApiSuccessResponse<{ message: string }> = {
    success: true,
    data: {
      message: 'Logged out successfully',
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  });
}