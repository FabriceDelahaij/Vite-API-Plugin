// TypeScript definitions for Vite API Routes Plugin

// Extended Request interface with custom properties
export interface ApiRequest extends Request {
  ip: string;
  user?: User;
  cookies: Record<string, string>;
  getCsrfToken(): string;
}

// User interface for authentication
export interface User {
  id: string | number;
  name: string;
  email: string;
  role?: string;
  permissions?: string[];
}

// API Response types
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Error response type
export interface ApiErrorResponse {
  error: string;
  message?: string;
  field?: string;
  code?: string;
}

// Success response type
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

// Pagination interface
export interface PaginationParams {
  page?: string;
  limit?: string;
  offset?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// HTTP Method handler types
export type GetHandler = (request: ApiRequest) => Promise<Response>;
export type PostHandler = (request: ApiRequest) => Promise<Response>;
export type PutHandler = (request: ApiRequest) => Promise<Response>;
export type PatchHandler = (request: ApiRequest) => Promise<Response>;
export type DeleteHandler = (request: ApiRequest) => Promise<Response>;
export type HeadHandler = (request: ApiRequest) => Promise<Response>;
export type OptionsHandler = (request: ApiRequest) => Promise<Response>;

// Generic API handler type
export type ApiHandler = 
  | GetHandler 
  | PostHandler 
  | PutHandler 
  | PatchHandler 
  | DeleteHandler 
  | HeadHandler 
  | OptionsHandler;

// Route parameter extraction helper
export interface RouteParams {
  [key: string]: string;
}

// Query parameter helper
export interface QueryParams {
  [key: string]: string | string[] | undefined;
}

// Cookie options interface
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
}

// Validation error interface
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// API configuration types
export interface CorsConfig {
  origin: string | string[] | '*';
  methods: string[];
  credentials: boolean;
  maxAge: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface SecurityConfig {
  enableCsrf: boolean;
  enableHelmet: boolean;
  maxBodySize: number;
  allowedMethods: string[];
}

export interface HttpsConfig {
  enabled: boolean;
  key?: Buffer | string;
  cert?: Buffer | string;
}

export interface ErrorTrackingConfig {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  sampleRate?: number;
  beforeSend?: (event: any, hint?: any) => any;
}

export interface AuthMiddleware {
  (request: ApiRequest, response: Response): Promise<boolean>;
}

export interface PluginConfig {
  apiDir?: string;
  apiPrefix?: string;
  cors?: CorsConfig;
  rateLimit?: RateLimitConfig;
  security?: SecurityConfig;
  https?: HttpsConfig;
  errorTracking?: ErrorTrackingConfig;
  auth?: AuthMiddleware;
}

// Utility types for response creation
export interface ResponseInit {
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
}

// Helper function types
export type CreateJsonResponse = <T>(data: T, init?: ResponseInit) => Response;
export type CreateErrorResponse = (error: string, status?: number) => Response;
export type ExtractRouteParams = (url: string, pattern: string) => RouteParams;
export type ParseQueryParams = (url: string) => QueryParams;