/**
 * Compression Presets Example
 * 
 * Demonstrates how to use compression presets for different scenarios.
 * Presets provide pre-configured settings optimized for specific use cases.
 */

import { createCompressionMiddleware, COMPRESSION_PRESETS } from '../../../src/lib/compression.js';

// Choose preset based on environment or use case
const preset = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const { middleware: compress, compressionManager } = createCompressionMiddleware(preset);

export default async function handler(req, res) {
  // Apply compression middleware
  await new Promise((resolve, reject) => {
    compress(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const { preset: requestedPreset = 'production', size = 'medium' } = req.query;

  // Generate sample data
  const data = generateData(size);

  // Show preset information
  const presetInfo = COMPRESSION_PRESETS[requestedPreset] || COMPRESSION_PRESETS.production;
  const stats = compressionManager.getStats();

  res.json({
    message: 'Compression Presets Demo',
    currentPreset: preset,
    availablePresets: Object.keys(COMPRESSION_PRESETS),
    presetDetails: {
      [requestedPreset]: {
        threshold: presetInfo.threshold,
        level: presetInfo.level,
        streaming: presetInfo.streaming,
        algorithms: presetInfo.algorithms,
      },
    },
    stats: {
      totalRequests: stats.totalRequests,
      compressed: stats.compressed,
      compressionRate: stats.compressionRate,
      compressionRatio: stats.compressionRatio + '%',
      cacheHitRate: stats.cacheHitRate,
    },
    data,
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
