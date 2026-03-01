# Cache Observability & Debugging Guide

Complete guide to monitoring, debugging, and instrumenting the cache system.

## Overview

The cache system provides comprehensive observability through:
- **Hooks** - Callbacks for cache events (hit, miss, set, evict, error)
- **Enhanced Headers** - Debug information in HTTP responses
- **Metrics Export** - Prometheus/OpenTelemetry integration patterns

## Observability Hooks

### Available Hooks

```javascript
createCacheMiddleware({
  // Called when cache hit occurs
  onHit: (key, metadata) => {
    // metadata: { stale, compressed, encrypted, size, age, ttl }
  },
  
  // Called when cache miss occurs
  onMiss: (key) => {
    // key: cache key that was not found
  },
  
  // Called when value is cached
  onSet: (key, size, ttl, metadata) => {
    // metadata: { compressed, encrypted, compressionAlgorithm, staleWhileRevalidate }
  },
  
  // Called when entry is evicted
  onEvict: (key, reason) => {
    // reason: 'lru-eviction', 'ttl-expired', 'manual', 'expired', etc.
  },
  
  // Called on cache errors
  onError: (error, operation, key) => {
    // operation: 'get', 'set', 'delete', 'decrypt', 'decompress'
  },
});
```

### Hook Metadata

#### onHit Metadata
```javascript
{
  stale: boolean,           // Is data stale (needs revalidation)?
  compressed: boolean,      // Is data compressed?
  encrypted: boolean,       // Is data encrypted?
  size: number,            // Entry size in bytes
  age: number,             // Age in milliseconds
  ttl: number,             // Remaining TTL in milliseconds
}
```

#### onSet Metadata
```javascript
{
  compressed: boolean,              // Was data compressed?
  encrypted: boolean,               // Was data encrypted?
  compressionAlgorithm: string,     // 'gzip' or 'zstd'
  staleWhileRevalidate: number,     // SWR period in seconds
}
```

#### onEvict Reasons
- `lru-eviction` - Evicted due to LRU policy
- `ttl-expired` - Expired due to TTL
- `expired` - Expired (stale period ended)
- `manual` - Manually deleted
- `decompression-error` - Failed to decompress
- `decryption-error` - Failed to decrypt

## Enhanced Response Headers

### Standard Headers

```http
X-Cache: HIT | MISS | STALE
X-Cache-Key: api:abc123...
X-Cache-Store: memory | redis
X-Cache-TTL: 300
X-Cache-Encrypted: true | false
X-Cache-Status: revalidating
X-Cache-Skip-Reason: range-request | event-stream | chunked-encoding | partial-content | size-limit-exceeded
```

### Header Descriptions

| Header | Values | Description |
|--------|--------|-------------|
| `X-Cache` | HIT, MISS, STALE | Cache status |
| `X-Cache-Key` | string | Cache key (truncated) |
| `X-Cache-Store` | memory, redis | Storage backend |
| `X-Cache-TTL` | seconds | Time to live |
| `X-Cache-Encrypted` | true, false | Encryption status |
| `X-Cache-Status` | revalidating | Background refresh status |
| `X-Cache-Skip-Reason` | string | Why caching was skipped |

### Example Response

```http
HTTP/1.1 200 OK
X-Cache: HIT
X-Cache-Key: api:abc123def456
X-Cache-Store: memory
X-Cache-TTL: 285
X-Cache-Encrypted: true
Content-Type: application/json

{"data": "cached response"}
```

## Prometheus Integration

### Basic Setup

