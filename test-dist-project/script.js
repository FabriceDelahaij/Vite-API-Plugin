// API Tester JavaScript with Radix UI-inspired interactions

class APITester {
  constructor() {
    this.statusBadge = document.getElementById('status-badge');
    this.testButton = document.getElementById('test-button');
    this.buttonIcon = document.getElementById('button-icon');
    this.methodSelect = document.getElementById('method');
    this.endpointInput = document.getElementById('endpoint');
    this.bodyGroup = document.getElementById('body-group');
    this.bodyTextarea = document.getElementById('body');
    
    this.init();
  }

  init() {
    this.updateMethodUI();
    this.createResultsSection();
    this.createQuickTestButtons();
    this.createFeaturesSection();
  }

  updateMethodUI() {
    const method = this.methodSelect.value;
    const showBody = ['POST', 'PUT', 'PATCH'].includes(method);
    
    if (showBody) {
      this.bodyGroup.style.display = 'block';
      // Add a smooth transition
      this.bodyGroup.style.opacity = '0';
      this.bodyGroup.style.transform = 'translateY(-10px)';
      
      setTimeout(() => {
        this.bodyGroup.style.transition = 'all 0.3s ease';
        this.bodyGroup.style.opacity = '1';
        this.bodyGroup.style.transform = 'translateY(0)';
      }, 10);
      
      // Set default JSON if empty
      if (!this.bodyTextarea.value.trim()) {
        this.bodyTextarea.value = JSON.stringify({
          message: "Hello from API tester!",
          timestamp: new Date().toISOString(),
          data: {
            test: true,
            method: method
          }
        }, null, 2);
      }
    } else {
      this.bodyGroup.style.display = 'none';
    }
  }

