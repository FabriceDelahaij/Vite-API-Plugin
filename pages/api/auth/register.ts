// Modern TypeScript registration endpoint
import type { 
  ApiRequest, 
  User, 
  ApiSuccessResponse 
} from '../../../src/types/api';
import { 
  createErrorResponse, 
  createSuccessResponse, 
  validateRequired, 
  isValidEmail 
} from '../../../src/utils/api-helpers';

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword?: string;
}

interface RegisterResponse extends ApiSuccessResponse<{
  user: User;
  token: string;
  csrfToken: string;
}> {}

interface UserWithPassword extends User {
  password: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory user store (use database in production)
const users = new Map<string, UserWithPassword>();

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const body: RegisterRequest = await request.json();
    const { username, email, password, confirmPassword } = body;

    // Validate required fields
    const requiredFields = ['username', 'email', 'password'];
    const validationErrors = validateRequired(body, requiredFields);
    
    if (validationErrors.length > 0) {
      return createErrorResponse(
        'Missing required fields',
        400,
        `Required: ${validationErrors.map(e => e.field).join(', ')}`
      );
    }

    // Validate field lengths
    if (username.length < 3 || username.length > 30) {
      return createErrorResponse(
        'Invalid username length',
        400,
        'Username must be between 3 and 30 characters'
      );
    }

    // Validate username format (alphanumeric and underscore only)
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return createErrorResponse(
        'Invalid username format',
        400,
        'Username can only contain letters, numbers, and underscores'
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return createErrorResponse(
        'Invalid email format',
        400,
        'Please provide a valid email address'
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return createErrorResponse(
        'Password too weak',
        400,
        'Password must be at least 8 characters long'
      );
    }

    // Enhanced password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
      return createErrorResponse(
        'Password too weak',
        400,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    }

    // Validate password confirmation if provided
    if (confirmPassword && password !== confirmPassword) {
      return createErrorResponse(
        'Password mismatch',
        400,
        'Password and confirmation password do not match'
      );
    }

    // Check if user already exists
    if (users.has(email.toLowerCase())) {
      return createErrorResponse(
        'User already exists',
        409,
        'An account with this email address already exists'
      );
    }

    // Check if username is taken
    const existingUser = Array.from(users.values()).find(
      user => user.name.toLowerCase() === username.toLowerCase()
    );
    
    if (existingUser) {
      return createErrorResponse(
        'Username taken',
        409,
        'This username is already taken'
      );
    }

    // Hash password (in production, use proper password hashing like bcrypt)
    const hashedPassword = await hashPassword(password);

    // Create user
    const newUser: UserWithPassword = {
      id: users.size + 1,
      name: username,
      email: email.toLowerCase(),
      role: 'user',
      permissions: ['read', 'write'],
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    users.set(email.toLowerCase(), newUser);

    // Generate tokens
    const authToken = generateAuthToken(newUser);
    const csrfToken = request.getCsrfToken();

    // Remove password from response
    const { password: _, ...safeUser } = newUser;

    const response: RegisterResponse = {
      success: true,
      data: {
        user: safeUser,
        token: authToken,
        csrfToken,
      },
      message: 'User registered successfully',
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `auth_token=${authToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`, // 7 days
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    return createErrorResponse(
      'Registration failed',
      500,
      'An error occurred during registration. Please try again.'
    );
  }
}

export async function GET(request: ApiRequest): Promise<Response> {
  // Return registration form requirements
  return createSuccessResponse({
    requirements: {
      username: {
        minLength: 3,
        maxLength: 30,
        pattern: 'Letters, numbers, and underscores only',
      },
      email: {
        format: 'Valid email address required',
      },
      password: {
        minLength: 8,
        requirements: [
          'At least one uppercase letter',
          'At least one lowercase letter', 
          'At least one number',
          'At least one special character (@$!%*?&)',
        ],
      },
    },
    csrfToken: request.getCsrfToken(),
  }, 'Registration requirements');
}

// Mock password hashing (in production, use bcrypt or argon2)
async function hashPassword(password: string): Promise<string> {
  // This is a mock implementation - use proper hashing in production
  return `hashed_${password}_${Date.now()}`;
}

// Mock token generation (in production, use JWT)
function generateAuthToken(user: User): string {
  return `token_${user.id}_${Date.now()}`;
}

// Export users for login endpoint (in production, use database)
export { users };
