/**
 * Tests for CORS utilities
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
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
} from '../cors.js';

describe('CORS Utilities', () => {
  describe('createCorsConfig', () => {
    it('should create default CORS config', () => {
      const config = createCorsConfig();
      
      expect(config).toHaveProperty('origin');
      expect(config).toHaveProperty('credentials', true);
      expect(config).toHaveProperty('methods');
      expect(config.methods).toContain('GET');
      expect(config.methods).toContain('POST');
    });

    it('should allow no origin (same-origin requests)', () => {
      const config = createCorsConfig({ origins: ['https://example.com'] });
      const result = config.origin(null);
      
      expect(result).toBe(true);
    });

    it('should allow whitelisted origins', () => {
      const config = createCorsConfig({ 
        origins: ['https://example.com', 'https://app.example.com'] 
      });
      
      expect(config.origin('https://example.com')).toBe('https://example.com');
      expect(config.origin('https://app.example.com')).toBe('https://app.example.com');
      expect(config.origin('https://evil.com')).toBe(false);
    });

    it('should handle wildcard origins', () => {
      const config = createCorsConfig({ origins: ['*'] });
      
      expect(config.origin('https://any-domain.com')).toBe('https://any-domain.com');
      expect(config.origin('http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('should handle pattern matching with wildcards', () => {
      const config = createCorsConfig({ origins: ['https://*.example.com'] });
      
      expect(config.origin('https://app.example.com')).toBe('https://app.example.com');
      expect(config.origin('https://api.example.com')).toBe('https://api.example.com');
      expect(config.origin('https://example.com')).toBe(false);
      expect(config.origin('https://evil.com')).toBe(false);
    });

    it('should use custom origin validator', () => {
      const config = createCorsConfig({
        originValidator: (origin) => origin?.startsWith('https://trusted'),
      });
      
      expect(config.origin('https://trusted-site.com')).toBe('https://trusted-site.com');
      expect(config.origin('https://untrusted-site.com')).toBe(false);
    });
  });

  describe('createEnvCorsConfig', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.ALLOWED_ORIGINS;

    beforeEach(() => {
      delete process.env.NODE_ENV;
      delete process.env.ALLOWED_ORIGINS;
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.ALLOWED_ORIGINS = originalOrigins;
    });

    it('should allow localhost in development', () => {
      process.env.NODE_ENV = 'development';
      const config = createEnvCorsConfig();
      
      expect(config.origin('http://localhost:3000')).toBe('http://localhost:3000');
      expect(config.origin('http://localhost:5173')).toBe('http://localhost:5173');
    });

    it('should use ALLOWED_ORIGINS in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';
      
      const config = createEnvCorsConfig();
      
      expect(config.origin('https://example.com')).toBe('https://example.com');
      expect(config.origin('https://app.example.com')).toBe('https://app.example.com');
      expect(config.origin('https://evil.com')).toBe(false);
    });
  });

  describe('createDomainCorsConfig', () => {
    it('should allow domain and subdomains', () => {
      const config = createDomainCorsConfig('example.com');
      
      expect(config.origin('https://example.com')).toBe('https://example.com');
      expect(config.origin('https://www.example.com')).toBe('https://www.example.com');
      expect(config.origin('https://app.example.com')).toBe('https://app.example.com');
      expect(config.origin('https://api.example.com')).toBe('https://api.example.com');
    });
  });

  describe('createMultiEnvCorsConfig', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should use development config', () => {
      process.env.NODE_ENV = 'development';
      const config = createMultiEnvCorsConfig();
      
      expect(config.origin('http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('should use production config', () => {
      process.env.NODE_ENV = 'production';
      const config = createMultiEnvCorsConfig();
      
      expect(config.origin('https://example.com')).toBe('https://example.com');
      expect(config.origin('http://localhost:3000')).toBe(false);
    });
  });

  describe('isOriginAllowed', () => {
    it('should allow no origin', () => {
      expect(isOriginAllowed(null, ['https://example.com'])).toBe(true);
      expect(isOriginAllowed(undefined, ['https://example.com'])).toBe(true);
    });

    it('should allow wildcard', () => {
      expect(isOriginAllowed('https://any.com', ['*'])).toBe(true);
    });

    it('should check exact match', () => {
      const whitelist = ['https://example.com', 'https://app.example.com'];
      
      expect(isOriginAllowed('https://example.com', whitelist)).toBe(true);
      expect(isOriginAllowed('https://evil.com', whitelist)).toBe(false);
    });

    it('should handle pattern matching', () => {
      const whitelist = ['https://*.example.com'];
      
      expect(isOriginAllowed('https://app.example.com', whitelist)).toBe(true);
      expect(isOriginAllowed('https://api.example.com', whitelist)).toBe(true);
      expect(isOriginAllowed('https://example.com', whitelist)).toBe(false);
    });
  });

  describe('CorsPresets', () => {
    it('should have allowAll preset', () => {
      expect(CorsPresets.allowAll.origin).toBe('*');
      expect(CorsPresets.allowAll.credentials).toBe(false);
    });

    it('should have localhost preset', () => {
      expect(CorsPresets.localhost.origin).toContain('http://localhost:3000');
      expect(CorsPresets.localhost.credentials).toBe(true);
    });

    it('should have sameDomain preset with function', () => {
      process.env.DOMAIN = 'example.com';
      const result = CorsPresets.sameDomain.origin('https://example.com');
      expect(result).toBe(true);
    });

    it('should handle invalid URLs in sameDomain', () => {
      const result = CorsPresets.sameDomain.origin('not-a-url');
      expect(result).toBe(false);
    });
  });

  describe('getCorsConfig', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should return localhost config in development', () => {
      process.env.NODE_ENV = 'development';
      const config = getCorsConfig();
      
      expect(config).toEqual(CorsPresets.localhost);
    });

    it('should return strict production config', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      
      const config = getCorsConfig();
      
      expect(config.origin).toContain('https://example.com');
    });
  });

  describe('corsMiddleware', () => {
    it('should set CORS headers for allowed origin', () => {
      const middleware = corsMiddleware({ origins: ['https://example.com'] });
      
      const req = {
        method: 'GET',
        headers: { origin: 'https://example.com' },
      };
      
      const headers = {};
      const res = {
        setHeader: (key, value) => { headers[key] = value; },
        statusCode: 200,
        end: () => {},
      };
      
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
      expect(nextCalled).toBe(true);
    });

    it('should handle OPTIONS preflight', () => {
      const middleware = corsMiddleware({ origins: ['https://example.com'] });
      
      const req = {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' },
      };
      
      let statusCode = 200;
      let ended = false;
      const res = {
        setHeader: () => {},
        set statusCode(code) { statusCode = code; },
        get statusCode() { return statusCode; },
        end: () => { ended = true; },
      };
      
      const next = () => {};
      
      middleware(req, res, next);
      
      expect(statusCode).toBe(204);
      expect(ended).toBe(true);
    });

    it('should reject disallowed origin', () => {
      const middleware = corsMiddleware({ origins: ['https://example.com'] });
      
      const req = {
        method: 'GET',
        headers: { origin: 'https://evil.com' },
      };
      
      const headers = {};
      const res = {
        setHeader: (key, value) => { headers[key] = value; },
      };
      
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(nextCalled).toBe(true);
    });
  });

  describe('applyCorsHeaders', () => {
    it('should apply CORS headers to Response', () => {
      const response = new Response('test', { status: 200 });
      const result = applyCorsHeaders(response, 'https://example.com', {
        origins: ['https://example.com'],
      });
      
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('should not modify response for disallowed origin', () => {
      const response = new Response('test', { status: 200 });
      const result = applyCorsHeaders(response, 'https://evil.com', {
        origins: ['https://example.com'],
      });
      
      expect(result).toBe(response);
    });
  });

  describe('checkOrigin', () => {
    it('should return true for allowed origin', () => {
      expect(checkOrigin('https://example.com', { origins: ['https://example.com'] })).toBe(true);
    });

    it('should return false for disallowed origin', () => {
      expect(checkOrigin('https://evil.com', { origins: ['https://example.com'] })).toBe(false);
    });

    it('should return true for no origin', () => {
      expect(checkOrigin(null, { origins: ['https://example.com'] })).toBe(true);
    });
  });
});
