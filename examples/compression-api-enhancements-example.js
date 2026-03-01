/**
 * Compression API Enhancements Examples
 * 
 * Demonstrates:
 * 1. Route-level compression configuration
 * 2. X-Compression-Policy header for internal services
 */

import express from 'express';
import { createCompressionMiddleware, COMPRESSION_PRESETS } from '../src/lib/compression.js';

const app = express();

// Global compression middleware
const { middleware: compress } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
app.use(compress);

// ============================================================================
// 1. Route-Level Configuration Examples
// ============================================================================

// Example 1: Aggressive compression for large exports
app.get('/api/export/users', (req, res) => {
  res.locals.compression = {
    level: 9,  // Maximum compression
    algorithms: ['br', 'gzip'],  // Prefer brotli
    threshold: 512  // Compress smaller responses
  };
  
  // Simulate large dataset
  const users = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));
  
  res.json(users);
});

// Example 2: Fast compression for realtime endpoints
app.get('/api/realtime/metrics', (req, res) => {
  res.locals.compression = {
    level: 1,  // Fastest compression
    threshold: 10240,  // Only compress > 10KB
    algorithms: ['gzip']  // Skip brotli (faster)
  };
  
  res.json({
    timestamp: Date.now(),
    metrics: {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      requests: Math.floor(Math.random() * 1000)
    }
  });
});

// Example 3: Custom streaming threshold
app.get('/api/stream/logs', (req, res) => {
  res.locals.compression = {
    streaming: {
      enabled: true,
      threshold: 50 * 1024  // Stream at 50KB instead of default 100KB
    }
  };
  
  res.setHeader('Content-Type', 'text/plain');
  
  // Simulate streaming logs
  for (let i = 0; i < 1000; i++) {
    res.write(`[${new Date().toISOString()}] Log entry ${i}\n`);
  }
  res.end();
});

// Example 4: Disable security checks for public data
app.get('/api/public/config', (req, res) => {
  res.locals.compression = {
    security: {
      disableOnAuth: false,
      disableOnCookies: false,
      disableOnCSRF: false
    }
  };
  
  res.json({
    apiVersion: '1.0.0',
    features: ['compression', 'caching', 'streaming']
  });
});

// Example 5: Middleware-level configuration
app.use('/api/admin/*', (req, res, next) => {
  // Apply custom compression to all admin routes
  res.locals.compression = {
    level: 4,  // Fast compression for admin
    security: {
      disableOnAuth: true  // Extra security
    }
  };
  next();
});

app.get('/api/admin/dashboard', (req, res) => {
  res.json({
    users: 1000,
    revenue: 50000,
    orders: 250
  });
});

// Example 6: Conditional configuration based on client
app.get('/api/data', (req, res) => {
  const isMobile = req.headers['user-agent']?.includes('Mobile');
  
  if (isMobile) {
    // Aggressive compression for mobile (save bandwidth)
    res.locals.compression = {
      level: 9,
      algorithms: ['br', 'gzip']
    };
  } else {
    // Fast compression for desktop
    res.locals.compression = {
      level: 4,
      algorithms: ['gzip']
    };
  }
  
  res.json({ data: 'example' });
});

// ============================================================================
// 2. X-Compression-Policy Header Examples
// ============================================================================

// Example 7: Internal API endpoint (supports zstd)
app.get('/api/internal/metrics', (req, res) => {
  const compressionPolicy = req.headers['x-compression-policy'];
  
  if (compressionPolicy === 'internal') {
    // Internal service - use aggressive compression
    res.locals.compression = {
      level: 9,
      algorithms: ['zstd', 'br', 'gzip']  // Prefer zstd for internal
    };
  }
  
  res.json({
    timestamp: Date.now(),
    metrics: {
      requests: 10000,
      errors: 5,
      latency: 120
    }
  });
});

// Example 8: Microservice communication
app.get('/api/service/data', (req, res) => {
  // Check if request is from internal service
  const isInternal = req.headers['x-compression-policy'] === 'internal';
  
  res.json({
    source: 'service-a',
    internal: isInternal,
    data: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() }))
  });
});

// ============================================================================
// Client Examples
// ============================================================================

// Example 9: Internal service client
async function fetchInternalData() {
  const response = await fetch('http://localhost:3000/api/internal/metrics', {
    headers: {
      'Accept-Encoding': 'zstd, br, gzip',
      'X-Compression-Policy': 'internal'  // Enable zstd
    }
  });
  
  const data = await response.json();
  console.log('Compression:', response.headers.get('content-encoding'));
  console.log('Data:', data);
}

// Example 10: External client (no policy header)
async function fetchExternalData() {
  const response = await fetch('http://localhost:3000/api/data', {
    headers: {
      'Accept-Encoding': 'br, gzip'
      // No X-Compression-Policy header
    }
  });
  
  const data = await response.json();
  console.log('Compression:', response.headers.get('content-encoding'));
  console.log('Data:', data);
}

// ============================================================================
// Combined Example
// ============================================================================

// Example 11: Route with both features
app.get('/api/combined', (req, res) => {
  const isInternal = req.headers['x-compression-policy'] === 'internal';
  const isMobile = req.headers['user-agent']?.includes('Mobile');
  
  // Configure compression based on client type
  if (isInternal) {
    // Internal service: use zstd with aggressive compression
    res.locals.compression = {
      level: 9,
      algorithms: ['zstd', 'br'],
      threshold: 512
    };
  } else if (isMobile) {
    // Mobile: aggressive compression to save bandwidth
    res.locals.compression = {
      level: 9,
      algorithms: ['br', 'gzip'],
      threshold: 1024
    };
  } else {
    // Desktop: balanced compression
    res.locals.compression = {
      level: 6,
      algorithms: ['br', 'gzip']
    };
  }
  
  res.json({
    clientType: isInternal ? 'internal' : isMobile ? 'mobile' : 'desktop',
    data: Array.from({ length: 5000 }, (_, i) => ({ id: i }))
  });
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('\nTry these endpoints:');
  console.log('  GET /api/export/users - Aggressive compression');
  console.log('  GET /api/realtime/metrics - Fast compression');
  console.log('  GET /api/stream/logs - Custom streaming');
  console.log('  GET /api/internal/metrics - Internal service (use X-Compression-Policy: internal)');
  console.log('  GET /api/combined - Combined example');
  console.log('\nTest with curl:');
  console.log('  curl -H "Accept-Encoding: br, gzip" http://localhost:3000/api/export/users');
  console.log('  curl -H "Accept-Encoding: zstd, br" -H "X-Compression-Policy: internal" http://localhost:3000/api/internal/metrics');
});

export default app;
