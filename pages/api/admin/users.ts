// Modern TypeScript admin users endpoint with role-based access
import type { 
  ApiRequest, 
  User
} from '../../../src/types/api';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  parsePagination,
  createPaginationResponse 
} from '../../../src/utils/api-helpers';

interface AdminUser extends User {
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  status: 'active' | 'inactive' | 'suspended';
}

interface CreateUserRequest {
  name: string;
  email: string;
  role?: string;
  permissions?: string[];
}

interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  status?: 'active' | 'inactive' | 'suspended';
}

interface DeleteUserRequest {
  userId: string | number;
  reason?: string;
}

// Mock admin users data (in production, use database)
const adminUsers: AdminUser[] = [
  {
    id: 1,
    name: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    permissions: ['read', 'write', 'delete', 'admin'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastLogin: '2024-02-06T10:00:00Z',
    status: 'active',
  },
  {
    id: 2,
    name: 'user1',
    email: 'user1@example.com',
    role: 'user',
    permissions: ['read', 'write'],
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    lastLogin: '2024-02-05T15:30:00Z',
    status: 'active',
  },
  {
    id: 3,
    name: 'user2',
    email: 'user2@example.com',
    role: 'user',
    permissions: ['read'],
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    status: 'inactive',
  },
];

// Admin role check helper
function requireAdminRole(request: ApiRequest): boolean {
  const user = request.user;
  return user?.role === 'admin' || user?.permissions?.includes('admin') || false;
}

export async function GET(request: ApiRequest): Promise<Response> {
  // Check admin access
  if (!requireAdminRole(request)) {
    return createErrorResponse(
      'Insufficient permissions',
      403,
      'Admin role required to access user management'
    );
  }

  const url = new URL(request.url);
  const { page, limit, offset } = parsePagination(request.url);
  const search = url.searchParams.get('search') || '';
  const role = url.searchParams.get('role') || '';
  const status = url.searchParams.get('status') || '';

  // Filter users
  let filteredUsers = adminUsers;

  if (search) {
    filteredUsers = filteredUsers.filter(user =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (role) {
    filteredUsers = filteredUsers.filter(user => user.role === role);
  }

  if (status) {
    filteredUsers = filteredUsers.filter(user => user.status === status);
  }

  // Paginate results
  const total = filteredUsers.length;
  const paginatedUsers = filteredUsers.slice(offset, offset + limit);

  const response = createPaginationResponse(paginatedUsers, total, page, limit);

  return createSuccessResponse(response, 'Users retrieved successfully');
}

export async function POST(request: ApiRequest): Promise<Response> {
  // Check admin access
  if (!requireAdminRole(request)) {
    return createErrorResponse(
      'Insufficient permissions',
      403,
      'Admin role required to create users'
    );
  }

  try {
    const body: CreateUserRequest = await request.json();
    const { name, email, role = 'user', permissions = ['read'] } = body;

    // Validate required fields
    if (!name || !email) {
      return createErrorResponse(
        'Missing required fields',
        400,
        'Name and email are required'
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return createErrorResponse(
        'Invalid email format',
        400,
        'Please provide a valid email address'
      );
    }

    // Check if user already exists
    const existingUser = adminUsers.find(user => user.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return createErrorResponse(
        'User already exists',
        409,
        'A user with this email already exists'
      );
    }

    // Create new user
    const newUser: AdminUser = {
      id: Math.max(...adminUsers.map(u => Number(u.id)), 0) + 1,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      permissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
    };

    adminUsers.push(newUser);

    // Log admin action
    console.log(`Admin ${request.user?.email} created user: ${newUser.email}`);

    return createSuccessResponse(
      { user: newUser },
      'User created successfully',
      201
    );
  } catch (error) {
    return createErrorResponse(
      'Invalid request body',
      400,
      'Request body must be valid JSON'
    );
  }
}

export async function PUT(request: ApiRequest): Promise<Response> {
  // Check admin access
  if (!requireAdminRole(request)) {
    return createErrorResponse(
      'Insufficient permissions',
      403,
      'Admin role required to update users'
    );
  }

  try {
    const body: UpdateUserRequest & { userId: string | number } = await request.json();
    const { userId, name, email, role, permissions, status } = body;

    if (!userId) {
      return createErrorResponse(
        'Missing user ID',
        400,
        'User ID is required for updates'
      );
    }

    // Find user
    const userIndex = adminUsers.findIndex(user => user.id == userId);
    if (userIndex === -1) {
      return createErrorResponse(
        'User not found',
        404,
        `User with ID ${userId} not found`
      );
    }

    const user = adminUsers[userIndex]!; // Non-null assertion: we've verified userIndex !== -1

    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return createErrorResponse(
        'Invalid email format',
        400,
        'Please provide a valid email address'
      );
    }

    // Check for email conflicts
    if (email && email !== user.email) {
      const existingUser = adminUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== userId);
      if (existingUser) {
        return createErrorResponse(
          'Email already in use',
          409,
          'Another user already has this email address'
        );
      }
    }

    // Update user
    const updatedUser: AdminUser = {
      id: user.id,
      name: name?.trim() || user.name,
      email: email?.toLowerCase().trim() || user.email,
      role: role || user.role,
      permissions: permissions || user.permissions,
      status: status || user.status,
      createdAt: user.createdAt,
      updatedAt: new Date().toISOString(),
      lastLogin: user.lastLogin,
    };

    adminUsers[userIndex] = updatedUser;

    // Log admin action
    console.log(`Admin ${request.user?.email || 'unknown'} updated user: ${updatedUser.email}`);

    return createSuccessResponse(
      { user: updatedUser },
      'User updated successfully'
    );
  } catch (error) {
    return createErrorResponse(
      'Invalid request body',
      400,
      'Request body must be valid JSON'
    );
  }
}

export async function DELETE(request: ApiRequest): Promise<Response> {
  // Check admin access
  if (!requireAdminRole(request)) {
    return createErrorResponse(
      'Insufficient permissions',
      403,
      'Admin role required to delete users'
    );
  }

  try {
    const body: DeleteUserRequest = await request.json();
    const { userId, reason } = body;

    if (!userId) {
      return createErrorResponse(
        'Missing user ID',
        400,
        'User ID is required for deletion'
      );
    }

    // Find user
    const userIndex = adminUsers.findIndex(user => user.id == userId);
    if (userIndex === -1) {
      return createErrorResponse(
        'User not found',
        404,
        `User with ID ${userId} not found`
      );
    }

    const user = adminUsers[userIndex]!; // Non-null assertion: we've verified userIndex !== -1

    // Prevent self-deletion
    if (request.user?.id == userId) {
      return createErrorResponse(
        'Cannot delete self',
        400,
        'You cannot delete your own account'
      );
    }

    // Remove user
    adminUsers.splice(userIndex, 1);

    // Log admin action
    console.log(`Admin ${request.user?.email || 'unknown'} deleted user: ${user.email}${reason ? ` (Reason: ${reason})` : ''}`);

    return createSuccessResponse(
      { 
        deletedUser: { id: user.id, name: user.name, email: user.email },
        reason: reason || 'No reason provided',
      },
      'User deleted successfully'
    );
  } catch (error) {
    return createErrorResponse(
      'Invalid request body',
      400,
      'Request body must be valid JSON'
    );
  }
}
