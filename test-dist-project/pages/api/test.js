// Simple test API route to verify JSON responses work
export async function GET(request) {
  const response = {
    success: true,
    message: 'Test API route working!',
    timestamp: new Date().toISOString(),
    method: 'GET',
    url: request.url,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const response = {
    success: true,
    message: 'POST request received!',
    timestamp: new Date().toISOString(),
    method: 'POST',
    body,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}