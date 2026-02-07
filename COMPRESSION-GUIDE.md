# API Response Compression Guide

This guide explains how to use the built-in response compression system for API routes to reduce bandwidth and improve API performance.

## ⚠️ Important: API Routes Only

**This compression system applies ONLY to API routes (`/api/*`).** 

- ✅ **API routes** (`/api/*`) - Compressed by this plugin
- ❌ **Static assets** (JS, CSS, images) - Handled by Vite's build process
- ❌ **Frontend HTML** - Handled by your hosting/CDN

For static asset compression, use Vite's built-in compression or configure your CDN/hosting provider.

## Overview

The API compression system supports:
- **Brotli compression** - Best compression ratio (~20% better than gzip)
- **Gzip compression** - Widely supported, good compression
- **Deflate compression** - Fallback option
- **Automatic algorithm selection** - Based on Accept-Encoding header
- **Configurable threshold** - Only compress responses above size limit
- **Content-type filtering** - Only compress compressible content
- **Compression statistics** - Track compression ratio and bandwidth savings

## Quick Start

### Enable Compression (Default)

Compression is enabled by default with sensible settings:

```js
import vitePluginApiRoutes from './vite-plugin-api-routes.js';

export default {
  plugins: [
    vitePluginApiRoutes({
      // Compression enabled by default
      compression: {
        enabled: true,
        threshold: 1024, // Only compress responses > 1KB
        level: 6, // Compression level (0-11 for brotli, 0-9 for gzip)
        algorithms: ['br', 'gzip', 'deflate'], // Preferred order
      },
    }),
  ],
};
```

### Disable Compression

```js
vitePluginApiRoutes({
  compression: {
    enabled: false,
  },
})
```

## Configuration Options

```js
{
  compression: {
    enabled: true,              // Enable/disable compression
    threshold: 1024,            // Min size in bytes (default: 1KB)
    level: 6,                   // Compression level (0-11 for brotli, 0-9 for gzip)
    algorithms: ['br', 'gzip'], // Preferred algorithms in order
    compressibleTypes: [        // Content types to compress
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'application/javascript',
      'image/svg+xml',
    ],
    excludePatterns: [],        // Regex patterns to exclude
  }
}
```

## Compression Levels

### Brotli (0-11)
- **0-3**: Fast, lower compression
- **4-6**: Balanced (recommended)
- **7-9**: Better compression, slower
- **10-11**: Maximum compression, very slow

### Gzip (0-9)
- **0**: No compression
- **1-3**: Fast, lower compression
- **4-6**: Balanced (recommended)
- **7-9**: Maximum compression, slower

## How It Works

### 1. Client Request
```http
GET /api/products HTTP/1.1
Accept-Encoding: br, gzip, deflate
```

### 2. Server Response (Compressed)
```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Encoding: br
Content-Length: 1234
X-Original-Size: 5678
X-Compression-Ratio: 78.26%
Vary: Accept-Encoding

[compressed binary data]
```

### 3. Browser Decompression
Browser automatically decompresses the response.

## Compression Statistics

### View Stats

```js
// Access via /__hmr_status endpoint
fetch('http://localhost:5173/__hmr_status')
  .then(res => res.json())
  .then(data => console.log(data.compression));

// Output:
// {
//   enabled: true,
//   totalRequests: 1000,
//   compressed: 850,
//   uncompressed: 150,
//   bytesIn: 5000000,
//   bytesOut: 1250000,
//   compressionRatio: 75.00,
//   compressionRate: '85.00%'
// }
```

### Interpret Stats

- **compressionRatio**: Overall bandwidth savings (75% = 75% reduction)
- **compressionRate**: Percentage of requests compressed
- **bytesIn**: Total uncompressed bytes
- **bytesOut**: Total compressed bytes

## Response Headers

Compressed responses include these headers:

```http
Content-Encoding: br                 # Compression algorithm used
Content-Length: 1234                 # Compressed size
X-Original-Size: 5678                # Original size before compression
X-Compression-Ratio: 78.26%          # Compression ratio for this response
Vary: Accept-Encoding                # Cache should vary by encoding
```

## Best Practices

### 1. Use Appropriate Threshold

```js
compression: {
  threshold: 1024, // 1KB - good default
  // Don't compress tiny responses (overhead > benefit)
}
```

### 2. Prioritize Brotli

```js
compression: {
  algorithms: ['br', 'gzip', 'deflate'], // Brotli first
  // Brotli provides ~20% better compression than gzip
}
```

### 3. Adjust Level for Use Case

```js
// Development: Fast compression
compression: {
  level: 4, // Faster, lower compression
}

// Production: Better compression
compression: {
  level: 6, // Balanced (recommended)
}

// Static assets: Maximum compression
compression: {
  level: 9, // Best compression, slower
}
```

### 4. Exclude Non-Compressible Content

```js
compression: {
  excludePatterns: [
    '/api/images/.*',     // Already compressed images
    '/api/videos/.*',     // Already compressed videos
    '/api/download/.*',   // Binary downloads
  ],
}
```

### 5. Monitor Compression Ratio

```js
// Log compression stats periodically
setInterval(async () => {
  const stats = await fetch('/__hmr_status').then(r => r.json());
  console.log(`Compression ratio: ${stats.compression.compressionRatio}%`);
}, 60000); // Every minute
```

## Advanced Usage

### Per-Route Compression Control

```js
// pages/api/large-data.js
export async function GET(request) {
  const data = await getLargeDataset();
  
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      // Compression happens automatically
    },
  });
}
```

