// Modern TypeScript logout endpoint
import type { ApiRequest, ApiSuccessResponse, ApiErrorResponse } from '../../../src/types/api';
import { createSuccessResponse, createErrorResponse } from '../../../src/utils/api-helpers';

interface LogoutResponse extends ApiSuccessResponse<{
  loggedOut: boolean;
  timestamp: string;
}> {}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    // Optional: Validate CSRF token for additional security
    // (CSRF is automatically validated by the plugin for POST requests)
    
    // Optional: Get user info before logout for logging
    const user = request.user;
    const ip = request.ip;
    
    // Log logout event (in production, log to your logging service)
    if (user) {
      console.log(`User logout: ${user.email} from IP: ${ip} at ${new Date().toISOString()}`);
    }

    const response: LogoutResponse = {
      success: true,
      data: {
        loggedOut: true,
        timestamp: new Date().toISOString(),
      },
      message: 'Logged out successfully',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Clear all auth-related cookies
        'Set-Cookie': [
          'auth_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
          'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
          'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
        ].join(', '),
      },
    });
  } catch (error) {
    console.error('Logout error:', error);
    
    return createErrorResponse(
      'Logout failed',
      500,
      'An error occurred during logout'
    );
  }
}

export async function GET(request: ApiRequest): Promise<Response> {
  // Return logout status or redirect info
  return createSuccessResponse({
    endpoint: '/api/auth/logout',
    method: 'POST',
    description: 'Use POST method to logout',
    requiresCsrf: true,
  }, 'Logout endpoint information');
}

export async function DELETE(request: ApiRequest): Promise<Response> {
  // Alternative logout method using DELETE (RESTful approach)
  try {
    const user = request.user;
    const ip = request.ip;
    
    // Log logout event
    if (user) {
      console.log(`User logout (DELETE): ${user.email} from IP: ${ip} at ${new Date().toISOString()}`);
    }

    const response: LogoutResponse = {
      success: true,
      data: {
        loggedOut: true,
        timestamp: new Date().toISOString(),
      },
      message: 'Session terminated successfully',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Clear all auth-related cookies
        'Set-Cookie': [
          'auth_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
          'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
          'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
        ].join(', '),
      },
    });
  } catch (error) {
    console.error('Session termination error:', error);
    
    return createErrorResponse(
      'Session termination failed',
      500,
      'An error occurred during session termination'
    );
  }
}
