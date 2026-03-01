# Hot Module Replacement (HMR) Guide

This guide covers the enhanced Hot Module Replacement system for API routes, including state preservation, dependency tracking, and smart reloading.

## Features

### 🔥 Enhanced Hot Reloading
- **Smart dependency tracking** - Automatically detects which routes are affected by changes
- **Debounced reloading** - Prevents excessive reloads during rapid file changes
- **AST-based analysis** - Accurate dependency detection using Abstract Syntax Trees
- **Graceful error recovery** - Automatic retry with exponential backoff

### 💾 State Preservation
- **Persistent state** - Route state survives hot reloads
- **HMR-safe caching** - Caches that persist across reloads
- **Rate limiting preservation** - Rate limits maintained during development
- **Session continuity** - User sessions preserved during development

### 📊 Smart Reloading Strategies
- **Single route reload** - Only reload the changed route
- **Selective reload** - Reload only affected routes when dependencies change
- **Full reload** - When widespread changes require complete refresh
- **Configuration reload** - Handle config changes appropriately

## Quick Start

### 1. Basic Stateful Route

```javascript
// pages/api/counter.js
import { createStatefulHandler } from '../../src/hmr/state-manager.js';

const handler = createStatefulHandler(
  { count: 0 }, // Initial state
  {
    async GET(request) {
      const state = handler.getState();
      return new Response(JSON.stringify({ count: state.count }));
    },
    
    async POST(request) {
      const newState = handler.updateState(prev => ({ 
        count: prev.count + 1 
      }));
      return new Response(JSON.stringify({ count: newState.count }));
    }
  }
);

export const { GET, POST } = handler;
```

### 2. Persistent Cache

```javascript
// pages/api/cached-data.js
import { createCache } from '../../src/hmr/state-manager.js';

const cache = createCache('my-cache', 5 * 60 * 1000); // 5 minute TTL

export async function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  
  let data = cache.get(key);
  if (!data) {
    data = await fetchExpensiveData(key);
    cache.set(key, data);
  }
  
  return new Response(JSON.stringify({ data, cached: true }));
}
```

### 3. HMR-Safe Rate Limiting

```javascript
// pages/api/rate-limited.js
import { createRateLimit } from '../../src/hmr/state-manager.js';

const rateLimiter = createRateLimit('api-limit', 100, 15 * 60 * 1000);

export async function GET(request) {
  const result = rateLimiter.check(request.ip);
  
  if (!result.allowed) {
    return new Response('Rate limited', { status: 429 });
  }
  
  return new Response(JSON.stringify({ 
    remaining: result.remaining 
  }));
}
```

## State Management API

### createStatefulHandler(initialState, handlers)

Creates a stateful API route handler that preserves state across HMR.

```javascript
const handler = createStatefulHandler(
  { users: [], lastId: 0 }, // Initial state
  {
    async GET(request) {
      const state = handler.getState();
      return new Response(JSON.stringify(state.users));
    },
    
    async POST(request) {
      const user = await request.json();
      const newState = handler.updateState(prev => ({
        users: [...prev.users, { ...user, id: prev.lastId + 1 }],
        lastId: prev.lastId + 1
      }));
      return new Response(JSON.stringify(newState.users));
    }
  }
);
```

**Methods:**
- `getState()` - Get current state
- `setState(newState)` - Set new state (merges with current)
- `updateState(updater)` - Update state with function or object
- `resetState()` - Reset to initial state
- `onStateChange(callback)` - Subscribe to state changes

### createCache(key, ttl)

Creates a cache that survives HMR with automatic TTL management.

```javascript
const cache = createCache('user-cache', 10 * 60 * 1000); // 10 minutes

// Usage
cache.set('user:123', userData);
const user = cache.get('user:123');
cache.delete('user:123');
cache.clear();
```

**Methods:**
- `get(key)` - Get cached value
- `set(key, value, customTtl?)` - Set cached value
- `delete(key)` - Remove cached value
- `clear()` - Clear all cached values
- `size()` - Get cache size
- `keys()` - Get all cache keys

### createRateLimit(key, maxRequests, windowMs)

Creates a rate limiter that persists across HMR.

```javascript
const limiter = createRateLimit('api-rate', 100, 15 * 60 * 1000);

const result = limiter.check(clientId);
// result: { allowed, remaining, resetTime, count }
```

**Methods:**
- `check(identifier)` - Check rate limit for identifier
- `reset(identifier)` - Reset rate limit for identifier
- `clear()` - Clear all rate limits

### createStore(key, initialValue)

Creates a simple persistent store.

```javascript
const store = createStore('app-config', { theme: 'dark' });

store.set({ theme: 'light' });
const config = store.get();
store.update(prev => ({ ...prev, language: 'en' }));
```

## Dependency Tracking

The system automatically tracks dependencies and determines optimal reload strategies:

### Reload Strategies

1. **Single Route Reload**
   - When only one route file changes
   - Fastest reload, preserves all other state

2. **Selective Reload**
   - When a shared dependency affects multiple routes
   - Only reloads affected routes

3. **Full Reload**
   - When changes affect many routes
   - Preserves state where possible

4. **Configuration Reload**
   - When config files change
   - May require server restart

### Dependency Analysis

The system uses AST parsing to accurately detect:
- ES6 imports (`import ... from '...'`)
- Dynamic imports (`import('...')`)
- CommonJS requires (`require('...')`)
- Re-exports (`export ... from '...'`)