```javascript
import { createCacheMiddleware } from './cache.js';
import { register, Counter, Gauge } from 'prom-client';

// Define metrics
const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['store'],
});

const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['store'],
});

const cacheSets = new Counter({
  name: 'cache_sets_total',
  help: 'Total number of cache sets',
  labelNames: ['store', 'compressed', 'encrypted'],
});

const cacheEvictions = new Counter({
  name: 'cache_evictions_total',
  help: 'Total number of cache evictions',
  labelNames: ['store', 'reason'],
});

const cacheErrors = new Counter({
  name: 'cache_errors_total',
  help: 'Total number of cache errors',
  labelNames: ['store', 'operation'],
});

const cacheHitRate = new Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate percentage',
  labelNames: ['store'],
});

const cacheBytesSet = new Counter({
  name: 'cache_bytes_set_total',
  help: 'Total bytes set in cache',
  labelNames: ['store'],
});

// Create cache with hooks
const { middleware } = createCacheMiddleware({
  type: 'memory',
  onHit: (key, metadata) => {
    cacheHits.inc({ store: 'memory' });
  },
  onMiss: (key) => {
    cacheMisses.inc({ store: 'memory' });
  },
  onSet: (key, size, ttl, metadata) => {
    cacheSets.inc({
      store: 'memory',
      compressed: metadata.compressed,
      encrypted: metadata.encrypted,
    });
    cacheBytesSet.inc({ store: 'memory' }, size);
  },
  onEvict: (key, reason) => {
    cacheEvictions.inc({ store: 'memory', reason });
  },
  onError: (error, operation, key) => {
    cacheErrors.inc({ store: 'memory', operation });
  },
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Prometheus Metrics Output

```prometheus
# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
cache_hits_total{store="memory"} 1523

# HELP cache_misses_total Total number of cache misses
# TYPE cache_misses_total counter
cache_misses_total{store="memory"} 234

# HELP cache_hit_rate Cache hit rate percentage
# TYPE cache_hit_rate gauge
cache_hit_rate{store="memory"} 86.68

# HELP cache_sets_total Total number of cache sets
# TYPE cache_sets_total counter
cache_sets_total{store="memory",compressed="true",encrypted="false"} 156
cache_sets_total{store="memory",compressed="false",encrypted="true"} 78

# HELP cache_evictions_total Total number of cache evictions
# TYPE cache_evictions_total counter
cache_evictions_total{store="memory",reason="lru-eviction"} 45
cache_evictions_total{store="memory",reason="ttl-expired"} 189

# HELP cache_bytes_set_total Total bytes set in cache
# TYPE cache_bytes_set_total counter
cache_bytes_set_total{store="memory"} 15728640
```

## OpenTelemetry Integration

### Basic Setup

```javascript
import { trace } from '@opentelemetry/api';
import { createCacheMiddleware } from './cache.js';

const tracer = trace.getTracer('cache-service');

