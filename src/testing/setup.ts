// Global test setup
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MockDatabase } from './index';

// Global test database
export const testDb = new MockDatabase();

// Global setup
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.API_TOKEN = 'test-token';
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
});

// Reset database before each test
beforeEach(() => {
  testDb.reset();
});

// Cleanup after each test
afterEach(() => {
  // Clear any test-specific state
});

// Global test utilities
declare global {
  var testDb: MockDatabase;
}

globalThis.testDb = testDb;