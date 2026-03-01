/**
 * Compression Security Examples
 * 
 * Demonstrates route-level compression control for security-sensitive endpoints
 */

import express from 'express';
import { createCompressionMiddleware, COMPRESSION_PRESETS } from '../src/lib/compression.js';

const app = express();
app.use(express.json());

// Use production preset (cookies disabled by default)
const { middleware: compress, compressionManager } = createCompressionMiddleware(COMPRESSION_PRESETS.production);
app.use(compress);

// ============================================================================
// Example 1: Authentication Endpoints (Disable Compression)
// ============================================================================

app.post('/api/auth/login', (req, res) => {
  // Disable compression for sensitive auth responses
  res.locals.disableCompression = true;
  
  // Simulate authentication
  const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  const refreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  
  res.json({
    success: true,
    accessToken,
    refreshToken,
    expiresIn: 3600,
  });
});

app.post('/api/auth/refresh', (req, res) => {
  // Disable compression for token refresh
  res.locals.disableCompression = true;
  
  const newAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  
  res.json({
    success: true,
    accessToken: newAccessToken,
    expiresIn: 3600,
  });
});

app.post('/api/auth/logout', (req, res) => {
  // Disable compression for logout (may contain session info)
  res.locals.disableCompression = true;
  
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// ============================================================================
// Example 2: Webhook Endpoints (Disable Compression)
// ============================================================================

app.post('/api/webhooks/stripe', (req, res) => {
  // Disable compression for webhook responses
  res.locals.disableCompression = true;
  
  // Process Stripe webhook
  console.log('Stripe webhook received:', req.body);
  
  res.json({ received: true });
});

app.post('/api/webhooks/github', (req, res) => {
  // Disable compression for webhook responses
  res.locals.disableCompression = true;
  
  // Process GitHub webhook
  console.log('GitHub webhook received:', req.body);
  
  res.json({ received: true });
});

// ============================================================================
// Example 3: User-Specific Data (Automatic Cookie Protection)
// ============================================================================

app.get('/api/user/profile', (req, res) => {
  // Production preset automatically disables compression when cookies present
  // No need for explicit override
  
  // Simulate user profile
  const profile = {
    id: 123,
    username: 'john_doe',
    email: 'john@example.com',
    role: 'user',
  };
  
  res.json(profile);
});

app.get('/api/user/settings', (req, res) => {
  // Extra safety: Explicit override for sensitive settings
  res.locals.disableCompression = true;
  
  const settings = {
    notifications: true,
    twoFactorEnabled: true,
    apiKeys: ['key1', 'key2'],
  };
  
  res.json(settings);
});

// ============================================================================
// Example 4: Public Data (Compression Allowed)
// ============================================================================

app.get('/api/public/products', (req, res) => {
  // No cookies, no sensitive data → Compression allowed
  
  const products = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    price: Math.random() * 100,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  }));
  
  res.json(products);
});

app.get('/api/public/categories', (req, res) => {
  // Public data → Compression allowed
  
  const categories = [
    { id: 1, name: 'Electronics', count: 150 },
    { id: 2, name: 'Clothing', count: 300 },
    { id: 3, name: 'Books', count: 500 },
  ];
  
  res.json(categories);
});

// ============================================================================
// Example 5: Middleware-Level Control
// ============================================================================

// Disable compression for all admin routes
app.use('/api/admin/*', (req, res, next) => {
  res.locals.disableCompression = true;
  next();
});

app.get('/api/admin/users', (req, res) => {
  // Compression disabled by middleware
  const users = [
    { id: 1, username: 'admin', role: 'admin' },
    { id: 2, username: 'user1', role: 'user' },
  ];
  
  res.json(users);
});

app.get('/api/admin/logs', (req, res) => {
  // Compression disabled by middleware
  const logs = [
    { timestamp: Date.now(), level: 'info', message: 'User logged in' },
    { timestamp: Date.now(), level: 'error', message: 'Failed login attempt' },
  ];
  
  res.json(logs);
});

// ============================================================================
// Example 6: Conditional Compression Control
// ============================================================================

app.get('/api/data/export', (req, res) => {
  // Disable compression for authenticated exports
  if (req.headers.authorization) {
    res.locals.disableCompression = true;
  }
  
  const data = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    value: Math.random(),
  }));
  
  res.json(data);
});

app.get('/api/search', (req, res) => {
  // Disable compression if user is admin
  const userRole = req.headers['x-user-role'];
  if (userRole === 'admin') {
    res.locals.disableCompression = true;
  }
  
  const results = [
    { id: 1, title: 'Result 1' },
    { id: 2, title: 'Result 2' },
  ];
  
  res.json(results);
});

// ============================================================================
// Statistics Endpoint
// ============================================================================

app.get('/api/compression/stats', (req, res) => {
  const stats = compressionManager.getStats();
  
  res.json({
    ...stats,
    securityInfo: {
      skippedForSecurity: stats.skippedForSecurity,
      securitySkipRate: stats.totalRequests > 0
        ? ((stats.skippedForSecurity / stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
    },
  });
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('\nSecurity Examples:');
  console.log('- POST /api/auth/login - Compression disabled (sensitive)');
  console.log('- POST /api/webhooks/stripe - Compression disabled (webhook)');
  console.log('- GET /api/user/profile - Compression disabled if cookies present');
  console.log('- GET /api/public/products - Compression enabled (public data)');
  console.log('- GET /api/admin/users - Compression disabled (admin route)');
  console.log('- GET /api/compression/stats - View compression statistics');
});

export default app;