const { middleware } = createCacheMiddleware({
  type: 'memory',
  onHit: (key, metadata) => {
    const span = tracer.startSpan('cache.hit', {
      attributes: {
        'cache.key': key,
        'cache.stale': metadata.stale,
        'cache.age': metadata.age,
        'cache.size': metadata.size,
        'cache.compressed': metadata.compressed,
        'cache.encrypted': metadata.encrypted,
      },
    });
    span.end();
  },
  onMiss: (key) => {
    const span = tracer.startSpan('cache.miss', {
      attributes: {
        'cache.key': key,
      },
    });
    span.end();
  },
  onSet: (key, size, ttl, metadata) => {
    const span = tracer.startSpan('cache.set', {
      attributes: {
        'cache.key': key,
        'cache.size': size,
        'cache.ttl': ttl,
        'cache.compressed': metadata.compressed,
        'cache.encrypted': metadata.encrypted,
        'cache.compression_algorithm': metadata.compressionAlgorithm,
      },
    });
    span.end();
  },
  onEvict: (key, reason) => {
    const span = tracer.startSpan('cache.evict', {
      attributes: {
        'cache.key': key,
        'cache.eviction_reason': reason,
      },
    });
    span.end();
  },
  onError: (error, operation, key) => {
    const span = tracer.startSpan('cache.error', {
      attributes: {
        'cache.key': key,
        'cache.operation': operation,
        'error.type': error.name,
        'error.message': error.message,
      },
    });
    span.recordException(error);
    span.end();
  },
});
```

### OpenTelemetry Span Attributes

#### cache.hit
```javascript
{
  'cache.key': string,
  'cache.stale': boolean,
  'cache.age': number,
  'cache.size': number,
  'cache.compressed': boolean,
  'cache.encrypted': boolean,
}
```

#### cache.miss
```javascript
{
  'cache.key': string,
}
```

#### cache.set
```javascript
{
  'cache.key': string,
  'cache.size': number,
  'cache.ttl': number,
  'cache.compressed': boolean,
  'cache.encrypted': boolean,
  'cache.compression_algorithm': string,
}
```

#### cache.evict
```javascript
{
  'cache.key': string,
  'cache.eviction_reason': string,
}
```

#### cache.error
```javascript
{
  'cache.key': string,
  'cache.operation': string,
  'error.type': string,
  'error.message': string,
}
```

## Custom Metrics Collector

### Implementation

```javascript
class CacheMetrics {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
    this.errors = 0;
    this.totalBytesSet = 0;
    this.evictionReasons = new Map();
  }

  recordHit(key, metadata) {
    this.hits++;
  }

  recordMiss(key) {
    this.misses++;
  }

  recordSet(key, size, ttl, metadata) {
    this.sets++;
    this.totalBytesSet += size;
  }

  recordEvict(key, reason) {
    this.evictions++;
    this.evictionReasons.set(reason, (this.evictionReasons.get(reason) || 0) + 1);
  }

  recordError(error, operation, key) {
    this.errors++;
  }

  getStats() {
    const hitRate = this.hits + this.misses > 0 
      ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(2)
      : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      errors: this.errors,
      hitRate: `${hitRate}%`,
      totalBytesSet: this.totalBytesSet,
      evictionReasons: Object.fromEntries(this.evictionReasons),
    };
  }
}

// Usage
const metrics = new CacheMetrics();

const { middleware } = createCacheMiddleware({
  onHit: (key, metadata) => metrics.recordHit(key, metadata),
  onMiss: (key) => metrics.recordMiss(key),
  onSet: (key, size, ttl, metadata) => metrics.recordSet(key, size, ttl, metadata),
  onEvict: (key, reason) => metrics.recordEvict(key, reason),
  onError: (error, operation, key) => metrics.recordError(error, operation, key),
});

// Expose metrics
app.get('/cache/stats', (req, res) => {
  res.json(metrics.getStats());
});
```

## Debugging Tips

### 1. Enable Debug Headers

Always include debug headers in development:

```javascript
const { middleware } = createCacheMiddleware({
  type: 'memory',
  // Headers are automatically added
});
```

Check response headers:
```bash
curl -I http://localhost:3000/api/data
```

### 2. Monitor Cache Events

Log all cache events:

```javascript
const { middleware } = createCacheMiddleware({
  onHit: (key, metadata) => console.log('[HIT]', key, metadata),
  onMiss: (key) => console.log('[MISS]', key),
  onSet: (key, size, ttl, metadata) => console.log('[SET]', key, size, ttl, metadata),
  onEvict: (key, reason) => console.log('[EVICT]', key, reason),
  onError: (error, operation, key) => console.error('[ERROR]', operation, key, error),
});
```

### 3. Track Hit Rate

Monitor cache effectiveness:

```javascript
let hits = 0, misses = 0;

const { middleware } = createCacheMiddleware({
  onHit: () => hits++,
  onMiss: () => misses++,
});

setInterval(() => {
  const total = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : 0;
  console.log(`Hit Rate: ${hitRate}% (${hits}/${total})`);
}, 60000); // Every minute
```

### 4. Identify Hot Keys

Track most accessed keys:

```javascript
const keyAccess = new Map();

const { middleware } = createCacheMiddleware({
  onHit: (key) => {
    keyAccess.set(key, (keyAccess.get(key) || 0) + 1);
  },
});

