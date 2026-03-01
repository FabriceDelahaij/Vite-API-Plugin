# Compression Streaming Guide

## Overview

The compression middleware supports three modes of operation, each optimized for different use cases:

1. **Buffered Compression** - For small responses (< threshold)
2. **Chunked Compression** - For large buffered responses (> threshold)
3. **True Streaming Compression** - For real streaming responses (multiple writes)

## Compression Modes

### 1. Buffered Compression (Default for Small Responses)

**When:** Response size < streaming threshold (default: 100KB)

**How it works:**
```javascript
res.json({ data: 'small payload' });
// → Compresses entire buffer in memory
// → Sends with Content-Length header
```

**Characteristics:**
- ✅ Fastest for small payloads
- ✅ Can calculate exact Content-Length
- ✅ Supports caching (via hash)
- ✅ Best compression ratio (can optimize level)
- ❌ Buffers entire response in memory

**Memory usage:** `originalSize + compressedSize`

### 2. Chunked Compression (Large Buffered Responses)

**When:** Response size > streaming threshold AND response is already buffered

**How it works:**
```javascript
res.send(largeBuffer); // > 100KB
// → Creates Readable.from(buffer)
// → Pipes through compression stream
// → Uses chunked transfer encoding
```

**Characteristics:**
- ✅ Better CPU backpressure handling
- ✅ Chunked transfer encoding
- ⚠️ Still buffers entire response first
- ❌ No Content-Length (chunked encoding)
- ❌ Higher memory usage than true streaming

**Memory usage:** `originalSize + compressedSize` (same as buffered)

**Note:** This is NOT true streaming - the response is already in memory. It only helps with CPU backpressure during compression.

### 3. True Streaming Compression (Real Streaming)

**When:** Multiple `res.write()` calls OR no Content-Length header

**How it works:**
```javascript
// CSV export example
res.write('header1,header2\n');
for (const row of largeDataset) {
  res.write(`${row.col1},${row.col2}\n`);
}
res.end();

// → Detects streaming pattern
// → Pipes writes directly through compression
// → No buffering of full response
```

