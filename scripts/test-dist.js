#!/usr/bin/env node

/**
 * Test script for the built distribution
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🧪 Testing built distribution...\n');

const testDir = path.join(process.cwd(), 'test-dist-project');

// Clean up previous test
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true });
}

// Create test project
console.log('📁 Creating test project...');
fs.mkdirSync(testDir);

// Create package.json
const testPackageJson = {
  name: 'test-vite-api-routes',
  version: '1.0.1',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    test: 'node test-plugin.js'
  }
};

fs.writeFileSync(
  path.join(testDir, 'package.json'),
  JSON.stringify(testPackageJson, null, 2)
);

// Create vite.config.js
const viteConfig = `import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      cors: {
        origin: '*',
        credentials: true,
      },
      security: {
        enableCsrf: true,
        enableHelmet: true,
      },
    }),
  ],
});`;

fs.writeFileSync(path.join(testDir, 'vite.config.js'), viteConfig);

// Create test API route
fs.mkdirSync(path.join(testDir, 'pages', 'api'), { recursive: true });

const testRoute = `// Test API route
export async function GET(request) {
  return new Response(JSON.stringify({
    message: 'Hello from test route!',
    timestamp: new Date().toISOString(),
    url: request.url,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const body = await request.json();
  
  return new Response(JSON.stringify({
    message: 'Data received',
    received: body,
    timestamp: new Date().toISOString(),
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}`;

fs.writeFileSync(path.join(testDir, 'pages', 'api', 'test.js'), testRoute);

// Create dynamic route
const dynamicRoute = `// Dynamic route test
export async function GET(request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  return new Response(JSON.stringify({
    message: \`User \${id} details\`,
    id,
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`;

fs.mkdirSync(path.join(testDir, 'pages', 'api', 'users'), { recursive: true });
fs.writeFileSync(path.join(testDir, 'pages', 'api', 'users', '[id].js'), dynamicRoute);

// Create test script
const testScript = `#!/usr/bin/env node

/**
 * Test the plugin functionality
 */

console.log('🧪 Testing Vite API Routes Plugin...');

// Test 1: Import the plugin
try {
  const plugin = await import('vite-api-routes-plugin');
  console.log('✅ Plugin import successful');
  console.log('   Default export:', typeof plugin.default);
} catch (error) {
  console.error('❌ Plugin import failed:', error.message);
  process.exit(1);
}

// Test 2: Test utilities import
try {
  const { createTestRequest } = await import('vite-api-routes-plugin/testing');
  console.log('✅ Testing utilities import successful');
  
  const testReq = createTestRequest('http://localhost/api/test');
  console.log('   Test request created:', testReq.url);
} catch (error) {
  console.error('⚠️  Testing utilities import failed (optional):', error.message);
}

// Test 3: Test encryption utilities
try {
  const { createEncryptionManager } = await import('vite-api-routes-plugin/encryption');
  console.log('✅ Encryption utilities import successful');
  
  const encryption = createEncryptionManager({ enabled: false });
  console.log('   Encryption manager created');
} catch (error) {
  console.error('⚠️  Encryption utilities import failed (optional):', error.message);
}

// Test 4: Test CLI (if dependencies available)
try {
  const { execSync } = await import('child_process');
  execSync('npx vite-api-routes --help', { stdio: 'pipe' });
  console.log('✅ CLI tools working');
} catch (error) {
  console.log('⚠️  CLI tools not available (optional dependencies not installed)');
}

console.log('\\n🎉 All tests completed!');
`;

fs.writeFileSync(path.join(testDir, 'test-plugin.js'), testScript);

// Create index.html for testing
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vite API Routes Test</title>
</head>
<body>
    <h1>Vite API Routes Plugin Test</h1>
    <div id="app">
        <h2>Test API Endpoints:</h2>
        <ul>
            <li><a href="/api/test" target="_blank">GET /api/test</a></li>
            <li><a href="/api/users/123" target="_blank">GET /api/users/123</a></li>
        </ul>
        
        <h3>POST Test:</h3>
        <button onclick="testPost()">Test POST /api/test</button>
        <pre id="result"></pre>
    </div>

    <script>
        async function testPost() {
            try {
                const response = await fetch('/api/test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: 'Test User',
                        message: 'Hello from frontend!'
                    })
                });
                
                const data = await response.json();
                document.getElementById('result').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('result').textContent = 'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>`;

fs.writeFileSync(path.join(testDir, 'index.html'), indexHtml);

console.log('✅ Test project created!');
console.log('\\n📁 Test project structure:');
console.log('test-dist-project/');
console.log('├── package.json');
console.log('├── vite.config.js        # Plugin configuration');
console.log('├── index.html            # Test frontend');
console.log('├── test-plugin.js        # Plugin functionality test');
console.log('└── pages/api/');
console.log('    ├── test.js           # Basic API route');
console.log('    └── users/[id].js     # Dynamic route');

console.log('\\n🚀 Next steps:');
console.log('1. cd test-dist-project');
console.log('2. npm install vite');
console.log('3. npm install file:../dist  # Install local plugin');
console.log('4. npm test                  # Test plugin functionality');
console.log('5. npm run dev               # Start dev server');
console.log('6. Visit http://localhost:5173');

console.log('\\n💡 Optional CLI testing:');
console.log('npm install commander chalk inquirer  # Install CLI deps');
console.log('npx vite-api-routes --help           # Test CLI');