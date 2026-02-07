// TypeScript example: Dynamic API route with type safety
import type { ApiRequest, User, ApiSuccessResponse, ApiErrorResponse } from '../../../src/types/api';

interface UserResponse extends ApiSuccessResponse<User> {}

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1]; // Extract [id] from URL
  
  // Validate ID
  if (!id || isNaN(Number(id))) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid user ID',
      field: 'id',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const user: User = {
    id: Number(id),
    name: `User ${id}`,
    email: `user${id}@example.com`,
    role: 'user',
  };
  
  const response: UserResponse = {
    success: true,
    data: user,
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
}

export async function PUT(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  if (!id || isNaN(Number(id))) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid user ID',
      field: 'id',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const body: UpdateUserRequest = await request.json();
    
    // Validate email if provided
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      const errorResponse: ApiErrorResponse = {
        error: 'Invalid email format',
        field: 'email',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const updatedUser: User = {
      id: Number(id),
      name: body.name || `User ${id}`,
      email: body.email || `user${id}@example.com`,
      role: body.role || 'user',
    };
    
    const response: UserResponse = {
      success: true,
      data: updatedUser,
      message: `User ${id} updated successfully`,
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid JSON body',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  if (!id || isNaN(Number(id))) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid user ID',
      field: 'id',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const response: ApiSuccessResponse<null> = {
    success: true,
    data: null,
    message: `User ${id} deleted successfully`,
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}