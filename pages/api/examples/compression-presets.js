/**
 * Compression Presets Example
 */

export async function GET(request) {
  const url = new URL(request.url);
  const size = url.searchParams.get('size') || 'medium';

  // Generate sample data
  const data = generateData(size);

  return new Response(JSON.stringify({
    success: true,
    data: {
      message: 'Compression Presets Demo',
      size,
      itemCount: data.length,
      items: data,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateData(size) {
  const counts = {
    tiny: 10,
    small: 100,
    medium: 1000,
    large: 5000,
  };

  const count = counts[size] || counts.medium;
  const items = [];

  for (let i = 0; i < count; i++) {
    items.push({
      id: i + 1,
      name: `Item ${i + 1}`,
      description: `Description for item ${i + 1} with some compressible text content.`,
      timestamp: new Date().toISOString(),
      metadata: {
        category: `Category ${(i % 5) + 1}`,
        tags: ['tag1', 'tag2', 'tag3'],
        active: Math.random() > 0.5,
      },
    });
  }

  return items;
}
