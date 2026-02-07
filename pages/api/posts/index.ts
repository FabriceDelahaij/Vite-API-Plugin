// Modern TypeScript posts endpoint with App Router style
import type { ApiRequest, ApiSuccessResponse, ApiErrorResponse } from '../../../src/types/api';

interface Post {
  id: number;
  title: string;
  content: string;
  author?: string;
  createdAt: string;
}

// In-memory store (use database in production)
const posts: Post[] = [
  {
    id: 1,
    title: 'First Post',
    content: 'Hello World',
    author: 'John Doe',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    title: 'Second Post',
    content: 'TypeScript is awesome',
    author: 'Jane Smith',
    createdAt: new Date().toISOString(),
  },
];

export async function GET(request: ApiRequest): Promise<Response> {
  const response: ApiSuccessResponse<{ posts: Post[] }> = {
    success: true,
    data: { posts },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { title, content, author } = body as Partial<Post>;

    // Validate input
    if (!title || !content) {
      const errorResponse: ApiErrorResponse = {
        error: 'Missing required fields',
        message: 'Title and content are required',
      };

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const newPost: Post = {
      id: posts.length + 1,
      title,
      content,
      author: author || 'Anonymous',
      createdAt: new Date().toISOString(),
    };

    posts.push(newPost);

    const response: ApiSuccessResponse<{ post: Post }> = {
      success: true,
      data: { post: newPost },
      message: 'Post created successfully',
    };

    return new Response(JSON.stringify(response), {
      status: 201,
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