**Characteristics:**
- ✅ Minimal memory usage
- ✅ Handles truly large responses (GB+)
- ✅ Real backpressure support
- ✅ Ideal for CSV, NDJSON, SSE, etc.
- ❌ No caching (can't hash streaming data)
- ❌ No Content-Length
- ❌ Slightly lower compression ratio

**Memory usage:** `chunkSize + compressionBufferSize` (constant)

## Detection Logic

The middleware automatically detects which mode to use:

```javascript
// Buffered: res.json() or res.send() with small data
res.json({ users: [...] }); // < 100KB → Buffered

// Chunked: res.send() with large data
res.send(largeBuffer); // > 100KB → Chunked

// True Streaming: Multiple writes or no Content-Length
res.write(chunk1);
res.write(chunk2); // → True Streaming
res.end();
```

## Configuration

```javascript
createCompressionMiddleware({
  streaming: {
    enabled: true,
    threshold: 100 * 1024, // 100KB
  },
});
```

**Options:**
- `enabled: false` - Disables both chunked and true streaming (buffered only)
- `threshold` - Size threshold for chunked compression

## Use Cases

### Small API Responses (< 100KB)
```javascript
// Buffered compression (default)
res.json({ users: [...] });
```
**Mode:** Buffered  
**Memory:** Low  
**Performance:** Excellent

### Large JSON Responses (100KB - 10MB)
```javascript
// Chunked compression
const largeData = generateLargeDataset();
res.json(largeData);
```
**Mode:** Chunked  
**Memory:** High (buffers entire response)  
**Performance:** Good (CPU backpressure)

### CSV Exports (Streaming)
```javascript
// True streaming compression
res.setHeader('Content-Type', 'text/csv');
res.write('id,name,email\n');

for await (const user of userStream) {
  res.write(`${user.id},${user.name},${user.email}\n`);
}
res.end();
```
**Mode:** True Streaming  
**Memory:** Minimal (constant)  
**Performance:** Excellent for large datasets

### NDJSON Streaming
```javascript
// True streaming compression
res.setHeader('Content-Type', 'application/x-ndjson');

for await (const record of recordStream) {
  res.write(JSON.stringify(record) + '\n');
}
res.end();
```
**Mode:** True Streaming  
**Memory:** Minimal  
**Performance:** Excellent

### Server-Sent Events (SSE)
```javascript
// True streaming compression
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');

const interval = setInterval(() => {
  res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
}, 1000);

req.on('close', () => clearInterval(interval));
```
**Mode:** True Streaming  
**Memory:** Minimal  
**Performance:** Excellent

## Performance Comparison

| Mode | Memory | CPU | Compression Ratio | Caching | Content-Length |
|------|--------|-----|-------------------|---------|----------------|
| Buffered | Low | Low | Best | ✅ Yes | ✅ Yes |
| Chunked | High | Medium | Good | ❌ No | ❌ No |
| True Streaming | Minimal | Medium | Good | ❌ No | ❌ No |

## Debug Headers (Development Only)

The middleware adds debug headers in non-production environments:

```http
X-Compression-Mode: buffered | chunked | streaming
X-Original-Size: 12345
X-Compressed-Size: 4567
X-Compression-Ratio: 63.00%
```

**Modes:**
- `buffered` - Small response, compressed in memory
- `chunked` - Large buffered response, piped through compression
- `streaming` - True streaming, direct write interception

## Best Practices

### ✅ DO

1. **Use buffered for small responses**
   ```javascript
   res.json({ data: smallPayload }); // Let middleware decide
   ```

2. **Use true streaming for large datasets**
   ```javascript
   for await (const chunk of dataStream) {
     res.write(chunk);
   }
   ```

3. **Set appropriate threshold**
   ```javascript
   // API with mostly small responses
   createCompressionMiddleware({
     streaming: { threshold: 500 * 1024 } // 500KB
   });
   ```

### ❌ DON'T

1. **Don't buffer large datasets just to use res.json()**
   ```javascript
   // BAD: Buffers entire dataset in memory
   const allData = await fetchAllRecords(); // 100MB
   res.json(allData);
   
   // GOOD: Stream the data
   const stream = fetchRecordsStream();
   for await (const record of stream) {
     res.write(JSON.stringify(record) + '\n');
   }
   res.end();
   ```

2. **Don't disable streaming for large responses**
   ```javascript
   // BAD: Forces buffering of large responses
   createCompressionMiddleware({
     streaming: { enabled: false }
   });
   ```

3. **Don't mix buffered and streaming patterns**
   ```javascript
   // BAD: Confusing pattern
   res.write(chunk1);
   res.json(data); // This will buffer
   ```

## Memory Optimization

### For Large JSON Responses

If you must send large JSON responses, consider:

1. **Pagination**
   ```javascript
   res.json({
     data: items.slice(offset, offset + limit),
     pagination: { offset, limit, total }
   });
   ```

2. **NDJSON Streaming**
   ```javascript
   res.setHeader('Content-Type', 'application/x-ndjson');
   for (const item of items) {
     res.write(JSON.stringify(item) + '\n');
   }
   res.end();
   ```

3. **Cursor-based pagination**
   ```javascript
   res.json({
     data: items,
     cursor: lastItem.id
   });
   ```

## Troubleshooting

### High Memory Usage

**Symptom:** Memory spikes during large responses

**Diagnosis:**
```javascript
// Check X-Compression-Mode header
// If "chunked", response is buffered
```

**Solution:** Use true streaming
```javascript
// Instead of:
res.json(largeArray);

// Use:
for (const item of largeArray) {
  res.write(JSON.stringify(item) + '\n');
}
res.end();
```

### Slow Response Times

**Symptom:** Slow TTFB (Time To First Byte)

**Diagnosis:**
```javascript
// Check if buffering entire response
// Look for X-Compression-Mode: buffered or chunked
```

**Solution:** Use streaming or reduce compression level
```javascript
createCompressionMiddleware({
  level: 4, // Faster compression
  streaming: { enabled: true }
});
```

### No Compression

**Symptom:** Responses not compressed

**Diagnosis:**
```javascript
// Check Accept-Encoding header
// Check Content-Type
// Check response size vs threshold
```

**Solution:**
```javascript
// Ensure client sends Accept-Encoding
// Ensure Content-Type is compressible
// Check threshold setting
```

## Advanced: Custom Streaming

For custom streaming scenarios:

```javascript
import { createGzip } from 'zlib';
import { pipeline } from 'stream';

app.get('/custom-stream', (req, res) => {
  const gzip = createGzip();
  
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', 'application/json');
  
  const dataStream = createYourDataStream();
  
  pipeline(dataStream, gzip, res, (err) => {
    if (err) console.error('Stream error:', err);
  });
});
```

## Summary

- **Buffered** (< 100KB): Fast, cacheable, best compression
- **Chunked** (> 100KB, buffered): CPU backpressure, still buffers memory
- **True Streaming** (multiple writes): Minimal memory, handles GB+ responses

Choose based on your use case:
- Small API responses → Buffered (automatic)
- Large JSON responses → Consider pagination or NDJSON
- CSV/NDJSON exports → True streaming
- SSE/WebSocket → True streaming
