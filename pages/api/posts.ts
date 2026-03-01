// TypeScript example: CRUD operations with pagination
import type { 
  ApiRequest, 
  PaginatedResponse, 
  ApiSuccessResponse, 
  ApiErrorResponse,
  PaginationParams 
} from '../../src/types/api';

interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

// Mock data store (in production, use a database)
const posts: Post[] = [
  {
    id: 1,
    title: 'First Post',
    content: 'Hello World',
    author: 'John Doe',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    title: 'Second Post',
    content: 'Vite is awesome',
    author: 'Jane Smith',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  
  // Parse pagination parameters
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  const search = url.searchParams.get('search') || '';
  
  // Validate pagination parameters
  if (page < 1 || limit < 1 || limit > 100) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid pagination parameters',
      message: 'Page must be >= 1, limit must be between 1 and 100',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Filter posts by search term
  let filteredPosts = posts;
  if (search) {
    filteredPosts = posts.filter(post => 
      post.title.toLowerCase().includes(search.toLowerCase()) ||
      post.content.toLowerCase().includes(search.toLowerCase())
    );
  }
  
  // Calculate pagination
  const total = filteredPosts.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginatedPosts = filteredPosts.slice(offset, offset + limit);
  
  const response: PaginatedResponse<Post> = {
    data: paginatedPosts,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface CreatePostRequest {
  title: string;
  content: string;
  author: string;
}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const body: CreatePostRequest = await request.json();
    const { title, content, author } = body;
    
    // Validate required fields
    const errors: string[] = [];
    if (!title || title.trim().length === 0) errors.push('Title is required');
    if (!content || content.trim().length === 0) errors.push('Content is required');
    if (!author || author.trim().length === 0) errors.push('Author is required');
    
    if (errors.length > 0) {
      const errorResponse: ApiErrorResponse = {
        error: 'Validation failed',
        message: errors.join(', '),
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Validate field lengths
    if (title.length > 200) {
      const errorResponse: ApiErrorResponse = {
        error: 'Title too long',
        message: 'Title must be 200 characters or less',
        field: 'title',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (content.length > 10000) {
      const errorResponse: ApiErrorResponse = {
        error: 'Content too long',
        message: 'Content must be 10,000 characters or less',
        field: 'content',
      };
      
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Create new post
    const newPost: Post = {
      id: Math.max(...posts.map(p => p.id), 0) + 1,
      title: title.trim(),
      content: content.trim(),
      author: author.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    posts.push(newPost);
    
    const response: ApiSuccessResponse<Post> = {
      success: true,
      data: newPost,
      message: 'Post created successfully',
    };
    
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      error: 'Invalid JSON body',
      message: 'Request body must be valid JSON',
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}