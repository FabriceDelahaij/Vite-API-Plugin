// Modern App Router style with dynamic routes
import type { ApiRequest, ApiSuccessResponse } from '../../../../src/types/api';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}

export async function GET(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];
  
  const response: ApiSuccessResponse<{ product: Product }> = {
    success: true,
    data: {
      product: {
        id,
        name: `Product ${id}`,
        price: 99.99,
        description: 'A great product',
      },
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];
  
  const body = await request.json();
  
  const response: ApiSuccessResponse<{
    message: string;
    product: Product & Record<string, any>;
  }> = {
    success: true,
    data: {
      message: `Product ${id} updated`,
      product: { id, ...body },
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request: ApiRequest): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];
  
  const response: ApiSuccessResponse<{ message: string }> = {
    success: true,
    data: {
      message: `Product ${id} deleted`,
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}