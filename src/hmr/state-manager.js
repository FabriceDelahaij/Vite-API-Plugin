/**
 * State Management for Hot Reloading API Routes
 * Provides utilities for preserving and restoring state during HMR
 */

export class StateManager {
  constructor() {
    this.stateStorage = new Map();
    this.stateSubscribers = new Map();
    this.stateHistory = new Map();
    this.maxHistorySize = 10;
    this.cleanupInterval = null;
    
    // Start automatic cleanup
    this.startCleanupInterval();
  }

  /**
   * Create a stateful API route handler
   * Usage: export const { GET, setState, getState } = createStatefulHandler({ ... })
   */
  createStatefulHandler(initialState = {}, handlers = {}) {
    const routeId = this.generateRouteId();
    let currentState = { ...initialState };

    // Restore previous state if available
    if (this.stateStorage.has(routeId)) {
      const savedState = this.stateStorage.get(routeId);
      currentState = { ...currentState, ...savedState };
    }

    const stateProxy = {
      // HTTP method handlers
      ...handlers,

      // State management methods
      getState: () => ({ ...currentState }),
      
      setState: (newState) => {
        const previousState = { ...currentState };
        currentState = { ...currentState, ...newState };
        
        // Save to storage
        this.stateStorage.set(routeId, currentState);
        
        // Save to history
        this.saveStateHistory(routeId, previousState);
        
        // Notify subscribers
        this.notifyStateChange(routeId, currentState, previousState);
        
        return currentState;
      },

      updateState: (updater) => {
        if (typeof updater === 'function') {
          return stateProxy.setState(updater(currentState));
        }
        return stateProxy.setState(updater);
      },

      resetState: () => {
        currentState = { ...initialState };
        this.stateStorage.set(routeId, currentState);
        return currentState;
      },

      // Subscribe to state changes
      onStateChange: (callback) => {
        if (!this.stateSubscribers.has(routeId)) {
          this.stateSubscribers.set(routeId, new Set());
        }
        this.stateSubscribers.get(routeId).add(callback);
        
        // Return unsubscribe function
        return () => {
          const subscribers = this.stateSubscribers.get(routeId);
          if (subscribers) {
            subscribers.delete(callback);
          }
        };
      },

      // HMR compatibility
      __hmrState: currentState,
      __routeId: routeId,
    };

    return stateProxy;
  }

  /**
   * Create persistent storage for API routes
   */
  createPersistentStore(key, initialValue = null) {
    const storeKey = `store:${key}`;
    
    if (!this.stateStorage.has(storeKey)) {
      this.stateStorage.set(storeKey, initialValue);
    }

    return {
      get: () => this.stateStorage.get(storeKey),
      set: (value) => {
        this.stateStorage.set(storeKey, value);
        return value;
      },
      update: (updater) => {
        const currentValue = this.stateStorage.get(storeKey);
        const newValue = typeof updater === 'function' 
          ? updater(currentValue) 
          : updater;
        this.stateStorage.set(storeKey, newValue);
        return newValue;
      },
      delete: () => {
        this.stateStorage.delete(storeKey);
      },
      has: () => this.stateStorage.has(storeKey),
    };
  }

  /**
   * Create a cache that survives HMR
   */
  createHMRCache(key, ttl = 5 * 60 * 1000) { // 5 minutes default TTL
    const cacheKey = `cache:${key}`;
    
    return {
      get: (itemKey) => {
        const cache = this.stateStorage.get(cacheKey) || new Map();
        const item = cache.get(itemKey);
        
        if (!item) return null;
        
        // Check TTL
        if (Date.now() > item.expires) {
          cache.delete(itemKey);
          this.stateStorage.set(cacheKey, cache);
          return null;
        }
        
        return item.value;
      },
      
      set: (itemKey, value, customTtl = ttl) => {
        const cache = this.stateStorage.get(cacheKey) || new Map();
        cache.set(itemKey, {
          value,
          expires: Date.now() + customTtl,
          created: Date.now(),
        });
        this.stateStorage.set(cacheKey, cache);
        return value;
      },
      
      delete: (itemKey) => {
        const cache = this.stateStorage.get(cacheKey) || new Map();
        const deleted = cache.delete(itemKey);
        this.stateStorage.set(cacheKey, cache);
        return deleted;
      },
      
      clear: () => {
        this.stateStorage.set(cacheKey, new Map());
      },
      
      size: () => {
        const cache = this.stateStorage.get(cacheKey) || new Map();
        return cache.size;
      },
      
      keys: () => {
        const cache = this.stateStorage.get(cacheKey) || new Map();
        return Array.from(cache.keys());
      },
    };
  }

