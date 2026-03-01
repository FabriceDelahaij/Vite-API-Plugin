/**
 * Vite API Routes Plugin - Main Entry Point
 * 
 * This file exports all public APIs, types, and utilities
 * for use in consuming applications.
 */

// Main plugin export
export { default } from '../vite-plugin-api-routes.js';

// Type definitions
export type {
  // Request/Response types
  ApiRequest,
  User,
  ApiResponse,
  ApiErrorResponse,
  ApiSuccessResponse,
  
  // Pagination types
  PaginationParams,
  PaginatedResponse,
  
  // Handler types
  GetHandler,
  PostHandler,
  PutHandler,
  PatchHandler,
  DeleteHandler,
  HeadHandler,
  OptionsHandler,
  ApiHandler,
  
  // Route types
  RouteParams,
  QueryParams,
  
  // Cookie types
  CookieOptions,
  
  // Validation types
  ValidationError,
  
  // Configuration types
  CorsConfig,
  RateLimitConfig,
  SecurityConfig,
  HttpsConfig,
  ErrorTrackingConfig,
  AuthMiddleware,
  PluginConfig,
  
  // Utility types
  ResponseInit,
  CreateJsonResponse,
  CreateErrorResponse,
  ExtractRouteParams,
  ParseQueryParams,
} from './types/api';

// API Helper functions
export {
  createJsonResponse,
  createErrorResponse,
  createSuccessResponse,
  extractRouteParams,
  parseQueryParams,
  isValidEmail,
  validateRequired,
  validateStringLength,
  createCookieString,
  parsePagination,
  createPaginationResponse,
  safeJsonParse,
  RateLimiter,
} from './utils/api-helpers.js';

// Authentication utilities
export {
  JWT,
  APIKeyAuth,
  SessionAuth,
  Password,
  createAuthMiddleware,
  requireRole,
  requirePermission,
} from './lib/auth.js';

// CORS utilities
export {
  createCorsConfig,
  createEnvCorsConfig,
  createDomainCorsConfig,
  createMultiEnvCorsConfig,
  isOriginAllowed,
  logCorsViolation,
  CorsPresets,
  getCorsConfig,
  corsMiddleware,
  applyCorsHeaders,
  checkOrigin,
} from './lib/cors.js';

// Cookie utilities
export {
  CookiePresets,
  createCookieConfig,
  serializeCookie,
  parseCookies,
  clearCookie,
  CookieManager,
  CookieSecurityValidator,
  SignedCookie,
  getEnvironmentCookieConfig,
} from './lib/cookies.js';

// Cache utilities
export {
  MemoryCache,
  CacheManager,
  createCacheMiddleware,
} from './lib/cache.js';

// Compression utilities
export {
  COMPRESSION_PRESETS,
  CompressionManager,
  createCompressionMiddleware,
} from './lib/compression.js';

// Request ID utilities
export {
  generateRequestId,
  extractRequestId,
  isValidRequestId,
  requestIdMiddleware,
  createRequestIdHandler,
  RequestIdManager,
  globalRequestIdManager,
  withRequestId,
  getRequestId,
  createChildRequestId,
  formatLogWithRequestId,
  createRequestLogger,
  getRequestIdConfig,
  RequestIdConfig,
} from './lib/request-id.js';

// Environment utilities
export {
  EnvSchema,
  EnvLoader,
  SecretGenerator,
  EnvChecker,
  validateEnvironment,
  createEnvExample,
  generateSecretsCommand,
  maskSensitive,
} from './lib/env.js';

// Encryption utilities
export {
  createEncryptionManager,
  withEncryption,
  ClientEncryption,
  defaultEncryption,
} from './utils/encryption';

export type {
  EncryptionConfig,
  EncryptedData,
  KeyMetadata,
} from './utils/encryption';