## Client-Side Integration

### Automatic Setup

In development mode, the client automatically connects to HMR:

```javascript
// Automatically available in browser
window.apiHMR.on('route-updated', (data) => {
  console.log('Route updated:', data.routePath);
});

// Get HMR status
const status = await window.getHMRStatus();

// Clear API cache
window.clearApiCache();
```

### Manual Setup

```javascript
import { createApiHMRClient } from './src/hmr/client-hmr.js';

const hmrClient = createApiHMRClient({
  enableNotifications: true,
  enableConsoleLogging: true,
});

hmrClient.on('route-updated', (data) => {
  // Handle route update
});

hmrClient.on('dependency-updated', (data) => {
  // Handle dependency update
});
```

## Configuration

### Plugin Options

```javascript
// vite.config.js
export default defineConfig({
  plugins: [
    apiRoutes({
      // ... other options
      hmr: {
        preserveState: true,
        debounceMs: 100,
        enableLogging: true,
        maxRetries: 3,
      },
      dependencyTracking: {
        enableASTAnalysis: true,
        trackNodeModules: false,
        maxDepth: 10,
      }
    }),
  ],
});
```

### Environment Variables

```bash
# .env
HMR_PRESERVE_STATE=true
HMR_ENABLE_LOGGING=true
HMR_DEBOUNCE_MS=100
DEPENDENCY_TRACKING=true
```

## Best Practices

### 1. State Structure

Keep state serializable and avoid circular references:

```javascript
// ✅ Good
const handler = createStatefulHandler({
  users: [],
  config: { theme: 'dark' },
  stats: { requests: 0 }
});

// ❌ Avoid
const handler = createStatefulHandler({
  database: new Database(), // Non-serializable
  circular: {} // Will create circular reference
});
```

### 2. Cache Keys

Use descriptive, unique cache keys:

```javascript
// ✅ Good
const userCache = createCache('users-v1', ttl);
const sessionCache = createCache('sessions-v2', ttl);

// ❌ Avoid
const cache1 = createCache('cache', ttl);
const cache2 = createCache('data', ttl);
```

### 3. Error Handling

Always handle state operations gracefully:

```javascript
export async function POST(request) {
  try {
    const data = await request.json();
    const newState = handler.updateState(prev => ({
      ...prev,
      items: [...prev.items, data]
    }));
    return new Response(JSON.stringify(newState));
  } catch (error) {
    console.error('State update failed:', error);
    return new Response('Internal error', { status: 500 });
  }
}
```

### 4. Development vs Production

Use HMR features only in development:

```javascript
import { createStatefulHandler } from '../../src/hmr/state-manager.js';

const isDev = process.env.NODE_ENV === 'development';

const handler = isDev 
  ? createStatefulHandler({ count: 0 }, handlers)
  : handlers; // Use regular handlers in production
```

## Debugging

### HMR Status Endpoint

Visit `/__hmr_status` to see:
- HMR statistics
- Dependency graph info
- Active routes
- Cache status

### Console Logging

Enable detailed logging:

```javascript
const hmrClient = createApiHMRClient({
  enableConsoleLogging: true
});
```

### State History

Access state change history:

```javascript
const handler = createStatefulHandler(initialState, handlers);

// Get state history for debugging
handler.onStateChange((newState, prevState) => {
  console.log('State changed:', { from: prevState, to: newState });
});
```

## Troubleshooting

### Common Issues

1. **State not preserving**
   - Ensure `preserveState: true` in config
   - Check that state is serializable
   - Verify route ID consistency

2. **Slow reloads**
   - Increase `debounceMs` value
   - Disable AST analysis for large codebases
   - Check dependency depth settings

3. **Memory leaks**
   - Clear unused caches regularly
   - Set appropriate TTL values
   - Monitor cache sizes

### Performance Tips

1. **Optimize dependency tracking**
   ```javascript
   dependencyTracking: {
     enableASTAnalysis: false, // For large codebases
     maxDepth: 5, // Limit recursion depth
   }
   ```

2. **Tune debouncing**
   ```javascript
   hmr: {
     debounceMs: 200, // Increase for slower systems
   }
   ```

3. **Cache management**
   ```javascript
   // Regular cleanup
   setInterval(() => {
     globalStateManager.cleanup();
   }, 5 * 60 * 1000);
   ```

## Examples

See the `pages/api/examples/` directory for complete examples:
- `stateful-counter.js` - Basic state preservation
- `persistent-cache.js` - HMR-safe caching
- `hmr-rate-limit.js` - Rate limiting across reloads

## Migration from Basic HMR

### Before (Basic HMR)
```javascript
let counter = 0; // Lost on reload

export async function GET() {
  return new Response(JSON.stringify({ counter: counter++ }));
}
```

### After (Enhanced HMR)
```javascript
import { createStatefulHandler } from '../../src/hmr/state-manager.js';

const handler = createStatefulHandler({ counter: 0 }, {
  async GET() {
    const newState = handler.updateState(prev => ({ 
      counter: prev.counter + 1 
    }));
    return new Response(JSON.stringify({ counter: newState.counter }));
  }
});

export const { GET } = handler;
```

The enhanced HMR system provides a robust development experience with state preservation, smart reloading, and comprehensive debugging tools.