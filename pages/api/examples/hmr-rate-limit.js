/**
 * Example: Rate limiter that persists across HMR
 */

import { createRateLimit } from '../../../src/hmr/state-manager.js';

// Create rate limiter: 10 requests per minute
const rateLimiter = createRateLimit('api-rate-limit', 10, 60 * 1000);

export async function GET(request) {
  const ip = request.ip || 'unknown';
  const result = rateLimiter.check(ip);

  if (!result.allowed) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      data: {
        limit: 10,
        remaining: result.remaining,
        resetTime: new Date(result.resetTime).toISOString(),
        message: 'Rate limit state preserved across HMR',
      },
    }), {
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    data: {
      ip,
      remaining: result.remaining,
      count: result.count,
      resetTime: new Date(result.resetTime).toISOString(),
      message: `Request ${result.count}/10 - Rate limit persists across HMR`,
    },
  }), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
    },
  });
}

export async function DELETE(request) {
  const ip = request.ip || 'unknown';
  rateLimiter.reset(ip);

  return new Response(JSON.stringify({
    success: true,
    data: {
      ip,
      message: 'Rate limit reset for IP',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}