/**
 * Quick test to verify zstd compression works
 */

import { CacheManager } from './src/lib/cache.js';
import { CompressionManager, COMPRESSION_PRESETS } from './src/lib/compression.js';

async function testZstdCache() {
  console.log('Testing Zstd Cache...\n');
  
  const cache = new CacheManager({
    type: 'memory',
    compressionThreshold: 100, // Low threshold for testing
    compressionAlgorithm: 'zstd',
    zstdLevel: 3,
  });

  // Test data
  const testData = {
    id: 123,
    name: 'Test User',
    data: 'x'.repeat(1000), // Large string to trigger compression
  };

  // Set cache
  await cache.set('test:key', testData, 300);
  console.log('✓ Data cached with zstd compression');

  // Get cache
  const retrieved = await cache.get('test:key');
  console.log('✓ Data retrieved and decompressed');
  console.log('  Match:', JSON.stringify(retrieved) === JSON.stringify(testData));

  // Get stats
  const stats = await cache.getStats();
  console.log('\nCache Stats:');
  console.log('  Size:', stats.size);
  console.log('  Compression Algorithm:', stats.compressionAlgorithm);
  console.log('  Entries:', stats.entries.length);
  if (stats.entries.length > 0) {
    console.log('  First Entry:');
    console.log('    - Compressed:', stats.entries[0].compressed);
    console.log('    - Algorithm:', stats.entries[0].compressionAlgorithm);
    console.log('    - Size:', stats.entries[0].size, 'bytes');
  }
}

async function testZstdCompression() {
  console.log('\n\nTesting Zstd Compression Manager...\n');
  
  const manager = new CompressionManager(COMPRESSION_PRESETS.zstd);
  
  // Test data
  const testData = { message: 'Hello World! '.repeat(100) };
  const buffer = Buffer.from(JSON.stringify(testData));
  
  console.log('Original size:', buffer.length, 'bytes');
  
  // Test zstd compression
  const result = await manager.compressBuffer(buffer, 'zstd');
  
  if (result.algorithm === 'zstd') {
    console.log('✓ Zstd compression successful');
    console.log('  Compressed size:', result.compressedSize, 'bytes');
    console.log('  Compression ratio:', result.ratio + '%');
    console.log('  Savings:', result.originalSize - result.compressedSize, 'bytes');
  } else {
    console.log('✗ Compression failed or not beneficial');
  }
  
  // Get stats
  const stats = manager.getStats();
  console.log('\nCompression Stats:');
  console.log('  Total requests:', stats.totalRequests);
  console.log('  Compressed:', stats.compressed);
  console.log('  Cache size by algorithm:', stats.cacheSizeByAlgorithm);
}

async function testAlgorithmComparison() {
  console.log('\n\nComparing Compression Algorithms...\n');
  
  const manager = new CompressionManager({
    algorithms: ['zstd', 'br', 'gzip', 'deflate'],
    zstdLevel: 3,
    level: 6,
  });
  
  const testData = { data: 'Test data '.repeat(200) };
  const buffer = Buffer.from(JSON.stringify(testData));
  
  console.log('Original size:', buffer.length, 'bytes\n');
  
  for (const algorithm of ['zstd', 'br', 'gzip', 'deflate']) {
    const start = Date.now();
    const result = await manager.compressBuffer(buffer, algorithm);
    const time = Date.now() - start;
    
    if (result.algorithm) {
      console.log(`${algorithm.toUpperCase()}:`);
      console.log(`  Size: ${result.compressedSize} bytes (${result.ratio}% reduction)`);
      console.log(`  Time: ${time}ms`);
    }
  }
}

// Run tests
(async () => {
  try {
    await testZstdCache();
    await testZstdCompression();
    await testAlgorithmComparison();
    console.log('\n✓ All tests completed successfully!');
    process.exit(0); // Force exit
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
})();
