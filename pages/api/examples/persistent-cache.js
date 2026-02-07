/**
 * Example: Persistent cache that survives HMR
 */

import { createCache } from '../../../src/hmr/state-manager.js';

// Create a cache that persists across HMR (5 minute TTL)
const cache = createCache('api-cache', 5 * 60 * 1000);

export async function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return new Response(JSON.stringify({
      error: 'Missing key parameter',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cachedValue = cache.get(key);

  return new Response(JSON.stringify({
    success: true,
    data: {
      key,
      value: cachedValue,
      cached: cachedValue !== null,
      cacheSize: cache.size(),
      message: cachedValue 
        ? 'Value retrieved from HMR-persistent cache' 
        : 'Key not found in cache',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const { key, value, ttl } = await request.json();

  if (!key || value === undefined) {
    return new Response(JSON.stringify({
      error: 'Missing key or value',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  cache.set(key, value, ttl);

  return new Response(JSON.stringify({
    success: true,
    data: {
      key,
      value,
      ttl: ttl || '5 minutes (default)',
      cacheSize: cache.size(),
      message: 'Value cached successfully (survives HMR)',
    },
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}