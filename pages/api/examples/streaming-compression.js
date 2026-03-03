/**
 * Streaming Compression Example
 */

export async function GET(request) {
  const url = new URL(request.url);
  const size = url.searchParams.get('size') || 'small';
  const format = url.searchParams.get('format') || 'json';

  // Generate different sized responses
  let data;
  let description;

  switch (size) {
    case 'tiny':
      data = generateData(100);
      description = '1KB response';
      break;
    case 'small':
      data = generateData(1000);
      description = '10KB response';
      break;
    case 'medium':
      data = generateData(5000);
      description = '50KB response';
      break;
    case 'large':
      data = generateData(20000);
      description = '200KB response';
      break;
    case 'huge':
      data = generateData(100000);
      description = '1MB response';
      break;
    default:
      data = generateData(1000);
      description = 'Default 10KB response';
  }

  if (format === 'json') {
    return new Response(JSON.stringify({
      success: true,
      data: {
        description,
        size,
        itemCount: data.length,
        items: data,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    const text = data.map(item => 
      `${item.id}: ${item.name} - ${item.description}`
    ).join('\n');
    
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

function generateData(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: i + 1,
      name: `Item ${i + 1}`,
      description: `This is a detailed description for item ${i + 1}. It contains enough text to make the response compressible.`,
      timestamp: new Date().toISOString(),
      metadata: {
        category: `Category ${(i % 10) + 1}`,
        tags: ['tag1', 'tag2', 'tag3'],
        price: (Math.random() * 1000).toFixed(2),
        inStock: Math.random() > 0.5,
      },
    });
  }
  return items;
}
