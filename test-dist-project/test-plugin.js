// Simple test to verify the plugin is working
import { createServer } from 'vite';
import apiRoutes from '../vite-plugin-api-routes.js';

async function test() {
  console.log('🧪 Testing Vite API Routes Plugin...');
  
  const server = await createServer({
    plugins: [
      apiRoutes({
        apiDir: 'pages/api',
        apiPrefix: '/api',
        security: {
          enableCsrf: false,
          enableHelmet: true,
        },
      }),
    ],
    server: {
      port: 3001,
    },
  });

  await server.listen();
  console.log('🚀 Test server started on http://localhost:3001');
  
  // Test the API endpoint
  try {
    const response = await fetch('http://localhost:3001/api/test');
    console.log('📊 Response status:', response.status);
    console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('📄 Response body:', text);
    
    try {
      const json = JSON.parse(text);
      console.log('✅ JSON parsed successfully:', json);
    } catch (e) {
      console.log('❌ Failed to parse JSON:', e.message);
    }
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
  }
  
  await server.close();
}

test().catch(console.error);