  createResultsSection() {
    const resultsHTML = `
      <section class="results-section" style="margin-top: var(--space-6);">
        <div class="card">
          <div class="card-header">
            <h3>Response</h3>
            <div class="response-meta" id="response-meta"></div>
          </div>
          <div class="card-content">
            <pre class="response-body" id="response-body">Send a request to see the response...</pre>
          </div>
        </div>
      </section>
    `;
    
    document.querySelector('.api-tester').insertAdjacentHTML('afterend', resultsHTML);
    
    // Add styles for results
    const style = document.createElement('style');
    style.textContent = `
      .response-meta {
        display: flex;
        gap: var(--space-4);
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
      }
      
      .response-body {
        background: var(--gray-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-2);
        padding: var(--space-3);
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: var(--font-size-sm);
        line-height: 1.5;
        color: var(--text-primary);
        overflow-x: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        max-height: 300px;
        overflow-y: auto;
      }
      
      .form-group-full {
        animation: slideIn 0.3s ease-out;
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .textarea.error {
        border-color: var(--error);
        box-shadow: 0 0 0 3px rgba(229, 72, 77, 0.2);
      }
      
      .quick-tests {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-6);
      }
      
      .quick-test-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-3);
        padding: var(--space-3);
        transition: all 0.2s ease;
        cursor: pointer;
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
      }
      
      .quick-test-card:hover {
        border-color: var(--primary);
        box-shadow: var(--shadow-2);
        background: var(--surface-hover);
      }
      
      .quick-test-method {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-1);
        font-size: var(--font-size-xs);
        font-weight: 600;
        min-width: 48px;
        flex-shrink: 0;
      }
      
      .method-get { background: var(--success-bg); color: var(--success-text); }
      .method-post { background: var(--blue-3); color: var(--blue-11); }
      .method-put { background: var(--gray-4); color: var(--gray-11); }
      .method-delete { background: var(--error-bg); color: var(--error-text); }
      
      .quick-test-content {
        flex: 1;
        min-width: 0;
      }
      
      .quick-test-url {
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: var(--font-size-sm);
        color: var(--text-primary);
        margin-bottom: var(--space-1);
        word-break: break-all;
      }
      
      .quick-test-description {
        font-size: var(--font-size-xs);
        color: var(--text-secondary);
      }
      
      .features-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: var(--space-4);
      }
      
      .feature-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-3);
        padding: var(--space-4);
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
      }
      
      .feature-icon {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--font-size-lg);
        flex-shrink: 0;
      }
      
      .feature-content {
        flex: 1;
        min-width: 0;
      }
      
      .feature-icon.security { background: var(--error-bg); color: var(--error); }
      .feature-icon.modern { background: var(--blue-3); color: var(--blue-9); }
      .feature-icon.dx { background: var(--success-bg); color: var(--success); }
      .feature-icon.production { background: var(--gray-4); color: var(--gray-9); }
      
      .feature-card h4 {
        font-size: var(--font-size-base);
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: var(--space-2);
        margin-top: 0;
      }
      
      .feature-list {
        list-style: none;
        padding: 0;
      }
      
      .feature-list li {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) 0;
        font-size: var(--font-size-xs);
        color: var(--text-secondary);
      }
      
      .feature-list li::before {
        content: "✓";
        color: var(--success);
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  createQuickTestButtons() {
    const quickTestsHTML = `
      <section class="quick-tests-section" style="margin-top: var(--space-8);">
        <h3 style="margin-bottom: var(--space-4); font-size: var(--font-size-lg); font-weight: 600; text-align: center;">Quick Tests</h3>
        <div class="quick-tests">
          <div class="quick-test-card" onclick="apiTester.quickTest('GET', '/api/test')">
            <div class="quick-test-method method-get">GET</div>
            <div class="quick-test-content">
              <div class="quick-test-url">/api/test</div>
              <div class="quick-test-description">Basic JSON response</div>
            </div>
          </div>
          <div class="quick-test-card" onclick="apiTester.quickTest('POST', '/api/test', {message: 'Hello!'})">
            <div class="quick-test-method method-post">POST</div>
            <div class="quick-test-content">
              <div class="quick-test-url">/api/test</div>
              <div class="quick-test-description">Send JSON data</div>
            </div>
          </div>
          <div class="quick-test-card" onclick="apiTester.quickTest('GET', '/api/users/123')">
            <div class="quick-test-method method-get">GET</div>
            <div class="quick-test-content">
              <div class="quick-test-url">/api/users/123</div>
              <div class="quick-test-description">Dynamic route</div>
            </div>
          </div>
          <div class="quick-test-card" onclick="apiTester.quickTest('GET', '/api/hello?name=Demo')">
            <div class="quick-test-method method-get">GET</div>
            <div class="quick-test-content">
              <div class="quick-test-url">/api/hello</div>
              <div class="quick-test-description">Query parameters</div>
            </div>
          </div>
        </div>
      </section>
    `;
    
    document.querySelector('.main .container').insertAdjacentHTML('beforeend', quickTestsHTML);
  }

  createFeaturesSection() {
    const featuresHTML = `
      <section class="features-section" style="margin-top: var(--space-8);">
        <h3 style="margin-bottom: var(--space-6); font-size: var(--font-size-xl); font-weight: 700; text-align: center;">Plugin Features</h3>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon security">
              <i data-lucide="shield-check"></i>
            </div>
            <div class="feature-content">
              <h4>Security First</h4>
              <ul class="feature-list">
                <li>CORS protection</li>
                <li>Rate limiting</li>
                <li>CSRF protection</li>
                <li>Security headers</li>
                <li>Input sanitization</li>
              </ul>
            </div>
          </div>
          <div class="feature-card">
            <div class="feature-icon modern">
              <i data-lucide="rocket"></i>
            </div>
            <div class="feature-content">
              <h4>Modern Syntax</h4>
              <ul class="feature-list">
                <li>App Router style handlers</li>
                <li>TypeScript support</li>
                <li>Web API Request/Response</li>
                <li>Async/await ready</li>
                <li>ESM modules</li>
              </ul>
            </div>
          </div>
          <div class="feature-card">
            <div class="feature-icon dx">
              <i data-lucide="wrench"></i>
            </div>
            <div class="feature-content">
              <h4>Developer Experience</h4>
              <ul class="feature-list">
                <li>File-based routing</li>
                <li>Hot module replacement</li>
                <li>CLI tools</li>
                <li>Testing utilities</li>
                <li>Auto-completion</li>
              </ul>
            </div>
          </div>
          <div class="feature-card">
            <div class="feature-icon production">
              <i data-lucide="zap"></i>
            </div>
            <div class="feature-content">
              <h4>Production Ready</h4>
              <ul class="feature-list">
                <li>HTTPS support</li>
                <li>Error tracking</li>
                <li>Environment validation</li>
                <li>Comprehensive docs</li>
                <li>NPM package</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    `;
    
    document.querySelector('.main .container').insertAdjacentHTML('beforeend', featuresHTML);
    
    // Initialize Lucide icons for the new content
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  updateStatus(status, text) {
    this.statusBadge.className = `status-badge ${status}`;
    this.statusBadge.innerHTML = `<div class="status-dot"></div>${text}`;
  }

  updateButton(loading = false) {
    this.testButton.disabled = loading;
    if (loading) {
      this.buttonIcon.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>';
    } else {
      this.buttonIcon.innerHTML = '<i data-lucide="play"></i>';
    }
    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  async quickTest(method, url, body = null) {
    // Update form
    this.methodSelect.value = method;
    this.endpointInput.value = url;
    this.updateMethodUI();
    
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      this.bodyTextarea.value = JSON.stringify(body, null, 2);
    }
    
    // Execute test
    await this.testEndpoint(method, url, body);
  }

  async testCustomEndpoint() {
    const method = this.methodSelect.value;
    const endpoint = this.endpointInput.value;
    let body = null;
    
    if (['POST', 'PUT', 'PATCH'].includes(method) && this.bodyTextarea.value.trim()) {
      try {
        // Validate and format JSON
        const parsedBody = JSON.parse(this.bodyTextarea.value);
        body = parsedBody;
        
        // Auto-format the JSON in the textarea
        this.bodyTextarea.value = JSON.stringify(parsedBody, null, 2);
      } catch (error) {
        this.displayError(`Invalid JSON in request body: ${error.message}`);
        this.highlightJsonError();
        return;
      }
    }
    
    await this.testEndpoint(method, endpoint, body);
  }

  highlightJsonError() {
    this.bodyTextarea.style.borderColor = 'var(--error)';
    this.bodyTextarea.style.boxShadow = '0 0 0 3px rgba(229, 72, 77, 0.1)';
    
    setTimeout(() => {
      this.bodyTextarea.style.borderColor = '';
      this.bodyTextarea.style.boxShadow = '';
    }, 3000);
  }

  formatJson() {
    const value = this.bodyTextarea.value.trim();
    if (!value) return;
    
    try {
      const parsed = JSON.parse(value);
      this.bodyTextarea.value = JSON.stringify(parsed, null, 2);
      
      // Show success feedback
      this.bodyTextarea.style.borderColor = 'var(--success)';
      this.bodyTextarea.style.boxShadow = '0 0 0 3px rgba(48, 164, 108, 0.1)';
      
      setTimeout(() => {
        this.bodyTextarea.style.borderColor = '';
        this.bodyTextarea.style.boxShadow = '';
      }, 1000);
    } catch (error) {
      this.highlightJsonError();
    }
  }

  async testEndpoint(method, url, body = null) {
    this.updateStatus('loading', 'Sending...');
    this.updateButton(true);
    
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        options.body = JSON.stringify(body);
      }
      
      const startTime = Date.now();
      const response = await fetch(url, options);
      const endTime = Date.now();
      
      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }
      
      this.displayResponse(response, responseData, endTime - startTime);
      this.updateStatus('', 'Success');
      
    } catch (error) {
      this.displayError(error.message);
      this.updateStatus('error', 'Error');
    } finally {
      this.updateButton(false);
    }
  }

  displayResponse(response, data, responseTime) {
    const metaElement = document.getElementById('response-meta');
    const bodyElement = document.getElementById('response-body');
    
    metaElement.innerHTML = `
      <span>Status: ${response.status} ${response.statusText}</span>
      <span>Time: ${responseTime}ms</span>
      <span>Type: ${response.headers.get('content-type') || 'unknown'}</span>
    `;
    
    bodyElement.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  displayError(message) {
    const metaElement = document.getElementById('response-meta');
    const bodyElement = document.getElementById('response-body');
    
    metaElement.innerHTML = '<span style="color: var(--error);">Request Failed</span>';
    bodyElement.textContent = `Error: ${message}`;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.apiTester = new APITester();
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

// Global functions for HTML onclick handlers
function updateMethodUI() {
  window.apiTester?.updateMethodUI();
}

function testCustomEndpoint() {
  window.apiTester?.testCustomEndpoint();
}