/**
 * Example: Custom cache control
 * Demonstrates per-route cache TTL configuration
 */

// App Router style with custom cache headers
export async function GET(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'default';
  
  let data;
  let cacheControl;
  
  switch (type) {
    case 'static':
      // Static data - cache for 1 hour
      data = {
        type: 'static',
        message: 'This data rarely changes',
        timestamp: new Date().toISOString(),
      };
      cacheControl = 'public, max-age=3600';
      break;
      
    case 'dynamic':
      // Dynamic data - cache for 1 minute
      data = {
        type: 'dynamic',
        message: 'This data changes frequently',
        timestamp: new Date().toISOString(),
        random: Math.random(),
      };
      cacheControl = 'public, max-age=60';
      break;
      
    case 'private':
      // Private data - don't cache
      data = {
        type: 'private',
        message: 'This data is user-specific',
        user: request.headers.get('authorization') || 'anonymous',
        timestamp: new Date().toISOString(),
      };
      cacheControl = 'private, no-cache';
      break;
      
    default:
      // Default - cache for 5 minutes
      data = {
        type: 'default',
        message: 'Default caching behavior',
        timestamp: new Date().toISOString(),
      };
      cacheControl = 'public, max-age=300';
  }
  
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
    },
  });
}
