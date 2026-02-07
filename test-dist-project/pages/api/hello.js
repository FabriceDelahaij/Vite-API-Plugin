// Simplified version of hello.ts for testing (without TypeScript types)

export async function GET(request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  
  const response = {
    success: true,
    data: {
      message: 'Hello from API!',
      method: 'GET',
      query,
      timestamp: new Date().toISOString(),
      ip: request.ip || 'unknown',
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams);
  
  let body = null;
  try {
    body = await request.json();
  } catch {
    // No JSON body or invalid JSON
    body = null;
  }

  const response = {
    success: true,
    data: {
      message: 'Hello from API!',
      method: 'POST',
      query,
      timestamp: new Date().toISOString(),
      ip: request.ip || 'unknown',
      body,
    },
    message: 'POST request received successfully',
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}