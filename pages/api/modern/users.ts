// Modern TypeScript API route with comprehensive user management
import type { 
  ApiRequest, 
  User, 
  ApiSuccessResponse, 
  ApiErrorResponse,
  PaginatedResponse 
} from '../../../src/types/api';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  parsePagination,
  createPaginationResponse,
  isValidEmail 
} from '../../../src/utils/api-helpers';

interface PublicUser extends User {
  createdAt: string;
  updatedAt: string;
  bio?: string;
  avatar?: string;
}

interface CreateUserRequest {
  name: string;
  email: string;
  bio?: string;
}

interface UpdateUserRequest {
  id: string | number;
  name?: string;
  email?: string;
  bio?: string;
}

// Mock users data (in production, use database)
const users: PublicUser[] = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    bio: 'Software developer passionate about TypeScript',
    avatar: 'https://example.com/avatars/john.jpg',
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'user',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    bio: 'UI/UX designer and frontend enthusiast',
    avatar: 'https://example.com/avatars/jane.jpg',
  },
];

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const { page, limit, offset } = parsePagination(request.url);
  const search = url.searchParams.get('search') || '';
  const role = url.searchParams.get('role') || '';

  // Filter users
  let filteredUsers = users;

  if (search) {
    filteredUsers = filteredUsers.filter(user =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.bio?.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (role) {
    filteredUsers = filteredUsers.filter(user => user.role === role);
  }

  // Remove sensitive information for public endpoint
  const publicUsers = filteredUsers.map(({ email, ...user }) => ({
    ...user,
    email: user.email.replace(/(.{2}).*@/, '$1***@'), // Mask email
  }));

  // Paginate results
  const total = publicUsers.length;
  const paginatedUsers = publicUsers.slice(offset, offset + limit);

  const response = createPaginationResponse(paginatedUsers, total, page, limit);

  return createSuccessResponse(response, 'Users retrieved successfully');
}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const body: CreateUserRequest = await request.json();
    const { name, email, bio } = body;

    // Validate required fields
    if (!name || !email) {
      return createErrorResponse(
        'Missing required fields',
        400,
        'Name and email are required'
      );
    }

    // Validate name length
    if (name.length < 2 || name.length > 50) {
      return createErrorResponse(
        'Invalid name length',
        400,
        'Name must be between 2 and 50 characters'
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

    // Validate bio length if provided
    if (bio && bio.length > 500) {
      return createErrorResponse(
        'Bio too long',
        400,
        'Bio must be 500 characters or less'
      );
    }

    // Check if user already exists
    const existingUser = users.find(user => user.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return createErrorResponse(
        'User already exists',
        409,
        'A user with this email already exists'
      );
    }

    // Create new user
    const newUser: PublicUser = {
      id: Math.max(...users.map(u => Number(u.id)), 0) + 1,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bio: bio?.trim() || undefined,
    };

    users.push(newUser);

    // Return user without sensitive info
    const { email: _, ...publicUser } = newUser;

    return createSuccessResponse(
      { user: publicUser },
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
  try {
    const body: UpdateUserRequest = await request.json();
    const { id, name, email, bio } = body;

    if (!id) {
      return createErrorResponse(
        'Missing user ID',
        400,
        'User ID is required for updates'
      );
    }

    // Find user
    const userIndex = users.findIndex(user => user.id == id);
    if (userIndex === -1) {
      return createErrorResponse(
        'User not found',
        404,
        `User with ID ${id} not found`
      );
    }

    const user = users[userIndex];

    // Validate name if provided
    if (name && (name.length < 2 || name.length > 50)) {
      return createErrorResponse(
        'Invalid name length',
        400,
        'Name must be between 2 and 50 characters'
      );
    }

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      return createErrorResponse(
        'Invalid email format',
        400,
        'Please provide a valid email address'
      );
    }

    // Validate bio if provided
    if (bio && bio.length > 500) {
      return createErrorResponse(
        'Bio too long',
        400,
        'Bio must be 500 characters or less'
      );
    }

    // Check for email conflicts
    if (email && email !== user.email) {
      const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== id);
      if (existingUser) {
        return createErrorResponse(
          'Email already in use',
          409,
          'Another user already has this email address'
        );
      }
    }

    // Update user
    const updatedUser: PublicUser = {
      ...user,
      name: name?.trim() || user.name,
      email: email?.toLowerCase().trim() || user.email,
      bio: bio?.trim() || user.bio,
      updatedAt: new Date().toISOString(),
    };

    users[userIndex] = updatedUser;

    // Return user without sensitive info
    const { email: _, ...publicUser } = updatedUser;

    return createSuccessResponse(
      { user: publicUser },
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
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return createErrorResponse(
      'Missing user ID',
      400,
      'User ID is required for deletion'
    );
  }

  // Find user
  const userIndex = users.findIndex(user => user.id == id);
  if (userIndex === -1) {
    return createErrorResponse(
      'User not found',
      404,
      `User with ID ${id} not found`
    );
  }

  const user = users[userIndex];

  // Remove user
  users.splice(userIndex, 1);

  return createSuccessResponse(
    { 
      deletedUser: { id: user.id, name: user.name },
    },
    'User deleted successfully'
  );
}