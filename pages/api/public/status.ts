// Modern public endpoint (no auth required)
import type { ApiRequest, ApiSuccessResponse } from '../../../src/types/api';

interface StatusData {
  status: string;
  timestamp: string;
  version: string;
  uptime: number;
}

export async function GET(request: ApiRequest): Promise<Response> {
  const response: ApiSuccessResponse<StatusData> = {
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}