  /**
   * Create a rate limiter that persists across HMR
   */
  createHMRRateLimit(key, maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const rateLimitKey = `rateLimit:${key}`;
    
    return {
      check: (identifier) => {
        const rateLimits = this.stateStorage.get(rateLimitKey) || new Map();
        const now = Date.now();
        const record = rateLimits.get(identifier) || { count: 0, resetTime: now + windowMs };

        if (now > record.resetTime) {
          record.count = 1;
          record.resetTime = now + windowMs;
        } else {
          record.count++;
        }

        rateLimits.set(identifier, record);
        this.stateStorage.set(rateLimitKey, rateLimits);

        return {
          allowed: record.count <= maxRequests,
          remaining: Math.max(0, maxRequests - record.count),
          resetTime: record.resetTime,
          count: record.count,
        };
      },
      
      reset: (identifier) => {
        const rateLimits = this.stateStorage.get(rateLimitKey) || new Map();
        rateLimits.delete(identifier);
        this.stateStorage.set(rateLimitKey, rateLimits);
      },
      
      clear: () => {
        this.stateStorage.set(rateLimitKey, new Map());
      },
    };
  }

  /**
   * Generate unique route ID
   */
  generateRouteId() {
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[3]; // Get caller's line
    return `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${callerLine?.split('/').pop()?.split(':')[0] || 'unknown'}`;
  }

  /**
   * Save state history for debugging
   */
  saveStateHistory(routeId, state) {
    if (!this.stateHistory.has(routeId)) {
      this.stateHistory.set(routeId, []);
    }
    
    const history = this.stateHistory.get(routeId);
    history.push({
      state: { ...state },
      timestamp: Date.now(),
    });
    
    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Notify state change subscribers
   */
  notifyStateChange(routeId, newState, previousState) {
    const subscribers = this.stateSubscribers.get(routeId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(newState, previousState);
        } catch (error) {
          console.error('State change callback error:', error);
        }
      });
    }
  }

  /**
   * Get state history for debugging
   */
  getStateHistory(routeId) {
    return this.stateHistory.get(routeId) || [];
  }

  /**
   * Clear all state for a route
   */
  clearRouteState(routeId) {
    this.stateStorage.delete(routeId);
    this.stateHistory.delete(routeId);
    this.stateSubscribers.delete(routeId);
  }

  /**
   * Get all stored state keys
   */
  getAllStateKeys() {
    return Array.from(this.stateStorage.keys());
  }

  /**
   * Export state for backup/debugging
   */
  exportState() {
    const exported = {};
    for (const [key, value] of this.stateStorage.entries()) {
      try {
        exported[key] = JSON.parse(JSON.stringify(value));
      } catch (error) {
        exported[key] = '[Non-serializable]';
      }
    }
    return exported;
  }

  /**
   * Import state from backup
   */
  importState(stateData) {
    for (const [key, value] of Object.entries(stateData)) {
      if (value !== '[Non-serializable]') {
        this.stateStorage.set(key, value);
      }
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.stateStorage.entries()) {
      if (key.startsWith('cache:') && value instanceof Map) {
        for (const [itemKey, item] of value.entries()) {
          if (item.expires && now > item.expires) {
            value.delete(itemKey);
            cleaned++;
          }
        }
        
        // Remove empty caches
        if (value.size === 0) {
          this.stateStorage.delete(key);
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 State manager cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanupInterval() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup interval and clear all resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.stateStorage.clear();
    this.stateSubscribers.clear();
    this.stateHistory.clear();
    
    console.log('🧹 State manager destroyed');
  }
}

// Global state manager instance
export const globalStateManager = new StateManager();

/**
 * Convenience function to create stateful handlers
 */
export function createStatefulHandler(initialState, handlers) {
  return globalStateManager.createStatefulHandler(initialState, handlers);
}

/**
 * Create persistent store
 */
export function createStore(key, initialValue) {
  return globalStateManager.createPersistentStore(key, initialValue);
}

/**
 * Create HMR-safe cache
 */
export function createCache(key, ttl) {
  return globalStateManager.createHMRCache(key, ttl);
}

/**
 * Create HMR-safe rate limiter
 */
export function createRateLimit(key, maxRequests, windowMs) {
  return globalStateManager.createHMRRateLimit(key, maxRequests, windowMs);
}

/**
 * Decorator for preserving state across HMR
 */
export function withState(initialState = {}) {
  return function(target) {
    const statefulHandler = createStatefulHandler(initialState, target);
    
    // Copy all properties from target to statefulHandler
    Object.keys(target).forEach(key => {
      if (typeof target[key] === 'function') {
        statefulHandler[key] = target[key];
      }
    });
    
    return statefulHandler;
  };
}

/**
 * HMR-safe singleton pattern
 */
export function createSingleton(key, factory) {
  const singletonKey = `singleton:${key}`;
  
  if (!globalStateManager.stateStorage.has(singletonKey)) {
    globalStateManager.stateStorage.set(singletonKey, factory());
  }
  
  return globalStateManager.stateStorage.get(singletonKey);
}