// Get top 10 hot keys
const hotKeys = Array.from(keyAccess.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
```

### 5. Monitor Eviction Patterns

Understand why entries are evicted:

```javascript
const evictionReasons = new Map();

const { middleware } = createCacheMiddleware({
  onEvict: (key, reason) => {
    evictionReasons.set(reason, (evictionReasons.get(reason) || 0) + 1);
  },
});

// Check eviction distribution
console.log(Object.fromEntries(evictionReasons));
// { 'lru-eviction': 45, 'ttl-expired': 189 }
```

## Performance Monitoring

### Key Metrics to Track

1. **Hit Rate** - Percentage of cache hits vs total requests
2. **Miss Rate** - Percentage of cache misses
3. **Eviction Rate** - How often entries are evicted
4. **Average TTL** - Average time entries stay in cache
5. **Cache Size** - Current cache utilization
6. **Bytes Cached** - Total data cached
7. **Error Rate** - Cache operation failures

### Dashboard Example

```javascript
class CacheDashboard {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    this.metrics = new CacheMetrics();
  }

  async getSnapshot() {
    const stats = await this.cacheManager.getStats();
    const metrics = this.metrics.getStats();

    return {
      performance: {
        hitRate: metrics.hitRate,
        hits: metrics.hits,
        misses: metrics.misses,
      },
      capacity: {
        size: stats.size,
        maxSize: stats.maxSize,
        currentBytes: stats.currentBytes,
        maxBytes: stats.maxBytes,
        utilization: stats.utilizationPercent,
      },
      operations: {
        sets: metrics.sets,
        evictions: metrics.evictions,
        errors: metrics.errors,
      },
      evictions: metrics.evictionReasons,
    };
  }
}
```

## Testing Observability

Run the observability test suite:

```bash
node test-cache-observability.js
```

This demonstrates:
- Hook integration
- Enhanced headers
- Prometheus metrics export
- OpenTelemetry patterns
- Real-time monitoring
- Error tracking

## Best Practices

1. **Always use hooks in production** - Essential for monitoring
2. **Track hit rate** - Aim for >80% for effective caching
3. **Monitor evictions** - High eviction rate indicates undersized cache
4. **Log errors** - Cache errors shouldn't break your app
5. **Use debug headers in development** - Makes debugging much easier
6. **Export metrics** - Integrate with Prometheus/Grafana
7. **Set up alerts** - Low hit rate, high error rate, etc.

## Troubleshooting

### Low Hit Rate

- Check TTL settings (too short?)
- Verify cache key generation
- Monitor eviction reasons
- Increase cache size

### High Eviction Rate

- Increase maxSize or maxBytes
- Adjust TTL values
- Check for hot keys
- Consider Redis for larger cache

### Frequent Errors

- Check encryption key configuration
- Verify Redis connection
- Monitor compression errors
- Review error logs

## Example: Complete Monitoring Setup

```javascript
import { createCacheMiddleware } from './cache.js';
import { Counter, Gauge, register } from 'prom-client';

// Prometheus metrics
const cacheHits = new Counter({ name: 'cache_hits_total', help: 'Cache hits' });
const cacheMisses = new Counter({ name: 'cache_misses_total', help: 'Cache misses' });
const cacheHitRate = new Gauge({ name: 'cache_hit_rate', help: 'Hit rate %' });

let hits = 0, misses = 0;

const { middleware } = createCacheMiddleware({
  type: 'memory',
  maxBytes: 50 * 1024 * 1024, // 50MB
  defaultTTL: 300,
  
  onHit: (key, metadata) => {
    hits++;
    cacheHits.inc();
    cacheHitRate.set((hits / (hits + misses)) * 100);
    console.log(`[HIT] ${key.slice(0, 30)}... (stale: ${metadata.stale})`);
  },
  
  onMiss: (key) => {
    misses++;
    cacheMisses.inc();
    cacheHitRate.set((hits / (hits + misses)) * 100);
    console.log(`[MISS] ${key.slice(0, 30)}...`);
  },
  
  onEvict: (key, reason) => {
    console.warn(`[EVICT] ${key.slice(0, 30)}... (${reason})`);
  },
  
  onError: (error, operation, key) => {
    console.error(`[ERROR] ${operation} failed:`, error.message);
  },
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

This provides complete observability with minimal overhead!
