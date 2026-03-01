/**
 * Per-Response TTL Example
 * Demonstrates how to use different cache durations for different endpoints
 */

import express from 'express';
import { createCompressionMiddleware } from '../src/lib/compression.js';

const app = express();

// Create compression middleware with default 5-minute TTL
const { middleware: compress, compressionManager } = createCompressionMiddleware({
  cache: {
    enabled: true,
    maxSize: 1000,
    ttl: 5 * 60 * 1000, // 5 minutes default
  },
});

app.use(compress);

// Example 1: Health check - cache for 30 seconds
app.get('/api/health', (req, res) => {
  res.locals.cacheTTL = 30_000; // 30 seconds
  
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Example 2: Metrics - cache for 1 minute
app.get('/api/metrics', (req, res) => {
  res.locals.cacheTTL = 60_000; // 1 minute
  
  res.json({
    requests: Math.floor(Math.random() * 10000),
    errors: Math.floor(Math.random() * 100),
    latency: Math.floor(Math.random() * 500),
  });
});

// Example 3: Configuration - cache for 10 minutes
app.get('/api/config', (req, res) => {
  res.locals.cacheTTL = 10 * 60 * 1000; // 10 minutes
  
  res.json({
    apiVersion: '1.0',
    features: ['compression', 'caching', 'per-response-ttl'],
    limits: {
      maxUpload: 10485760,
      maxRequests: 1000,
    },
  });
});

// Example 4: Categories - cache for 30 minutes
app.get('/api/categories', (req, res) => {
  res.locals.cacheTTL = 30 * 60 * 1000; // 30 minutes
  
  res.json([
    { id: 1, name: 'Electronics' },
    { id: 2, name: 'Books' },
    { id: 3, name: 'Clothing' },
  ]);
});

// Example 5: User profile - don't cache (personalized)
app.get('/api/me', (req, res) => {
  res.locals.cacheTTL = 0; // Don't cache
  
  // Simulate user data
  res.json({
    id: 123,
    name: 'John Doe',
    email: 'john@example.com',
    preferences: {
      theme: 'dark',
      language: 'en',
    },
  });
});

// Example 6: Authentication - don't cache (sensitive)
app.post('/api/auth/login', (req, res) => {
  res.locals.cacheTTL = 0; // Don't cache
  
  res.json({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    expiresIn: 3600,
  });
});

// Example 7: Middleware-based TTL for route groups
app.use('/api/public/*', (req, res, next) => {
  res.locals.cacheTTL = 15 * 60 * 1000; // 15 minutes for all public routes
  next();
});

app.get('/api/public/announcements', (req, res) => {
  res.json([
    { id: 1, title: 'New Feature Released', date: '2024-01-15' },
    { id: 2, title: 'Maintenance Window', date: '2024-01-20' },
  ]);
});

app.get('/api/public/faq', (req, res) => {
  res.json([
    { question: 'How do I reset my password?', answer: '...' },
    { question: 'What payment methods do you accept?', answer: '...' },
  ]);
});

// Example 8: Dynamic TTL based on data
app.get('/api/products/:id', (req, res) => {
  // Simulate product data
  const product = {
    id: req.params.id,
    name: 'Sample Product',
    price: 99.99,
    views: Math.floor(Math.random() * 20000),
  };
  
  // Popular products: cache longer
  if (product.views > 10000) {
    res.locals.cacheTTL = 30 * 60 * 1000; // 30 minutes
  }
  // Regular products: cache shorter
  else {
    res.locals.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }
  
  res.json(product);
});

// Example 9: Time-based TTL
app.get('/api/news', (req, res) => {
  const hour = new Date().getHours();
  
  // Peak hours (9am-5pm): shorter TTL for fresh content
  if (hour >= 9 && hour <= 17) {
    res.locals.cacheTTL = 2 * 60 * 1000; // 2 minutes
  }
  // Off-peak: longer TTL
  else {
    res.locals.cacheTTL = 15 * 60 * 1000; // 15 minutes
  }
  
  res.json([
    { id: 1, title: 'Breaking News', timestamp: Date.now() },
    { id: 2, title: 'Tech Update', timestamp: Date.now() - 3600000 },
  ]);
});

// Stats endpoint to monitor cache performance
app.get('/api/stats', (req, res) => {
  const stats = compressionManager.getStats();
  
  res.json({
    cache: {
      responseCache: {
        size: stats.responseCacheSize,
        hits: stats.responseCacheHits,
        misses: stats.responseCacheMisses,
        hitRate: stats.responseCacheHitRate,
        memory: stats.responseCacheMemoryFormatted,
      },
      compressionCache: {
        size: stats.cacheSize,
        hits: stats.cacheHits,
        misses: stats.cacheMisses,
        hitRate: stats.cacheHitRate,
        memory: stats.cacheMemoryFormatted,
      },
      total: {
        memory: stats.totalCacheMemoryFormatted,
      },
    },
    compression: {
      totalRequests: stats.totalRequests,
      compressed: stats.compressed,
      uncompressed: stats.uncompressed,
      compressionRatio: stats.compressionRatio + '%',
    },
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('  GET  /api/health          - Health check (30s TTL)');
  console.log('  GET  /api/metrics         - Metrics (1m TTL)');
  console.log('  GET  /api/config          - Configuration (10m TTL)');
  console.log('  GET  /api/categories      - Categories (30m TTL)');
  console.log('  GET  /api/me              - User profile (no cache)');
  console.log('  POST /api/auth/login      - Login (no cache)');
  console.log('  GET  /api/public/*        - Public routes (15m TTL)');
  console.log('  GET  /api/products/:id    - Products (dynamic TTL)');
  console.log('  GET  /api/news            - News (time-based TTL)');
  console.log('  GET  /api/stats           - Cache statistics');
  console.log('\n💡 Try making requests with Accept-Encoding: gzip, br');
  console.log('   Watch cache hit rates improve with per-response TTL!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  compressionManager.destroy();
  process.exit(0);
});
