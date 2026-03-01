/**
 * Request ID Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateRequestId,
  extractRequestId,
  isValidRequestId,
  createChildRequestId,
  formatLogWithRequestId,
  RequestIdManager,
  RequestIdConfig,
} from '../request-id.js';

describe('Request ID Generation', () => {
  it('should generate UUID format by default', () => {
    const id = generateRequestId('uuid');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('should generate short format', () => {
    const id = generateRequestId('short');
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should generate timestamp format', () => {
    const id = generateRequestId('timestamp');
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-f]{8}$/);
  });

  it('should generate nanoid format', () => {
    const id = generateRequestId('nanoid');
    expect(id).toHaveLength(21);
    expect(id).toMatch(/^[0-9A-Za-z]{21}$/);
  });

  it('should add prefix when provided', () => {
    const id = generateRequestId('uuid', 'req');
    expect(id).toMatch(/^req_[0-9a-f]{8}-/);
  });
});

describe('Request ID Extraction', () => {
  it('should extract from primary header', () => {
    const headers = {
      'x-request-id': 'test-id-123',
    };
    const id = extractRequestId(headers);
    expect(id).toBe('test-id-123');
  });

  it('should extract from alternative headers', () => {
    const headers = {
      'x-correlation-id': 'correlation-123',
    };
    const id = extractRequestId(headers);
    expect(id).toBe('correlation-123');
  });

  it('should return null if no header found', () => {
    const headers = {};
    const id = extractRequestId(headers);
    expect(id).toBeNull();
  });

  it('should prioritize primary header', () => {
    const headers = {
      'x-request-id': 'primary-id',
      'x-correlation-id': 'secondary-id',
    };
    const id = extractRequestId(headers);
    expect(id).toBe('primary-id');
  });
});

describe('Request ID Validation', () => {
  it('should validate correct request IDs', () => {
    expect(isValidRequestId('req_550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidRequestId('a1b2c3d4e5f6g7h8')).toBe(true);
    expect(isValidRequestId('test-id-123')).toBe(true);
  });

  it('should reject invalid request IDs', () => {
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('short')).toBe(false); // Too short
    expect(isValidRequestId('a'.repeat(200))).toBe(false); // Too long
    expect(isValidRequestId('invalid@id#123')).toBe(false); // Invalid chars
    expect(isValidRequestId(null)).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId(123)).toBe(false);
  });
});

describe('Child Request IDs', () => {
  it('should create child request ID without suffix', () => {
    const parentId = 'parent-123';
    const childId = createChildRequestId(parentId);
    expect(childId).toMatch(/^parent-123\.[0-9a-f]{8}$/);
  });

  it('should create child request ID with suffix', () => {
    const parentId = 'parent-123';
    const childId = createChildRequestId(parentId, 'db');
    expect(childId).toMatch(/^parent-123\.db\.[0-9a-f]{8}$/);
  });
});

describe('Log Formatting', () => {
  it('should format log with request ID', () => {
    const log = formatLogWithRequestId('req-123', 'info', 'Test message');
    expect(log).toMatch(/^\[.*\] \[INFO\] \[req-123\] Test message$/);
  });

  it('should include metadata in log', () => {
    const log = formatLogWithRequestId('req-123', 'error', 'Error occurred', {
      code: 500,
      path: '/api/test',
    });
    expect(log).toContain('[ERROR]');
    expect(log).toContain('[req-123]');
    expect(log).toContain('Error occurred');
    expect(log).toContain('"code":500');
    expect(log).toContain('"path":"/api/test"');
  });
});

describe('RequestIdManager', () => {
  it('should track active requests', () => {
    const manager = new RequestIdManager();
    
    manager.startRequest('req-1', { method: 'GET', url: '/api/test' });
    
    const active = manager.getActiveRequests();
    expect(active).toHaveLength(1);
    expect(active[0].requestId).toBe('req-1');
    expect(active[0].method).toBe('GET');
  });

  it('should end requests and add to history', () => {
    const manager = new RequestIdManager();
    
    manager.startRequest('req-1', { method: 'GET' });
    manager.endRequest('req-1', { statusCode: 200 });
    
    const active = manager.getActiveRequests();
    expect(active).toHaveLength(0);
    
    const history = manager.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].requestId).toBe('req-1');
    expect(history[0].statusCode).toBe(200);
    expect(history[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('should get request by ID', () => {
    const manager = new RequestIdManager();
    
    manager.startRequest('req-1', { method: 'POST' });
    
    const request = manager.getRequest('req-1');
    expect(request).toBeDefined();
    expect(request.requestId).toBe('req-1');
    expect(request.method).toBe('POST');
  });

  it('should calculate statistics', () => {
    const manager = new RequestIdManager();
    
    manager.startRequest('req-1', { method: 'GET' });
    manager.endRequest('req-1', { statusCode: 200 });
    
    manager.startRequest('req-2', { method: 'POST' });
    manager.endRequest('req-2', { statusCode: 201 });
    
    manager.startRequest('req-3', { method: 'GET' });
    manager.endRequest('req-3', { statusCode: 500 });
    
    const stats = manager.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.activeRequests).toBe(0);
    expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    expect(stats.successRate).toBeDefined();
  });

  it('should limit history size', () => {
    const manager = new RequestIdManager();
    manager.maxHistorySize = 5;
    
    // Add more than max
    for (let i = 0; i < 10; i++) {
      manager.startRequest(`req-${i}`);
      manager.endRequest(`req-${i}`, { statusCode: 200 });
    }
    
    const history = manager.getHistory();
    expect(history.length).toBeLessThanOrEqual(5);
  });

  it('should clear history', () => {
    const manager = new RequestIdManager();
    
    manager.startRequest('req-1');
    manager.endRequest('req-1', { statusCode: 200 });
    
    expect(manager.getHistory()).toHaveLength(1);
    
    manager.clearHistory();
    
    expect(manager.getHistory()).toHaveLength(0);
  });
});

describe('Request ID Config', () => {
  it('should have default configuration', () => {
    expect(RequestIdConfig.headerName).toBe('X-Request-ID');
    expect(RequestIdConfig.format).toBe('uuid');
    expect(RequestIdConfig.prefix).toBe('req');
    expect(RequestIdConfig.includeInResponse).toBe(true);
    expect(RequestIdConfig.logRequestId).toBe(true);
  });

  it('should have alternative headers', () => {
    expect(RequestIdConfig.alternativeHeaders).toContain('X-Correlation-ID');
    expect(RequestIdConfig.alternativeHeaders).toContain('Request-ID');
  });
});
