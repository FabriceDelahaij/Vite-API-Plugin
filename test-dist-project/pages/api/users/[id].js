// Dynamic route test
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  return new Response(JSON.stringify({
    message: `User ${id} details`,
    id,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}