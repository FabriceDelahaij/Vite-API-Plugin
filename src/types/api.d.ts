/**
 * Type definitions for API routes
 */

import { IncomingMessage, ServerResponse } from 'http';

/**
 * Extended request object with additional properties
 */
export interface ApiRequest extends IncomingMessage {
  /**
   * HTTP method (GET, POST, PUT, DELETE, etc.)
   */
  method: string;

  /**
   * Request URL
   */
  url: string;

  /**
   * Query parameters and dynamic route params (sanitized)
   */
  query: Record<string, string | string[]>;

  /**
   * Parsed request body (sanitized)
   */
  body: any;

  /**
   * Parsed cookies
   */
  cookies: Record<string, string>;

  /**
   * Client IP address
   */
  ip: string;

  /**
   * User object (populated by auth middleware)
   */
  user?: {
    userId?: number | string;
    email?: string;
    role?: string;
    permissions?: string[];
    [key: string]: any;
  };

  /**
   * API key (populated by API key auth)
   */
  apiKey?: string;

  /**
   * Session ID (populated by session auth)
   */
  sessionId?: string;

  /**
   * Generate a CSRF token
   */
  getCsrfToken(): string;
}

/**
 * Extended response object with helper methods
 */
export interface ApiResponse extends ServerResponse {
  /**
   * Set HTTP status code
   */
  status(code: number): this;

  /**
   * Send JSON response
   */
  json(data: any): this;

  /**
   * Send text or JSON response
   */
  send(data: any): this;

  /**
   * Set response header
   */
  setHeader(name: string, value: string | number | string[]): this;

  /**
   * Set secure cookie
   */
  setCookie(
    name: string,
    value: string,
    options?: CookieOptions
  ): this;
}

/**
 * Cookie options
 */
export interface CookieOptions {
  /**
   * Cookie expiration in seconds
   */
  maxAge?: number;

  /**
   * Cookie expiration date
   */
  expires?: Date;

  /**
   * Cookie path
   */
  path?: string;

  /**
   * Cookie domain
   */
  domain?: string;

  /**
   * Secure flag (HTTPS only)
   */
  secure?: boolean;

  /**
   * HttpOnly flag (not accessible via JavaScript)
   */
  httpOnly?: boolean;

  /**
   * SameSite attribute
   */
  sameSite?: 'strict' | 'lax' | 'none';
}

/**
 * API route handler function
 */
export type ApiHandler = (
  req: ApiRequest,
  res: ApiResponse
) => void | Promise<void>;

/**
 * API route with method-specific handlers
 */
export interface ApiRouteHandlers {
  get?: ApiHandler;
  post?: ApiHandler;
  put?: ApiHandler;
  delete?: ApiHandler;
  patch?: ApiHandler;
  options?: ApiHandler;
  default?: ApiHandler;
}

/**
 * Auth middleware function
 */
export type AuthMiddleware = (
  req: ApiRequest,
  res: ApiResponse
) => boolean | Promise<boolean>;

/**
 * CORS configuration
 */
export interface CorsConfig {
  origin: string | string[] | ((origin: string) => string | boolean);
  methods: string[];
  credentials: boolean;
  maxAge: number;
  allowedHeaders?: string[];
  exposedHeaders?: string[];
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  enableCsrf: boolean;
  enableHelmet: boolean;
  maxBodySize: number;
  allowedMethods: string[];
}

/**
 * HTTPS configuration
 */
export interface HttpsConfig {
  enabled: boolean;
  key: Buffer | string | null;
  cert: Buffer | string | null;
}

/**
 * Error tracking configuration
 */
export interface ErrorTrackingConfig {
  enabled: boolean;
  dsn: string | null;
  environment: string;
  sampleRate: number;
  beforeSend?: (event: any, hint: any) => any;
}

/**
 * Plugin options
 */
export interface ApiRoutesOptions {
  apiDir?: string;
  apiPrefix?: string;
  cors?: Partial<CorsConfig>;
  rateLimit?: Partial<RateLimitConfig>;
  security?: Partial<SecurityConfig>;
  https?: Partial<HttpsConfig>;
  errorTracking?: Partial<ErrorTrackingConfig>;
  auth?: AuthMiddleware | null;
}

/**
 * Default export for API route handlers
 */
export default ApiHandler;
