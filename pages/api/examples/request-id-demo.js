/**
 * Request ID Demo API
 */

export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || 'generated-' + Date.now();
  
  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return new Response(JSON.stringify({
    success: true,
    data: {
      message: 'Request ID demo',
      requestId,
      timestamp: new Date().toISOString(),
      headers: {
        'X-Request-ID': requestId,
      },
    },
  }), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    },
  });
}
