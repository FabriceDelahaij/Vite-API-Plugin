// TypeScript example: Authentication with type safety
import type { 
  ApiRequest, 
  User, 
  ApiSuccessResponse, 
  ApiErrorResponse 
} from '../../../src/types/api';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse extends ApiSuccessResponse<{
  user: User;
  token: string;
  csrfToken: string;
}> {}

interface CsrfTokenResponse {
  csrfToken: string;
  message: string;
}

// Mock user store (in production, use a database)
const users = new Map<string, User & { password: string }>([
  ['admin@example.com', {
    id: 1,
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    password: 'password123', // In production, use hashed passwords
  }],
  ['user@example.com', {
    id: 2,
    name: 'Regular User',
    email: 'user@example.com',
    role: 'user',
    password: 'userpass',
  }],
]);

export async function GET(request: ApiRequest): Promise<Response> {
  // Return CSRF token for login form
  const csrfToken = request.getCsrfToken();
  
  const response: CsrfTokenResponse = {
    csrfToken,
    message: 'Use this token for login requests',
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const body: LoginRequest = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      const errorResponse: ApiErrorResponse = {
        error: 'Missing credentials',
        message: 'Email and password are required',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const errorResponse: ApiErrorResponse = {
        error: 'Invalid email format',
        field: 'email',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find user
    const user = users.get(email.toLowerCase());
    if (!user) {
      const errorResponse: ApiErrorResponse = {
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify password (in production, use proper password hashing)
    if (password !== user.password) {
      const errorResponse: ApiErrorResponse = {
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate tokens
    const csrfToken = request.getCsrfToken();
    const authToken = generateAuthToken(user); // Mock token generation

    // Remove password from user object
    const { password: _, ...safeUser } = user;

    const response: LoginResponse = {
      success: true,
      data: {
        user: safeUser,
        token: authToken,
        csrfToken,
      },
      message: 'Login successful',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `auth_token=${authToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`, // 7 days
      },
    });
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid request body',
      message: 'Request body must be valid JSON',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Mock token generation (in production, use JWT or similar)
function generateAuthToken(user: User): string {
  return `token_${user.id}_${Date.now()}`;
}