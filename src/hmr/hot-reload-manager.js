/**
 * Enhanced Hot Module Replacement for API Routes
 * Features:
 * - State preservation during reloads
 * - Smart dependency tracking
 * - Graceful error recovery
 * - Performance optimizations
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

export class HotReloadManager {
  constructor(options = {}) {
    this.options = {
      preserveState: true,
      debounceMs: 100,
      maxRetries: 3,
      enableLogging: true,
      stateStorageKey: '__api_route_state__',
      ...options,
    };

    // Module cache and metadata
    this.moduleCache = new Map();
    this.moduleMetadata = new Map();
    this.dependencyGraph = new Map();
    this.stateStorage = new Map();
    
    // File watching
    this.fileHashes = new Map();
    this.watchedFiles = new Set();
    this.pendingReloads = new Map();
    
    // Performance tracking
    this.reloadStats = {
      totalReloads: 0,
      successfulReloads: 0,
      failedReloads: 0,
      averageReloadTime: 0,
    };

    this.log = this.options.enableLogging ? console.log : () => {};
  }

  /**
   * Initialize HMR for a Vite server
   */
  initialize(server, apiDir, apiPrefix) {
    this.server = server;
    this.apiDir = apiDir;
    this.apiPrefix = apiPrefix;

    // Enhanced file watching with debouncing
    this.setupFileWatcher();
    
    // Module invalidation hooks
    this.setupModuleInvalidation();
    
    // State preservation hooks
    if (this.options.preserveState) {
      this.setupStatePreservation();
    }

    this.log('🔥 Enhanced HMR initialized for API routes');
  }

  /**
   * Setup enhanced file watching with debouncing and smart filtering
   */
  setupFileWatcher() {
    this.server.watcher.on('all', (event, filePath) => {
      if (!this.shouldWatchFile(filePath)) return;

      const normalizedPath = path.normalize(filePath);
      
      // Debounce file changes
      if (this.pendingReloads.has(normalizedPath)) {
        clearTimeout(this.pendingReloads.get(normalizedPath));
      }

      this.pendingReloads.set(normalizedPath, setTimeout(() => {
        this.handleFileChange(event, normalizedPath);
        this.pendingReloads.delete(normalizedPath);
      }, this.options.debounceMs));
    });
  }

  /**
   * Determine if a file should trigger HMR
   */
  shouldWatchFile(filePath) {
    const normalizedPath = path.normalize(filePath);
    
    // API route files
    if (normalizedPath.includes(this.apiDir) && /\.(js|ts|tsx|jsx|mjs|cjs)$/.test(filePath)) {
      return true;
    }

    // Dependencies of API routes
    if (this.isDependencyOfApiRoute(normalizedPath)) {
      return true;
    }

    // Configuration files
    if (/\.(env|json)$/.test(filePath) && this.isConfigFile(normalizedPath)) {
      return true;
    }

    return false;
  }

  /**
   * Check if file is a dependency of any API route
   */
  isDependencyOfApiRoute(filePath) {
    for (const [routePath, metadata] of this.moduleMetadata.entries()) {
      if (metadata.dependencies && metadata.dependencies.has(filePath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if file is a configuration file that affects API routes
   */
  isConfigFile(filePath) {
    const configFiles = ['.env', '.env.local', 'package.json', 'vite.config.js', 'vite.config.ts'];
    return configFiles.some(config => filePath.endsWith(config));
  }

  /**
   * Handle file changes with smart reloading
   */
  async handleFileChange(event, filePath) {
    const startTime = performance.now();
    
    try {
      this.log(`📁 File ${event}: ${filePath}`);

      // Calculate file hash to detect actual changes
      const currentHash = await this.calculateFileHash(filePath);
      const previousHash = this.fileHashes.get(filePath);

      if (currentHash === previousHash && event === 'change') {
        this.log(`⏭️  No actual changes detected in ${filePath}`);
        return;
      }

      this.fileHashes.set(filePath, currentHash);

      // Determine reload strategy
      const reloadStrategy = this.determineReloadStrategy(filePath, event);
      
      await this.executeReload(reloadStrategy, filePath);

      const duration = performance.now() - startTime;
      this.updateReloadStats(true, duration);
      
      this.log(`✅ HMR completed in ${duration.toFixed(2)}ms`);

    } catch (error) {
      const duration = performance.now() - startTime;
      this.updateReloadStats(false, duration);
      
      this.log(`❌ HMR failed for ${filePath}:`, error.message);
      await this.handleReloadError(filePath, error);
    }
  }

  /**
   * Calculate file hash for change detection
   */
  async calculateFileHash(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      
      const content = await fs.promises.readFile(filePath, 'utf8');
      return createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * Determine the best reload strategy for a file change
   */
  determineReloadStrategy(filePath, event) {
    // Direct API route file
    if (filePath.includes(this.apiDir)) {
      return {
        type: 'route',
        scope: 'single',
        filePath,
        preserveState: this.options.preserveState,
      };
    }

    // Shared dependency
    if (this.isDependencyOfApiRoute(filePath)) {
      const affectedRoutes = this.getAffectedRoutes(filePath);
      return {
        type: 'dependency',
        scope: 'multiple',
        filePath,
        affectedRoutes,
        preserveState: this.options.preserveState,
      };
    }

    // Configuration file
    if (this.isConfigFile(filePath)) {
      return {
        type: 'config',
        scope: 'global',
        filePath,
        preserveState: false, // Config changes usually require full reload
      };
    }

    return {
      type: 'unknown',
      scope: 'single',
      filePath,
      preserveState: false,
    };
  }

  /**
   * Get all routes affected by a dependency change
   */
  getAffectedRoutes(dependencyPath) {
    const affected = [];
    
    for (const [routePath, metadata] of this.moduleMetadata.entries()) {
      if (metadata.dependencies && metadata.dependencies.has(dependencyPath)) {
        affected.push(routePath);
      }
    }
    
    return affected;
  }

  /**
   * Execute the reload strategy
   */
  async executeReload(strategy, filePath) {
    switch (strategy.type) {
      case 'route':
        await this.reloadSingleRoute(strategy);
        break;
        
      case 'dependency':
        await this.reloadMultipleRoutes(strategy);
        break;
        
      case 'config':
        await this.reloadConfiguration(strategy);
        break;
        
      default:
        this.log(`⚠️  Unknown reload strategy for ${filePath}`);
    }
  }

  /**
   * Reload a single API route
   */
  async reloadSingleRoute(strategy) {
    const { filePath, preserveState } = strategy;
    const routePath = this.filePathToRoute(filePath);

    // Preserve state if enabled
    let preservedState = null;
    if (preserveState) {
      preservedState = await this.preserveRouteState(routePath);
    }

    // Clear module from cache
    await this.invalidateModule(filePath);
    
    // Update route mapping
    await this.updateRouteMapping(routePath, filePath);
    
    // Restore state if preserved
    if (preservedState) {
      await this.restoreRouteState(routePath, preservedState);
    }

    // Notify clients about the update
    this.notifyClients('route-updated', { routePath, filePath });
    
    this.log(`🔄 Reloaded route: ${routePath}`);
  }

  /**
   * Reload multiple routes affected by a dependency change
   */
  async reloadMultipleRoutes(strategy) {
    const { filePath, affectedRoutes, preserveState } = strategy;
    
    this.log(`🔄 Reloading ${affectedRoutes.length} routes affected by ${filePath}`);

    // Preserve state for all affected routes
    const preservedStates = new Map();
    if (preserveState) {
      for (const routePath of affectedRoutes) {
        const state = await this.preserveRouteState(routePath);
        if (state) {
          preservedStates.set(routePath, state);
        }
      }
    }

    // Invalidate the dependency and all affected modules
    await this.invalidateModule(filePath);
    
    for (const routePath of affectedRoutes) {
      const routeFilePath = this.getRouteFilePath(routePath);
      if (routeFilePath) {
        await this.invalidateModule(routeFilePath);
        await this.updateRouteMapping(routePath, routeFilePath);
      }
    }

    // Restore states
    if (preserveState) {
      for (const [routePath, state] of preservedStates.entries()) {
        await this.restoreRouteState(routePath, state);
      }
    }

    // Notify clients
    this.notifyClients('dependency-updated', { 
      dependency: filePath, 
      affectedRoutes 
    });
  }

  /**
   * Reload configuration
   */
  async reloadConfiguration(strategy) {
    const { filePath } = strategy;
    
    this.log(`⚙️  Configuration changed: ${filePath}`);
    
    // For config changes, we might need to restart the entire server
    // or reload all routes depending on the config type
    if (filePath.includes('.env')) {
      // Reload environment variables
      delete require.cache[require.resolve('dotenv')];
      require('dotenv').config();
      
      this.notifyClients('env-updated', { filePath });
    } else {
      // For other config files, do a full reload
      this.notifyClients('config-updated', { filePath, requiresRestart: true });
    }
  }

  /**
   * Setup module invalidation hooks
   */
  setupModuleInvalidation() {
    // Hook into Vite's module invalidation
    this.server.ws.on('vite:invalidate', (data) => {
      if (data.path && this.shouldWatchFile(data.path)) {
        this.trackModuleDependencies(data.path);
      }
    });
  }

  /**
   * Track dependencies for a module
   */
  async trackModuleDependencies(filePath) {
    try {
      const module = await this.server.ssrLoadModule(filePath);
      const dependencies = new Set();
      
      // Extract import statements (simplified - could use AST parsing)
      const content = await fs.promises.readFile(filePath, 'utf8');
      const importRegex = /(?:import|require)\s*\(?['"`]([^'"`]+)['"`]\)?/g;
      let match;
      
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          // Resolve relative imports
          const resolvedPath = path.resolve(path.dirname(filePath), importPath);
          dependencies.add(resolvedPath);
        }
      }

      const routePath = this.filePathToRoute(filePath);
      this.moduleMetadata.set(routePath, {
        filePath,
        dependencies,
        lastModified: Date.now(),
        module,
      });

    } catch (error) {
      this.log(`⚠️  Failed to track dependencies for ${filePath}:`, error.message);
    }
  }

  /**
   * Setup state preservation
   */
  setupStatePreservation() {
    // Global state storage
    if (!global[this.options.stateStorageKey]) {
      global[this.options.stateStorageKey] = new Map();
    }
    this.globalStateStorage = global[this.options.stateStorageKey];
  }

  /**
   * Preserve route state before reload
   */
  async preserveRouteState(routePath) {
    try {
      const metadata = this.moduleMetadata.get(routePath);
      if (!metadata || !metadata.module) return null;

      const module = metadata.module;
      const state = {};

      // Extract preservable state
      if (module.getState && typeof module.getState === 'function') {
        state.moduleState = await module.getState();
      }

      // Preserve static variables (simplified approach)
      if (module.__hmrState) {
        state.hmrState = { ...module.__hmrState };
      }

      this.globalStateStorage.set(routePath, {
        ...state,
        timestamp: Date.now(),
      });

      return state;
    } catch (error) {
      this.log(`⚠️  Failed to preserve state for ${routePath}:`, error.message);
      return null;
    }
  }

  /**
   * Restore route state after reload
   */
  async restoreRouteState(routePath, state) {
    try {
      const metadata = this.moduleMetadata.get(routePath);
      if (!metadata || !metadata.module) return;

      const module = metadata.module;

      // Restore module state
      if (state.moduleState && module.setState && typeof module.setState === 'function') {
        await module.setState(state.moduleState);
      }

      // Restore HMR state
      if (state.hmrState) {
        module.__hmrState = { ...state.hmrState };
      }

      this.log(`🔄 Restored state for ${routePath}`);
    } catch (error) {
      this.log(`⚠️  Failed to restore state for ${routePath}:`, error.message);
    }
  }

  /**
   * Invalidate module from cache
   */
  async invalidateModule(filePath) {
    // Clear from Vite's module cache
    const module = this.server.moduleGraph.getModuleById(filePath);
    if (module) {
      this.server.reloadModule(module);
    }

    // Clear from our cache
    this.moduleCache.delete(filePath);
  }

  /**
   * Update route mapping
   */
  async updateRouteMapping(routePath, filePath) {
    // This would integrate with the main plugin's route mapping
    // For now, we'll just track it in our metadata
    const metadata = this.moduleMetadata.get(routePath) || {};
    metadata.filePath = filePath;
    metadata.lastModified = Date.now();
    this.moduleMetadata.set(routePath, metadata);
  }

  /**
   * Convert file path to route path
   */
  filePathToRoute(filePath) {
    const relativePath = path.relative(this.apiDir, filePath);
    let route = relativePath
      .replace(/\\/g, '/')
      .replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '')
      .replace(/\/index$/, '');

    route = route.replace(/\[([^\]]+)\]/g, ':$1');
    return this.apiPrefix + (route ? '/' + route : '');
  }

  /**
   * Get file path for a route
   */
  getRouteFilePath(routePath) {
    const metadata = this.moduleMetadata.get(routePath);
    return metadata ? metadata.filePath : null;
  }

  /**
   * Notify clients about updates
   */
  notifyClients(type, data) {
    this.server.ws.send({
      type: 'custom',
      event: `api-hmr:${type}`,
      data,
    });
  }

  /**
   * Handle reload errors with retry logic
   */
  async handleReloadError(filePath, error) {
    const retryCount = this.getRetryCount(filePath);
    
    if (retryCount < this.options.maxRetries) {
      this.log(`🔄 Retrying reload for ${filePath} (attempt ${retryCount + 1})`);
      this.setRetryCount(filePath, retryCount + 1);
      
      // Retry after a short delay
      setTimeout(() => {
        this.handleFileChange('change', filePath);
      }, 1000 * (retryCount + 1));
    } else {
      this.log(`❌ Max retries exceeded for ${filePath}`);
      this.clearRetryCount(filePath);
      
      // Notify about the persistent error
      this.notifyClients('reload-error', {
        filePath,
        error: error.message,
        retries: retryCount,
      });
    }
  }

  /**
   * Update reload statistics
   */
  updateReloadStats(success, duration) {
    this.reloadStats.totalReloads++;
    
    if (success) {
      this.reloadStats.successfulReloads++;
    } else {
      this.reloadStats.failedReloads++;
    }

    // Update average reload time
    const totalTime = this.reloadStats.averageReloadTime * (this.reloadStats.totalReloads - 1) + duration;
    this.reloadStats.averageReloadTime = totalTime / this.reloadStats.totalReloads;
  }

  /**
   * Get retry count for a file
   */
  getRetryCount(filePath) {
    return this.pendingReloads.get(`retry:${filePath}`) || 0;
  }

  /**
   * Set retry count for a file
   */
  setRetryCount(filePath, count) {
    this.pendingReloads.set(`retry:${filePath}`, count);
  }

  /**
   * Clear retry count for a file
   */
  clearRetryCount(filePath) {
    this.pendingReloads.delete(`retry:${filePath}`);
  }

  /**
   * Get HMR statistics
   */
  getStats() {
    return {
      ...this.reloadStats,
      cachedModules: this.moduleCache.size,
      trackedDependencies: this.dependencyGraph.size,
      preservedStates: this.globalStateStorage.size,
      watchedFiles: this.watchedFiles.size,
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Clear all timers
    for (const timer of this.pendingReloads.values()) {
      if (typeof timer === 'number') {
        clearTimeout(timer);
      }
    }
    
    this.pendingReloads.clear();
    this.moduleCache.clear();
    this.moduleMetadata.clear();
    this.dependencyGraph.clear();
    this.fileHashes.clear();
    this.watchedFiles.clear();
    
    // Clear global state storage
    if (this.globalStateStorage) {
      this.globalStateStorage.clear();
    }
    
    this.log('🧹 HMR cleanup completed');
  }
}