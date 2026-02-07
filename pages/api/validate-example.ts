// Modern input validation and sanitization example
import type { ApiRequest, ApiErrorResponse, ApiSuccessResponse } from '../../src/types/api';

interface ValidationData {
  email: string;
  age: number;
  username: string;
}

interface ValidationRules {
  email: string;
  age: string;
  username: string;
}

export async function POST(request: ApiRequest): Promise<Response> {
  const body = await request.json();
  const { email, age, username } = body;

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    const response: ApiErrorResponse = {
      success: false,
      error: 'Invalid email format',
      field: 'email',
    };
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate age
  const ageNum = parseInt(age, 10);
  if (isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
    const response: ApiErrorResponse = {
      success: false,
      error: 'Age must be between 0 and 150',
      field: 'age',
    };
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate username
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  if (!username || !usernameRegex.test(username)) {
    const response: ApiErrorResponse = {
      success: false,
      error: 'Username must be 3-20 characters (letters, numbers, underscore only)',
      field: 'username',
    };
    return new Response(JSON.stringify(response), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // All validations passed
  const response: ApiSuccessResponse<ValidationData> = {
    success: true,
    data: {
      email,
      age: ageNum,
      username,
    },
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(request: ApiRequest): Promise<Response> {
  const response: ApiSuccessResponse<{
    message: string;
    supportedMethods: string[];
    validationRules: ValidationRules;
  }> = {
    success: true,
    data: {
      message: 'Validation endpoint ready',
      supportedMethods: ['POST'],
      validationRules: {
        email: 'Valid email format required',
        age: 'Number between 0 and 150',
        username: '3-20 characters, letters/numbers/underscore only',
      },
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}