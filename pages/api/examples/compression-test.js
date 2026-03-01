/**
 * Example: Compression test endpoint
 * Demonstrates automatic response compression
 */

// Generate large JSON response for compression testing
function generateLargeData(size = 1000) {
  return Array.from({ length: size }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    description: 'This is a long description that will compress well. '.repeat(10),
    price: Math.random() * 1000,
    category: ['Electronics', 'Clothing', 'Books', 'Food'][i % 4],
    tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
    metadata: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      views: Math.floor(Math.random() * 10000),
      likes: Math.floor(Math.random() * 1000),
    },
  }));
}

export async function GET(request) {
  const url = new URL(request.url);
  const size = parseInt(url.searchParams.get('size')) || 1000;
  const data = generateLargeData(size);

  // Response will be automatically compressed if:
  // 1. Client sends Accept-Encoding header (br, gzip, deflate)
  // 2. Response size > threshold (default 1KB)
  // 3. Content-Type is compressible (application/json)

  return new Response(JSON.stringify({
    message: 'Compression test data',
    count: data.length,
    uncompressedSize: JSON.stringify(data).length,
    note: 'Check response headers for Content-Encoding and X-Compression-Ratio',
    data,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
