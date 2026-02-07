/**
 * Integration tests for HMR functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HotReloadManager } from '../hot-reload-manager.js';
import { DependencyTracker } from '../dependency-tracker.js';
import { globalStateManager, createStatefulHandler, createCache } from '../state-manager.js';

describe('HMR Integration', () => {
  let hmrManager;
  let dependencyTracker;
  let mockServer;

  beforeEach(() => {
    // Mock Vite server
    mockServer = {
      watcher: {
        on: vi.fn(),
      },
      ws: {
        send: vi.fn(),
      },
      moduleGraph: {
        getModuleById: vi.fn(),
      },
      reloadModule: vi.fn(),
      ssrLoadModule: vi.fn(),
    };

    hmrManager = new HotReloadManager({
      enableLogging: false,
    });

    dependencyTracker = new DependencyTracker({
      enableASTAnalysis: false, // Disable for testing
    });
  });

  afterEach(() => {
    hmrManager?.cleanup();
    globalStateManager.stateStorage.clear();
  });

  describe('State Preservation', () => {
    it('should preserve state across handler recreation', () => {
      // Create initial handler
      const handler1 = createStatefulHandler({ count: 0 }, {
        increment() {
          return handler1.updateState(prev => ({ count: prev.count + 1 }));
        }
      });

      // Update state
      handler1.increment();
      expect(handler1.getState().count).toBe(1);

      // Simulate HMR by creating new handler with same route ID
      const routeId = handler1.__routeId;
      globalStateManager.stateStorage.set(routeId, { count: 1 });

      const handler2 = createStatefulHandler({ count: 0 }, {
        increment() {
          return handler2.updateState(prev => ({ count: prev.count + 1 }));
        }
      });

      // State should be preserved
      expect(handler2.getState().count).toBe(1);
    });

    it('should handle state subscriptions', () => {
      const handler = createStatefulHandler({ value: 'initial' }, {});
      const changes = [];

      handler.onStateChange((newState, prevState) => {
        changes.push({ from: prevState.value, to: newState.value });
      });

      handler.setState({ value: 'updated' });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ from: 'initial', to: 'updated' });
    });
  });

  describe('Cache Management', () => {
    it('should create persistent cache', () => {
      const cache = createCache('test-cache', 1000);

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.size()).toBe(1);
    });

    it('should handle TTL expiration', async () => {
      const cache = createCache('ttl-cache', 50); // 50ms TTL

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.get('key1')).toBeNull();
    });

    it('should support custom TTL per item', () => {
      const cache = createCache('custom-ttl-cache', 1000);

      cache.set('short', 'value', 50);
      cache.set('long', 'value', 2000);

      expect(cache.get('short')).toBe('value');
      expect(cache.get('long')).toBe('value');
    });
  });

  describe('Dependency Tracking', () => {
    it('should track file dependencies', async () => {
      const mockFilePath = '/test/api/route.js';
      const dependencies = new Set([
        { path: '/test/lib/utils.js', type: 'import', isNodeModule: false },
        { path: '/test/lib/auth.js', type: 'import', isNodeModule: false },
      ]);

      dependencyTracker.updateDependencyGraphs(mockFilePath, dependencies);

      const dependents = dependencyTracker.getDependents('/test/lib/utils.js');
      expect(dependents).toContain(mockFilePath);
    });

    it('should determine reload strategy', async () => {
      const apiRoutes = new Set(['/api/users', '/api/posts']);
      
      // Direct route change
      let strategy = await dependencyTracker.determineReloadStrategy('/api/users', apiRoutes);
      expect(strategy.type).toBe('single');

      // Dependency change affecting multiple routes
      dependencyTracker.updateDependencyGraphs('/api/users', new Set([
        { path: '/lib/shared.js', type: 'import', isNodeModule: false }
      ]));
      dependencyTracker.updateDependencyGraphs('/api/posts', new Set([
        { path: '/lib/shared.js', type: 'import', isNodeModule: false }
      ]));

      strategy = await dependencyTracker.determineReloadStrategy('/lib/shared.js', apiRoutes);
      expect(strategy.type).toBe('selective');
      expect(strategy.routes).toHaveLength(2);
    });
  });

  describe('HMR Manager', () => {
    it('should initialize with correct options', () => {
      const options = {
        preserveState: true,
        debounceMs: 200,
        enableLogging: false,
      };

      const manager = new HotReloadManager(options);
      expect(manager.options.preserveState).toBe(true);
      expect(manager.options.debounceMs).toBe(200);
      expect(manager.options.enableLogging).toBe(false);
    });

    it('should track reload statistics', () => {
      hmrManager.updateReloadStats(true, 100);
      hmrManager.updateReloadStats(false, 200);
      hmrManager.updateReloadStats(true, 150);

      const stats = hmrManager.getStats();
      expect(stats.totalReloads).toBe(3);
      expect(stats.successfulReloads).toBe(2);
      expect(stats.failedReloads).toBe(1);
      expect(stats.averageReloadTime).toBeCloseTo(150);
    });

    it('should handle file path to route conversion', () => {
      hmrManager.apiDir = 'pages/api';
      hmrManager.apiPrefix = '/api';

      const route1 = hmrManager.filePathToRoute('pages/api/users.js');
      expect(route1).toBe('/api/users');

      const route2 = hmrManager.filePathToRoute('pages/api/posts/[id].js');
      expect(route2).toBe('/api/posts/:id');

      const route3 = hmrManager.filePathToRoute('pages/api/index.js');
      expect(route3).toBe('/api');
    });
  });

  describe('Error Handling', () => {
    it('should handle state operation errors gracefully', () => {
      const handler = createStatefulHandler({ count: 0 }, {});

      // Try to set invalid state
      expect(() => {
        handler.setState(null);
      }).not.toThrow();

      // State should remain valid
      expect(handler.getState()).toEqual({ count: 0 });
    });

    it('should handle cache errors gracefully', () => {
      const cache = createCache('error-cache', 1000);

      // These should not throw
      expect(() => cache.get('nonexistent')).not.toThrow();
      expect(() => cache.delete('nonexistent')).not.toThrow();
      expect(() => cache.clear()).not.toThrow();

      expect(cache.get('nonexistent')).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should handle large state objects efficiently', () => {
      const largeState = {
        items: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
      };

      const handler = createStatefulHandler(largeState, {});

      const start = performance.now();
      handler.setState({ timestamp: Date.now() });
      const duration = performance.now() - start;

      // Should complete quickly (less than 10ms)
      expect(duration).toBeLessThan(10);
    });

    it('should handle many cache operations efficiently', () => {
      const cache = createCache('perf-cache', 60000);

      const start = performance.now();
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, `value-${i}`);
      }
      
      for (let i = 0; i < 1000; i++) {
        cache.get(`key-${i}`);
      }

      const duration = performance.now() - start;

      // Should complete quickly (less than 100ms)
      expect(duration).toBeLessThan(100);
      expect(cache.size()).toBe(1000);
    });
  });
});