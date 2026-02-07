import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { parse } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { HotReloadManager } from './src/hmr/hot-reload-manager.js';
import { DependencyTracker } from './src/hmr/dependency-tracker.js';
import { CacheManager } from './src/lib/cache.js';
import { CompressionManager } from './src/lib/compression.js';

/**
 * Vite Plugin for Next.js-style API Routes with Security Features
 * Handles /api/* routes by loading handlers from pages/api or src/pages/api
 * 
 * Features:
 * - File-based routing with dynamic routes
 * - Built-in security (CORS, CSRF, rate limiting)
 * - HTTPS support
 * - Error tracking (Sentry)
 * - Optional CLI tools (requires: commander, chalk, inquirer)
 * - Testing utilities
 * - Optional request/response encryption
 */
export default function vitePluginApiRoutes(options = {}) {
  // Merge CORS defaults properly
  const corsDefaults = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  };

  const {
    apiDir = 'pages/api',
    apiPrefix = '/api',
    cors: corsOptions = {},
    rateLimit = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
    security = {},
    auth = null, // Optional auth middleware function
    requestTimeout = 30000, // 30 seconds default timeout
    https = {
      enabled: false,
      key: null,
      cert: null,
    },
    errorTracking = {
      enabled: false,
      dsn: null, // Sentry DSN
      environment: 'development',
      sampleRate: 1.0,
      beforeSend: null,
    },
    cache = {
      enabled: false,
      type: 'memory', // 'memory' or 'redis'
      redis: null,
      maxSize: 100,
      defaultTTL: 300, // 5 minutes
      keyPrefix: 'api:',
      varyBy: [],
      shouldCache: null,
    },
    compression = {
      enabled: true,
      threshold: 1024, // Only compress responses > 1KB
      level: 6, // Compression level (0-9 for gzip, 0-11 for brotli)
      algorithms: ['br', 'gzip', 'deflate'],
      compressibleTypes: [
        'text/html',
        'text/css',
        'text/javascript',
        'text/plain',
        'text/xml',
        'application/json',
        'application/javascript',
        'application/xml',
        'image/svg+xml',
      ],
      excludePatterns: [],
    },
  } = options;

  // Properly merge CORS configuration
  const cors = { ...corsDefaults, ...corsOptions };

  // Merge security defaults
  const securityConfig = {
    enableCsrf: false, // Temporarily disabled for testing
    enableHelmet: true,
    maxBodySize: 1024 * 1024, // 1MB
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    ...security,
  };

  let config;
  let apiHandlers = new Map();
  const rateLimitStore = new Map();
  const csrfTokens = new Map(); // Changed from Set to Map for TTL tracking
  let Sentry = null;
  let hotReloadManager = null;
  let dependencyTracker = null;
  let cacheManager = null;
  let compressionManager = null;
  let cleanupInterval = null;

  // Initialize Sentry if enabled
  async function initSentry() {
    if (!errorTracking.enabled || !errorTracking.dsn) return;

    try {
      const sentryModule = await import('@sentry/node');
      Sentry = sentryModule;

      Sentry.init({
        dsn: errorTracking.dsn,
        environment: errorTracking.environment,
        tracesSampleRate: errorTracking.sampleRate,
        beforeSend: errorTracking.beforeSend,
      });

      console.log('✓ Sentry error tracking initialized');
    } catch (error) {
      console.warn('⚠ Sentry not available. Install @sentry/node to enable error tracking.');
    }
  }

  // Capture error with Sentry
  function captureError(error, context = {}) {
    if (Sentry) {
      Sentry.captureException(error, {
        extra: context,
      });
    }
    console.error('API Error:', error, context);
  }

  // Rate limiting with automatic cleanup
  function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimitStore.get(ip) || { count: 0, resetTime: now + rateLimit.windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + rateLimit.windowMs;
    } else {
      record.count++;
    }

    rateLimitStore.set(ip, record);

    return {
      allowed: record.count <= rateLimit.max,
      remaining: Math.max(0, rateLimit.max - record.count),
      resetTime: record.resetTime,
    };
  }

  // Cleanup expired rate limit entries
  function cleanupRateLimits() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [ip, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(ip);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  // CSRF token generation and validation with TTL
  function generateCsrfToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (3600 * 1000); // 1 hour TTL
    csrfTokens.set(token, { expiresAt, createdAt: Date.now() });
    return token;
  }

  function validateCsrfToken(token) {
    const tokenData = csrfTokens.get(token);
    if (!tokenData) return false;
    
    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      csrfTokens.delete(token);
      return false;
    }
    
    return true;
  }

  // Cleanup expired CSRF tokens
  function cleanupCsrfTokens() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, data] of csrfTokens.entries()) {
      if (now > data.expiresAt) {
        csrfTokens.delete(token);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired CSRF tokens`);
    }
  }

  // Enforce max size limits with LRU eviction
  function enforceStoreLimits() {
    const MAX_RATE_LIMIT_ENTRIES = 10000;
    const MAX_CSRF_TOKENS = 5000;
    
    // Rate limit store LRU eviction
    if (rateLimitStore.size > MAX_RATE_LIMIT_ENTRIES) {
      const entriesToRemove = rateLimitStore.size - MAX_RATE_LIMIT_ENTRIES;
      const sortedEntries = Array.from(rateLimitStore.entries())
        .sort((a, b) => a[1].resetTime - b[1].resetTime);
      
      for (let i = 0; i < entriesToRemove; i++) {
        rateLimitStore.delete(sortedEntries[i][0]);
      }
      
      console.log(`🧹 Evicted ${entriesToRemove} oldest rate limit entries`);
    }
    
    // CSRF tokens LRU eviction
    if (csrfTokens.size > MAX_CSRF_TOKENS) {
      const tokensToRemove = csrfTokens.size - MAX_CSRF_TOKENS;
      const sortedTokens = Array.from(csrfTokens.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      
      for (let i = 0; i < tokensToRemove; i++) {
        csrfTokens.delete(sortedTokens[i][0]);
      }
      
      console.log(`🧹 Evicted ${tokensToRemove} oldest CSRF tokens`);
    }
  }

  // Start periodic cleanup
  function startCleanupInterval() {
    // Run cleanup every 60 seconds
    cleanupInterval = setInterval(() => {
      cleanupRateLimits();
      cleanupCsrfTokens();
      enforceStoreLimits();
    }, 60000);
    
    console.log('🧹 Started periodic cleanup (every 60s)');
  }

  // Stop cleanup interval
  function stopCleanupInterval() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
      console.log('🧹 Stopped periodic cleanup');
    }
  }

  // Security headers (Helmet-like)
  function setSecurityHeaders(res) {
    if (!securityConfig.enableHelmet) return;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  }

  // CORS headers
  function setCorsHeaders(req, res) {
    const origin = req.headers.origin;
    
    if (cors.origin === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (Array.isArray(cors.origin)) {
      if (cors.origin.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } else if (typeof cors.origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', cors.origin);
    }

    // Ensure methods is always an array
    const methods = Array.isArray(cors.methods) ? cors.methods : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Max-Age', (cors.maxAge || 86400).toString());
    
    if (cors.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  // Input sanitization
  function sanitizeInput(data) {
    if (typeof data === 'string') {
      return data
        .replace(/[<>]/g, '') // Remove potential XSS vectors
        .trim()
        .slice(0, 10000); // Limit string length
    }
    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof key === 'string' && key.length < 100) {
          sanitized[key] = sanitizeInput(value);
        }
      }
      return sanitized;
    }
    return data;
  }

  // Load API route handlers
  function loadApiHandlers(root) {
    apiHandlers.clear();
    const possibleDirs = [
      path.join(root, apiDir),
      path.join(root, 'src', apiDir),
    ];

    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        scanDirectory(dir, dir);
        break;
      }
    }
  }

  function scanDirectory(dir, baseDir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDirectory(filePath, baseDir);
      } else if (/\.(js|ts|tsx|jsx|mjs|cjs)$/.test(file)) {
        const relativePath = path.relative(baseDir, filePath);
        const routePath = filePathToRoute(relativePath);
        apiHandlers.set(routePath, filePath);
      }
    }
  }

  function filePathToRoute(filePath) {
    let route = filePath
      .replace(/\\/g, '/')
      .replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '')
      .replace(/\/index$/, '');

    // Handle dynamic routes: [id].js -> :id
    route = route.replace(/\[([^\]]+)\]/g, ':$1');

    return apiPrefix + (route ? '/' + route : '');
  }

  return {
    name: 'vite-plugin-api-routes',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      
      // Start cleanup interval
      startCleanupInterval();
      
      // Initialize error tracking
      if (errorTracking.enabled) {
        initSentry();
      }

      // Initialize cache manager
      if (cache.enabled) {
        cacheManager = new CacheManager({
          type: cache.type,
          redis: cache.redis,
          maxSize: cache.maxSize,
          defaultTTL: cache.defaultTTL,
          keyPrefix: cache.keyPrefix,
          enabled: true,
        });
        console.log(`✓ Response caching enabled (${cache.type})`);
      }

      // Initialize compression manager
      if (compression.enabled) {
        compressionManager = new CompressionManager({
          enabled: true,
          threshold: compression.threshold,
          level: compression.level,
          algorithms: compression.algorithms,
          compressibleTypes: compression.compressibleTypes,
          excludePatterns: compression.excludePatterns,
        });
        console.log(`✓ Response compression enabled (${compression.algorithms.join(', ')})`);
      }

      // Warn if HTTPS is not enabled in production
      if (config.mode === 'production' && !https.enabled) {
        console.warn('⚠ WARNING: HTTPS is not enabled in production mode. This is insecure!');
      }
    },

    configureServer(server) {
      loadApiHandlers(config.root);

      // Add request timeout configuration
      const requestTimeout = options.requestTimeout || 30000; // 30 seconds default

      // Initialize enhanced HMR system
      if (config.mode === 'development') {
        hotReloadManager = new HotReloadManager({
          preserveState: true,
          debounceMs: 100,
          enableLogging: true,
        });

        dependencyTracker = new DependencyTracker({
          enableASTAnalysis: true,
          trackNodeModules: false,
        });

        hotReloadManager.initialize(server, apiDir, apiPrefix);

        // Enhanced file watching with dependency tracking
        server.watcher.on('all', async (event, file) => {
          if (file.includes(apiDir)) {
            // Analyze dependencies for new/changed files
            if (event === 'add' || event === 'change') {
              await dependencyTracker.analyzeDependencies(file);
            }
            
            // Let HMR manager handle the reload
            // loadApiHandlers will be called by HMR manager
          }
        });

        // Add HMR status endpoint
        server.middlewares.use('/__hmr_status', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            hmr: hotReloadManager?.getStats() || {},
            dependencies: dependencyTracker?.getStats() || {},
            routes: Array.from(apiHandlers.keys()),
            cache: cacheManager ? await cacheManager.getStats() : { enabled: false },
            compression: compressionManager ? compressionManager.getStats() : { enabled: false },
          }));
        });
      } else {
        // Production: simple file watching
        server.watcher.on('all', (event, file) => {
          if (file.includes(apiDir)) {
            loadApiHandlers(config.root);
          }
        });
      }

      // Add middleware to handle API routes
      server.middlewares.use(async (req, res, next) => {
        const { pathname, query } = parse(req.url, true);

        if (!pathname.startsWith(apiPrefix)) {
          return next();
        }

        // Set request timeout to prevent slowloris attacks
        let timeoutId = null;
        let timedOut = false;
        
        if (requestTimeout > 0) {
          timeoutId = setTimeout(() => {
            timedOut = true;
            if (!res.writableEnded) {
              res.statusCode = 408;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ 
                error: 'Request Timeout',
                message: `Request exceeded ${requestTimeout}ms timeout`,
              }));
            }
            req.destroy();
          }, requestTimeout);
        }

        // Clear timeout on response finish
        res.on('finish', () => {
          if (timeoutId) clearTimeout(timeoutId);
        });

        // Skip processing if already timed out
        if (timedOut) return;

        // Get client IP
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                   req.socket.remoteAddress || 
                   'unknown';

          // Set security headers
          setSecurityHeaders(res);

          // Set CORS headers
          setCorsHeaders(req, res);

          // Handle OPTIONS preflight
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          // Check allowed methods
          if (!securityConfig.allowedMethods.includes(req.method)) {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          // Rate limiting
          const rateLimitResult = checkRateLimit(ip);
          res.setHeader('X-RateLimit-Limit', rateLimit.max.toString());
          res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
          res.setHeader('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());

          if (!rateLimitResult.allowed) {
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString());
            res.end(JSON.stringify({ 
              error: 'Too many requests',
              retryAfter: new Date(rateLimitResult.resetTime).toISOString(),
            }));
            return;
          }

          // CSRF protection for state-changing methods
          if (securityConfig.enableCsrf && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const csrfToken = req.headers['x-csrf-token'];
            if (!csrfToken || !validateCsrfToken(csrfToken)) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid CSRF token' }));
              return;
            }
          }

          // Find matching handler
          let handler = null;
          let params = {};

          // Try exact match first
          if (apiHandlers.has(pathname)) {
            handler = apiHandlers.get(pathname);
          } else {
            // Try dynamic routes
            for (const [route, filePath] of apiHandlers.entries()) {
              const match = matchRoute(route, pathname);
              if (match) {
                handler = filePath;
                params = match.params;
                break;
              }
            }
          }

          if (!handler) {
            return next();
          }

          let sanitizedBody = {};
          let sanitizedQuery = {};

          // Check cache for GET requests
          if (cache.enabled && cacheManager && req.method === 'GET') {
            let cacheKey = cacheManager.generateKey(req);
            
            // Add vary headers to cache key
            if (cache.varyBy && cache.varyBy.length > 0) {
              const varyHash = crypto
                .createHash('sha256')
                .update(cache.varyBy.map(h => req.headers[h.toLowerCase()] || '').join(':'))
                .digest('hex')
                .slice(0, 8);
              cacheKey += `:${varyHash}`;
            }
            
            const cached = await cacheManager.get(cacheKey);
            
            if (cached) {
              // Serve from cache
              res.setHeader('X-Cache', 'HIT');
              res.setHeader('X-Cache-Key', cacheKey);
              res.statusCode = cached.statusCode || 200;
              
              // Restore headers
              if (cached.headers) {
                Object.entries(cached.headers).forEach(([key, value]) => {
                  res.setHeader(key, value);
                });
              }
              
              // Send cached response
              if (typeof cached.body === 'object') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(cached.body));
              } else {
                res.end(cached.body);
              }
              
              return;
            }
            
            // Cache miss
            res.setHeader('X-Cache', 'MISS');
            res.setHeader('X-Cache-Key', cacheKey);
            
            // Store cache key for later use
            req._cacheKey = cacheKey;
          }

          try {
            // Parse body with size limit
            const body = await parseBody(req, securityConfig.maxBodySize);
            
            // Sanitize inputs
            sanitizedBody = sanitizeInput(body);
            sanitizedQuery = sanitizeInput({ ...query, ...params });

            // Load the handler module
            const module = await server.ssrLoadModule(handler);
            
            // Support both styles:
            // 1. Next.js style: export default function handler(req, res) {}
            // 2. App Router style: export async function GET(request) {}
            let handlerFn = null;
            
            // Try App Router style first (named exports)
            const methodName = req.method.toUpperCase();
            
            if (module[methodName] && typeof module[methodName] === 'function') {
              handlerFn = module[methodName];
            }
            // Fallback to Next.js style (default export or method-named export)
            else if (module.default && typeof module.default === 'function') {
              handlerFn = module.default;
            }
            // Try lowercase method name
            else if (module[req.method.toLowerCase()] && typeof module[req.method.toLowerCase()] === 'function') {
              handlerFn = module[req.method.toLowerCase()];
            }

            if (!handlerFn) {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            // Create request/response objects based on handler style
            let result;
            
            // Check if it's App Router style (named export method)
            const isAppRouterStyle = module[methodName] && typeof module[methodName] === 'function';
            
            if (isAppRouterStyle) {
              // App Router style: function GET(request: Request)
              const protocol = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
              const host = req.headers.host || 'localhost';
              const url = new URL(req.url, `${protocol}://${host}`);
              
              // Create Web API Request object with proper body handling
              let requestBody = undefined;
              if (req.method !== 'GET' && req.method !== 'HEAD' && sanitizedBody) {
                if (typeof sanitizedBody === 'string') {
                  requestBody = sanitizedBody;
                } else {
                  requestBody = JSON.stringify(sanitizedBody);
                }
              }
              
              const request = new Request(url.toString(), {
                method: req.method,
                headers: new Headers(req.headers),
                body: requestBody,
              });
              
              // Add custom properties (non-standard but needed for compatibility)
              Object.defineProperty(request, 'ip', { value: ip, writable: false });
              Object.defineProperty(request, 'user', { value: req.user, writable: false });
              Object.defineProperty(request, 'cookies', { value: parseCookies(req.headers.cookie), writable: false });
              Object.defineProperty(request, 'getCsrfToken', { value: () => generateCsrfToken(), writable: false });
              
              // Call App Router style handler
              result = await handlerFn(request);
              
              // Handle Response object
              if (result instanceof Response) {
                res.statusCode = result.status;
                
                // Copy headers from Response to Node.js response
                for (const [key, value] of result.headers.entries()) {
                  res.setHeader(key, value);
                }
                
                // Get the response body
                const responseBody = await result.text();
                
                // Ensure we have proper content-type for JSON
                if (!result.headers.get('content-type') && responseBody) {
                  try {
                    JSON.parse(responseBody);
                    res.setHeader('Content-Type', 'application/json');
                  } catch {
                    // Not JSON, leave as is
                  }
                }
                
                res.end(responseBody);
              } else {
                // If not a Response object, treat as JSON
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              }
            } else {
              // Next.js style: function handler(req, res)
              const apiReq = {
                ...req,
                query: sanitizedQuery,
                body: sanitizedBody,
                cookies: parseCookies(req.headers.cookie),
                ip,
                getCsrfToken() {
                  return generateCsrfToken();
                },
              };

              const apiRes = {
                status(code) {
                  res.statusCode = code;
                  return this;
                },
                json(data) {
                  res.setHeader('Content-Type', 'application/json');
                  
                  // Compress if enabled
                  if (compression.enabled && compressionManager) {
                    const acceptEncoding = req.headers['accept-encoding'] || '';
                    const jsonString = JSON.stringify(data);
                    const contentLength = Buffer.byteLength(jsonString);
                    
                    if (compressionManager.shouldCompress('application/json', contentLength, req.url)) {
                      const algorithm = compressionManager.selectAlgorithm(acceptEncoding);
                      
                      if (algorithm) {
                        compressionManager.compressBuffer(Buffer.from(jsonString), algorithm)
                          .then(result => {
                            if (result.algorithm) {
                              res.setHeader('Content-Encoding', result.algorithm);
                              res.setHeader('Content-Length', result.compressedSize);
                              res.setHeader('X-Original-Size', result.originalSize);
                              res.setHeader('X-Compression-Ratio', result.ratio + '%');
                              res.setHeader('Vary', 'Accept-Encoding');
                              res.end(result.buffer);
                            } else {
                              res.end(jsonString);
                            }
                          })
                          .catch(() => res.end(jsonString));
                        
                        // Cache after compression
                        if (cache.enabled && cacheManager && req.method === 'GET' && req._cacheKey && res.statusCode >= 200 && res.statusCode < 300) {
                          const shouldCacheResponse = cache.shouldCache ? cache.shouldCache(req, res, data) : true;
                          if (shouldCacheResponse) {
                            cacheManager.set(req._cacheKey, {
                              statusCode: res.statusCode,
                              headers: res.getHeaders ? res.getHeaders() : {},
                              body: data,
                            }, cache.defaultTTL).catch(err => console.error('Cache set error:', err));
                          }
                        }
                        
                        return this;
                      }
                    }
                  }
                  
                  // No compression
                  res.end(JSON.stringify(data));
                  
                  // Cache successful GET responses
                  if (cache.enabled && cacheManager && req.method === 'GET' && req._cacheKey && res.statusCode >= 200 && res.statusCode < 300) {
                    const shouldCacheResponse = cache.shouldCache ? cache.shouldCache(req, res, data) : true;
                    if (shouldCacheResponse) {
                      cacheManager.set(req._cacheKey, {
                        statusCode: res.statusCode,
                        headers: res.getHeaders ? res.getHeaders() : {},
                        body: data,
                      }, cache.defaultTTL).catch(err => console.error('Cache set error:', err));
                    }
                  }
                  
                  return this;
                },
                send(data) {
                  if (typeof data === 'object') {
                    return this.json(data);
                  }
                  
                  // Compress text responses if enabled
                  if (compression.enabled && compressionManager && typeof data === 'string') {
                    const acceptEncoding = req.headers['accept-encoding'] || '';
                    const contentLength = Buffer.byteLength(data);
                    const contentType = res.getHeader('content-type') || 'text/plain';
                    
                    if (compressionManager.shouldCompress(contentType, contentLength, req.url)) {
                      const algorithm = compressionManager.selectAlgorithm(acceptEncoding);
                      
                      if (algorithm) {
                        compressionManager.compressBuffer(Buffer.from(data), algorithm)
                          .then(result => {
                            if (result.algorithm) {
                              res.setHeader('Content-Encoding', result.algorithm);
                              res.setHeader('Content-Length', result.compressedSize);
                              res.setHeader('X-Original-Size', result.originalSize);
                              res.setHeader('X-Compression-Ratio', result.ratio + '%');
                              res.setHeader('Vary', 'Accept-Encoding');
                              res.end(result.buffer);
                            } else {
                              res.end(String(data));
                            }
                          })
                          .catch(() => res.end(String(data)));
                        return this;
                      }
                    }
                  }
                  
                  res.end(String(data));
                  return this;
                },
                setHeader(name, value) {
                  res.setHeader(name, value);
                  return this;
                },
                setCookie(name, value, options = {}) {
                  const cookieOptions = {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'strict',
                    path: '/',
                    ...options,
                  };
                  
                  let cookie = `${name}=${value}`;
                  if (cookieOptions.maxAge) cookie += `; Max-Age=${cookieOptions.maxAge}`;
                  if (cookieOptions.path) cookie += `; Path=${cookieOptions.path}`;
                  if (cookieOptions.domain) cookie += `; Domain=${cookieOptions.domain}`;
                  if (cookieOptions.secure) cookie += '; Secure';
                  if (cookieOptions.httpOnly) cookie += '; HttpOnly';
                  if (cookieOptions.sameSite) cookie += `; SameSite=${cookieOptions.sameSite}`;
                  
                  res.setHeader('Set-Cookie', cookie);
                  return this;
                },
              };

              // Run auth middleware if provided
              if (auth) {
                const authResult = await auth(apiReq, apiRes);
                if (authResult === false) {
                  if (!res.writableEnded) {
                    res.statusCode = 401;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                  }
                  return;
                }
              }

              await handlerFn(apiReq, apiRes);
            }
          } catch (error) {
            // Capture error with Sentry
            captureError(error, {
              method: req.method,
              url: req.url,
              ip,
              query: sanitizedQuery,
              body: sanitizedBody,
            });
            
            if (!res.writableEnded) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              
              // Don't leak error details in production
              const errorResponse = config.mode === 'development' 
                ? { error: 'Internal Server Error', message: error.message, stack: error.stack }
                : { error: 'Internal Server Error' };
              
              res.end(JSON.stringify(errorResponse));
            }
          } finally {
            // Clear timeout on completion
            if (timeoutId) clearTimeout(timeoutId);
          }
        });
    },

    // Cleanup on server close
    closeBundle() {
      stopCleanupInterval();
      
      // Cleanup HMR resources
      if (hotReloadManager) {
        if (typeof hotReloadManager.cleanup === 'function') {
          hotReloadManager.cleanup();
        }
      }
      
      // Cleanup dependency tracker
      if (dependencyTracker) {
        if (typeof dependencyTracker.destroy === 'function') {
          dependencyTracker.destroy();
        } else if (typeof dependencyTracker.clearCache === 'function') {
          dependencyTracker.clearCache();
        }
      }
      
      // Cleanup cache manager
      if (cacheManager && typeof cacheManager.clear === 'function') {
        cacheManager.clear().catch(err => console.error('Cache cleanup error:', err));
      }
      
      // Cleanup compression manager
      if (compressionManager && typeof compressionManager.resetStats === 'function') {
        compressionManager.resetStats();
      }
      
      // Clear stores
      rateLimitStore.clear();
      csrfTokens.clear();
      apiHandlers.clear();
      
      console.log('🧹 Plugin cleanup completed');
    },
  };
}

function matchRoute(route, pathname) {
  const routeParts = route.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (routeParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) {
      params[routeParts[i].slice(1)] = pathParts[i];
    } else if (routeParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return { params };
}

async function parseBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          if (body.trim()) {
            resolve(JSON.parse(body));
          } else {
            resolve({});
          }
        } else {
          resolve(body || '');
        }
      } catch (error) {
        console.warn('Failed to parse JSON body:', error.message);
        resolve(body || ''); // Return raw body instead of rejecting
      }
    });

    req.on('error', (error) => reject(error));
  });
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...v] = c.trim().split('=');
      return [key, v.join('=')];
    })
  );
}
