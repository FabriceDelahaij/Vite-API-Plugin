/**
 * Streaming Compression Example
 * 
 * Demonstrates how the compression middleware automatically switches
 * between buffered and streaming compression based on response size.
 * 
 * Features:
 * - Automatic streaming for large responses (>100KB by default)
 * - Buffered compression for smaller responses (cached)
 * - Memory-efficient handling of large payloads
 * - Chunked transfer encoding for streams
 */

import { createCompressionMiddleware } from '../../../src/lib/compression.js';

// Create compression middleware with custom streaming threshold
const { middleware: compress, compressionManager } = createCompressionMiddleware({
  streaming: {
    enabled: true,
    threshold: 50 * 1024, // Use streaming for responses > 50KB
  },
  level: 6, // Balanced compression level
});

export default async function handler(req, res) {
  // Apply compression middleware
  await new Promise((resolve, reject) => {
    compress(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const { size = 'small', format = 'json' } = req.query;

  // Generate different sized responses to demonstrate streaming
  let data;
  let description;

  switch (size) {
    case 'tiny':
      // 1KB - No compression (below threshold)
      data = generateData(100);
      description = '1KB response - Below compression threshold';
      break;

    case 'small':
      // 10KB - Buffered compression with caching
      data = generateData(1000);
      description = '10KB response - Buffered compression (cached)';
      break;

    case 'medium':
      // 50KB - Buffered compression
      data = generateData(5000);
      description = '50KB response - Buffered compression';
      break;

    case 'large':
      // 200KB - Streaming compression
      data = generateData(20000);
      description = '200KB response - Streaming compression (memory efficient)';
      break;

    case 'huge':
      // 1MB - Streaming compression
      data = generateData(100000);
      description = '1MB response - Streaming compression';
      break;

    default:
      data = generateData(1000);
      description = 'Default 10KB response';
  }

  // Get compression stats
  const stats = compressionManager.getStats();

  // Return response based on format
  if (format === 'json') {
    res.json({
      description,
      size: size,
      itemCount: data.length,
      stats: {
        totalRequests: stats.totalRequests,
        compressed: stats.compressed,
        compressionRate: stats.compressionRate,
        compressionRatio: stats.compressionRatio + '%',
        cacheHitRate: stats.cacheHitRate,
      },
      data: data,
    });
  } else {
    // Plain text format
    const text = data.map(item => 
      `${item.id}: ${item.name} - ${item.description}`
    ).join('\n');
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(text);
  }
}

/**
 * Generate sample data for testing
 */
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
