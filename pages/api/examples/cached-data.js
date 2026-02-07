/**
 * Example: Cached API endpoint
 * Demonstrates response caching for expensive operations
 */

// Simulate expensive database query
async function fetchExpensiveData() {
  console.log('⏱️  Fetching expensive data...');
  
  // Simulate 2 second delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    data: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
      value: Math.random() * 1000,
      timestamp: new Date().toISOString(),
    })),
    generatedAt: new Date().toISOString(),
    expensive: true,
  };
}

export async function GET(request) {
  try {
    // This will be cached for 5 minutes (default TTL)
    // Subsequent requests will be served from cache instantly
    const data = await fetchExpensiveData();
    
    return new Response(JSON.stringify({
      ...data,
      cached: request.headers.get('x-cache') === 'HIT',
      cacheKey: request.headers.get('x-cache-key'),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
