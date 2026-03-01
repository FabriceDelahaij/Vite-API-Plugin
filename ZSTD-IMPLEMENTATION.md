# Zstandard (zstd) Compression Implementation

## Summary

Successfully added Zstandard compression support to both `cache.js` and `compression.js`.

## Changes Made

### 1. Package Installation
- Installed `@mongodb-js/zstd` package for Node.js zstd support

### 2. Cache Module (`src/lib/cache.js`)

**MemoryCache:**
- Added `compressionAlgorithm` option (default: 'gzip', supports: 'gzip', 'zstd')
- Added `zstdLevel` option (1-22, default: 3)
- Updated compression/decompression logic to support both algorithms
- Stores compression algorithm metadata with cached entries

**RedisCache:**
- Added same zstd configuration options
- Auto-detects compression algorithm using magic bytes:
  - Gzip: `0x1f 0x8b`
  - Zstd: `0x28 0xb5 0x2f 0xfd`
- Updated stats to show compression algorithm per entry

**CacheManager:**
- Added `compressionAlgorithm` and `zstdLevel` parameters
- Passes configuration to underlying cache stores

### 3. Compression Module (`src/lib/compression.js`)

**Configuration:**
- Added `zstdLevel` to DEFAULT_CONFIG (default: 3)
- Updated all presets with zstd level settings
- Added new `zstd` preset optimized for Zstandard

**CompressionManager:**
- Added zstd cache map
- Updated validation to accept 'zstd' algorithm
- Added zstd level validation (1-22)
- Updated `compressBuffer()` to support zstd compression
- Updated `createCompressionStream()` with note that zstd streaming not yet implemented
- Updated stats and cache clearing to include zstd

**New Preset:**
```javascript
COMPRESSION_PRESETS.zstd = {
  algorithms: ['zstd', 'br', 'gzip', 'deflate'],
  zstdLevel: 3,
  // ... other settings
}
```

## Usage Examples

### Cache with Zstd
```javascript
const cache = new CacheManager({
  compressionAlgorithm: 'zstd',
  zstdLevel: 3, // 1=fastest, 22=best compression
});
```

### Compression Middleware with Zstd
```javascript
const { middleware } = createCompressionMiddleware(COMPRESSION_PRESETS.zstd);
// or
const { middleware } = createCompressionMiddleware({
  algorithms: ['zstd', 'br', 'gzip'],
  zstdLevel: 3,
});
```

## Performance Results (from test)

For repetitive JSON data (2011 bytes):
- **Zstd**: 37 bytes (98.16% reduction) - 0ms
- **Brotli**: 32 bytes (98.41% reduction) - 2ms
- **Gzip**: 54 bytes (97.31% reduction) - 1ms
- **Deflate**: 42 bytes (97.91% reduction) - 0ms

Zstd offers excellent speed with compression ratios between gzip and brotli.

## Limitations

1. **No Streaming Support**: Zstd streaming compression not yet implemented (would require Transform stream wrapper)
2. **Browser Support**: Zstd not supported in browsers - use for server-to-server or cache only
3. **Fallback**: Middleware automatically falls back to br/gzip/deflate for clients that don't support zstd

## Recommendations

**Use Zstd for:**
- Internal API caching
- Redis cache compression
- Server-to-server communication
- High-throughput scenarios
- Real-time compression needs

**Use Gzip/Brotli for:**
- Public-facing APIs
- Browser clients
- Maximum compatibility

## Files Modified

1. `src/lib/cache.js` - Added zstd support to cache system
2. `src/lib/compression.js` - Added zstd to compression middleware
3. `package.json` - Added @mongodb-js/zstd dependency
4. `examples/zstd-compression-example.md` - Usage documentation
5. `test-zstd.js` - Verification tests

## Testing

Run `node test-zstd.js` to verify zstd implementation works correctly.

All tests pass successfully! ✓
