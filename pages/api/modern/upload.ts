// File upload example with modern syntax
import type { ApiRequest, ApiSuccessResponse, ApiErrorResponse } from '../../../src/types/api';

interface FileInfo {
  name: string;
  size: number;
  type: string;
}

interface UploadResponse {
  message: string;
  file: FileInfo;
}

export async function POST(request: ApiRequest): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        const response: ApiErrorResponse = {
          success: false,
          error: 'No file provided',
        };
        return new Response(JSON.stringify(response), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Process file (mock)
      const response: ApiSuccessResponse<UploadResponse> = {
        success: true,
        data: {
          message: 'File uploaded successfully',
          file: {
            name: file.name,
            size: file.size,
            type: file.type,
          },
        },
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const response: ApiErrorResponse = {
      success: false,
      error: 'Invalid content type',
    };

    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    const response: ApiErrorResponse = {
      success: false,
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET(request: ApiRequest): Promise<Response> {
  const response: ApiSuccessResponse<{
    message: string;
    supportedMethods: string[];
    maxFileSize: string;
  }> = {
    success: true,
    data: {
      message: 'Upload endpoint ready',
      supportedMethods: ['POST'],
      maxFileSize: '10MB',
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}