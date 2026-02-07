// TypeScript example: Protected route with authentication
import type { 
  ApiRequest, 
  User, 
  ApiSuccessResponse, 
  ApiErrorResponse 
} from '../../../src/types/api';

interface ProfileResponse extends ApiSuccessResponse<{
  user: User;
  lastLogin?: string;
  preferences?: UserPreferences;
}> {}

interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
  timezone: string;
}

interface UpdateProfileRequest {
  name?: string;
  email?: string;
  preferences?: Partial<UserPreferences>;
}

export async function GET(request: ApiRequest): Promise<Response> {
  // User is attached by auth middleware
  const user = request.user;
  
  if (!user) {
    const errorResponse: ApiErrorResponse = {
      error: 'Unauthorized',
      message: 'Authentication required',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Mock user preferences (in production, fetch from database)
  const preferences: UserPreferences = {
    theme: 'light',
    language: 'en',
    notifications: true,
    timezone: 'UTC',
  };

  const response: ProfileResponse = {
    success: true,
    data: {
      user,
      lastLogin: new Date().toISOString(),
      preferences,
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request: ApiRequest): Promise<Response> {
  // CSRF token is automatically validated for PUT requests
  const user = request.user;
  
  if (!user) {
    const errorResponse: ApiErrorResponse = {
      error: 'Unauthorized',
      message: 'Authentication required',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: UpdateProfileRequest = await request.json();
    const { name, email, preferences } = body;

    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const errorResponse: ApiErrorResponse = {
        error: 'Invalid email format',
        field: 'email',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate name if provided
    if (name && (name.length < 2 || name.length > 50)) {
      const errorResponse: ApiErrorResponse = {
        error: 'Invalid name length',
        message: 'Name must be between 2 and 50 characters',
        field: 'name',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate preferences if provided
    if (preferences) {
      if (preferences.theme && !['light', 'dark'].includes(preferences.theme)) {
        const errorResponse: ApiErrorResponse = {
          error: 'Invalid theme',
          message: 'Theme must be "light" or "dark"',
          field: 'preferences.theme',
        };
        
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Update user profile (in production, update database)
    const updatedUser: User = {
      ...user,
      name: name || user.name,
      email: email || user.email,
    };

    const updatedPreferences: UserPreferences = {
      theme: preferences?.theme || 'light',
      language: preferences?.language || 'en',
      notifications: preferences?.notifications ?? true,
      timezone: preferences?.timezone || 'UTC',
    };

    const response: ProfileResponse = {
      success: true,
      data: {
        user: updatedUser,
        preferences: updatedPreferences,
      },
      message: 'Profile updated successfully',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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