// Modern TypeScript protected route - requires authentication
import type { ApiRequest, User, ApiSuccessResponse, ApiErrorResponse } from '../../../src/types/api';

interface UserProfileResponse extends ApiSuccessResponse<{
  user: User;
}> {}

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

  const response: UserProfileResponse = {
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
