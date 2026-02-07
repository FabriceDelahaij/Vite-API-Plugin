/**
 * Client-side HMR utilities for API routes
 * Provides real-time feedback about API route changes
 */

export class ApiHMRClient {
  constructor(options = {}) {
    this.options = {
      enableNotifications: true,
      enableConsoleLogging: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 10,
      ...options,
    };

    this.ws = null;
    this.reconnectAttempts = 0;
    this.listeners = new Map();
    this.isConnected = false;

    this.connect();
  }

  /**
   * Connect to Vite's WebSocket for HMR updates
   */
  connect() {
    if (typeof window === 'undefined') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl, 'vite-hmr');
      
      this.ws.addEventListener('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.log('🔥 Connected to API HMR');
        this.emit('connected');
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          // Ignore non-JSON messages
        }
      });

      this.ws.addEventListener('close', () => {
        this.isConnected = false;
        this.log('🔌 Disconnected from API HMR');
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', (error) => {
        this.log('❌ WebSocket error:', error);
        this.emit('error', error);
      });

    } catch (error) {
      this.log('❌ Failed to connect to HMR:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming HMR messages
   */
  handleMessage(data) {
    if (data.type === 'custom' && data.event?.startsWith('api-hmr:')) {
      const eventType = data.event.replace('api-hmr:', '');
      this.handleApiHMREvent(eventType, data.data);
    }
  }

  /**
   * Handle API-specific HMR events
   */
  handleApiHMREvent(eventType, data) {
    this.log(`🔄 API HMR Event: ${eventType}`, data);

    switch (eventType) {
      case 'route-updated':
        this.handleRouteUpdated(data);
        break;
      case 'dependency-updated':
        this.handleDependencyUpdated(data);
        break;
      case 'config-updated':
        this.handleConfigUpdated(data);
        break;
      case 'env-updated':
        this.handleEnvUpdated(data);
        break;
      case 'reload-error':
        this.handleReloadError(data);
        break;
    }

    this.emit(eventType, data);
  }

  /**
   * Handle single route update
   */
  handleRouteUpdated(data) {
    const { routePath, filePath } = data;
    
    this.showNotification(`🔄 API Route Updated`, {
      body: `${routePath} has been hot reloaded`,
      icon: '🔥',
    });

    // Invalidate any cached requests to this route
    this.invalidateRouteCache(routePath);
  }

  /**
   * Handle dependency update affecting multiple routes
   */
  handleDependencyUpdated(data) {
    const { dependency, affectedRoutes } = data;
    
    this.showNotification(`🔄 Dependency Updated`, {
      body: `${affectedRoutes.length} API routes affected by ${dependency}`,
      icon: '📦',
    });

    // Invalidate cache for all affected routes
    affectedRoutes.forEach(route => this.invalidateRouteCache(route));
  }

  /**
   * Handle configuration update
   */
  handleConfigUpdated(data) {
    const { filePath, requiresRestart } = data;
    
    if (requiresRestart) {
      this.showNotification(`⚙️ Config Updated - Restart Required`, {
        body: `${filePath} changed. Server restart may be needed.`,
        icon: '⚠️',
      });
    } else {
      this.showNotification(`⚙️ Config Updated`, {
        body: `${filePath} has been reloaded`,
        icon: '⚙️',
      });
    }
  }

  /**
   * Handle environment variable update
   */
  handleEnvUpdated(data) {
    this.showNotification(`🌍 Environment Updated`, {
      body: 'Environment variables have been reloaded',
      icon: '🌍',
    });
  }

  /**
   * Handle reload error
   */
  handleReloadError(data) {
    const { filePath, error, retries } = data;
    
    this.showNotification(`❌ HMR Error`, {
      body: `Failed to reload ${filePath}: ${error}`,
      icon: '❌',
    });

    console.error('API HMR Error:', {
      filePath,
      error,
      retries,
    });
  }

  /**
   * Show browser notification
   */
  showNotification(title, options = {}) {
    if (!this.options.enableNotifications) return;

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        ...options,
        tag: 'api-hmr',
        requireInteraction: false,
        silent: true,
      });
    }
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  /**
   * Invalidate cached requests for a route
   */
  invalidateRouteCache(routePath) {
    // Clear fetch cache for this route
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          caches.open(cacheName).then(cache => {
            cache.keys().then(requests => {
              requests.forEach(request => {
                if (request.url.includes(routePath)) {
                  cache.delete(request);
                }
              });
            });
          });
        });
      });
    }
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.log('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * this.reconnectAttempts;
    
    this.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('HMR event listener error:', error);
        }
      });
    }
  }

  /**
   * Log message
   */
  log(...args) {
    if (this.options.enableConsoleLogging) {
      console.log('[API HMR]', ...args);
    }
  }

  /**
   * Get HMR status from server
   */
  async getHMRStatus() {
    try {
      const response = await fetch('/__hmr_status');
      return await response.json();
    } catch (error) {
      this.log('Failed to get HMR status:', error);
      return null;
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
    this.isConnected = false;
  }
}

/**
 * Create and initialize API HMR client
 */
export function createApiHMRClient(options) {
  return new ApiHMRClient(options);
}

/**
 * Auto-initialize in browser
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.apiHMR = createApiHMRClient();
  
  // Request notification permission
  window.apiHMR.requestNotificationPermission();
  
  // Add global helper functions
  window.getHMRStatus = () => window.apiHMR.getHMRStatus();
  window.clearApiCache = () => {
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.includes('api')) {
            caches.delete(cacheName);
          }
        });
      });
    }
  };
}