### Disable Compression for Specific Route

```js
// pages/api/binary-data.js
export async function GET(request) {
  const binaryData = await getBinaryData();
  
  return new Response(binaryData, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'identity', // Disable compression
    },
  });
}
```

### Pre-Compressed Assets

```js
// Serve pre-compressed files
export async function GET(request) {
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  
  if (acceptEncoding.includes('br')) {
    // Serve pre-compressed .br file
    const compressed = await fs.readFile('asset.js.br');
    return new Response(compressed, {
      headers: {
        'Content-Type': 'application/javascript',
        'Content-Encoding': 'br',
      },
    });
  }
  
  // Serve uncompressed
  const content = await fs.readFile('asset.js');
  return new Response(content);
}
```

## Performance Impact

### Bandwidth Savings

| Content Type | Original Size | Brotli | Gzip | Savings (Brotli) |
|--------------|---------------|--------|------|------------------|
| JSON | 100 KB | 15 KB | 20 KB | 85% |
| HTML | 50 KB | 8 KB | 12 KB | 84% |
| JavaScript | 200 KB | 45 KB | 60 KB | 77.5% |
| CSS | 80 KB | 12 KB | 18 KB | 85% |
| SVG | 30 KB | 5 KB | 8 KB | 83% |

### CPU Impact

- **Brotli level 6**: ~5-10ms per 100KB
- **Gzip level 6**: ~2-5ms per 100KB
- **Negligible** for most APIs (<1% CPU usage)

### Latency Impact

- **Compression time**: +5-10ms
- **Transfer time**: -50-200ms (depending on size and network)
- **Net benefit**: 40-190ms faster

## Troubleshooting

### Compression Not Working

1. **Check Accept-Encoding header**:
```bash
curl -H "Accept-Encoding: br, gzip" http://localhost:5173/api/products
```

2. **Check response size**:
```js
// Response must be > threshold (default 1KB)
compression: { threshold: 1024 }
```

3. **Check content type**:
```js
// Must be in compressibleTypes list
res.setHeader('Content-Type', 'application/json');
```

### Poor Compression Ratio

1. **Data already compressed**: Images, videos, PDFs
2. **Small responses**: Overhead > benefit
3. **Random data**: Not compressible
4. **Low compression level**: Increase level

### High CPU Usage

1. **Lower compression level**:
```js
compression: { level: 4 } // Faster
```

2. **Increase threshold**:
```js
compression: { threshold: 5120 } // Only compress > 5KB
```

3. **Exclude large files**:
```js
compression: {
  excludePatterns: ['/api/large/.*'],
}
```

## Browser Support

| Browser | Brotli | Gzip | Deflate |
|---------|--------|------|---------|
| Chrome 50+ | ✅ | ✅ | ✅ |
| Firefox 44+ | ✅ | ✅ | ✅ |
| Safari 11+ | ✅ | ✅ | ✅ |
| Edge 15+ | ✅ | ✅ | ✅ |
| IE 11 | ❌ | ✅ | ✅ |

**Note**: Brotli is supported by 95%+ of browsers. Gzip is universal fallback.

## Testing Compression

### Test with curl

```bash
# Test Brotli
curl -H "Accept-Encoding: br" -I http://localhost:5173/api/products

# Test Gzip
curl -H "Accept-Encoding: gzip" -I http://localhost:5173/api/products

# Test without compression
curl -H "Accept-Encoding: identity" -I http://localhost:5173/api/products
```

### Test with Browser DevTools

1. Open DevTools → Network tab
2. Reload page
3. Check response headers:
   - `Content-Encoding: br` or `gzip`
   - `X-Compression-Ratio: XX%`
4. Compare sizes in Size column

### Automated Testing

```js
// test/compression.test.js
import { describe, it, expect } from 'vitest';

describe('Compression', () => {
  it('should compress large JSON responses', async () => {
    const response = await fetch('http://localhost:5173/api/products', {
      headers: { 'Accept-Encoding': 'br, gzip' },
    });
    
    expect(response.headers.get('content-encoding')).toBeTruthy();
    expect(response.headers.get('x-compression-ratio')).toBeTruthy();
  });
  
  it('should not compress small responses', async () => {
    const response = await fetch('http://localhost:5173/api/ping', {
      headers: { 'Accept-Encoding': 'br, gzip' },
    });
    
    expect(response.headers.get('content-encoding')).toBeFalsy();
  });
});
```

## Static Asset Compression

For compressing static assets (JS, CSS, images), use Vite's built-in compression:

### Option 1: Vite Plugin Compress

```bash
npm install vite-plugin-compression
```

```js
// vite.config.js
import compression from 'vite-plugin-compression';

export default {
  plugins: [
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
  ],
};
```

### Option 2: CDN/Hosting Compression

Most hosting providers (Vercel, Netlify, Cloudflare) automatically compress static assets:

- **Vercel**: Automatic Brotli/Gzip compression
- **Netlify**: Automatic compression for all assets
- **Cloudflare**: Automatic compression via CDN
- **Nginx**: Enable `gzip` and `brotli` modules

## See Also

- [Cache Guide](./CACHE-GUIDE.md) - Response caching
- [Performance Guide](./PERFORMANCE.md) - Performance optimization
- [Security Guide](./SECURITY.md) - Security best practices
- [Vite Compression Plugin](https://github.com/vbenjs/vite-plugin-compression) - Static asset compression
