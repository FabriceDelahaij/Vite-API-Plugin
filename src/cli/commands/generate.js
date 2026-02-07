import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

export const generateCommand = new Command('generate')
  .alias('g')
  .description('Generate API routes and components')
  .argument('[type]', 'Type to generate (route, auth, crud, middleware)')
  .argument('[name]', 'Name of the component')
  .option('-ts, --typescript', 'Generate TypeScript files', false)
  .option('-t, --template <template>', 'Template to use')
  .option('-f, --force', 'Overwrite existing files', false)
  .action(async (type, name, options) => {
    console.log(chalk.blue('🔧 Generating components...\n'));

    // Interactive prompts if no arguments provided
    if (!type) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'type',
          message: 'What would you like to generate?',
          choices: [
            { name: 'API Route - Single endpoint', value: 'route' },
            { name: 'CRUD Routes - Full resource', value: 'crud' },
            { name: 'Auth System - Login/register/logout', value: 'auth' },
            { name: 'Middleware - Custom middleware', value: 'middleware' },
            { name: 'Test Suite - API tests', value: 'test' }
          ]
        }
      ]);
      type = answers.type;
    }

    if (!name && type !== 'auth') {
      const { inputName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'inputName',
          message: `Enter ${type} name:`,
          validate: (input) => input.length > 0 || 'Name is required'
        }
      ]);
      name = inputName;
    }

    // Check for TypeScript
    if (!options.typescript) {
      options.typescript = existsSync('tsconfig.json');
    }

    try {
      switch (type) {
        case 'route':
          await generateRoute(name, options);
          break;
        case 'crud':
          await generateCrud(name, options);
          break;
        case 'auth':
          await generateAuth(options);
          break;
        case 'middleware':
          await generateMiddleware(name, options);
          break;
        case 'test':
          await generateTest(name, options);
          break;
        default:
          console.error(chalk.red(`Unknown type: ${type}`));
          process.exit(1);
      }

      console.log(chalk.green('\n✅ Generation completed successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Error generating:'), error.message);
      process.exit(1);
    }
  });

async function generateRoute(name, options) {
  const { typescript, force } = options;
  const ext = typescript ? 'ts' : 'js';
  
  // Determine file path
  const routePath = name.includes('/') ? name : `${name}`;
  const filePath = `pages/api/${routePath}.${ext}`;
  
  if (existsSync(filePath) && !force) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `File ${filePath} already exists. Overwrite?`,
        default: false
      }
    ]);
    
    if (!overwrite) {
      console.log(chalk.yellow('Generation cancelled.'));
      return;
    }
  }

  // Create directory if needed
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Get route template
  const { template } = await inquirer.prompt([
    {
      type: 'list',
      name: 'template',
      message: 'Choose route template:',
      choices: [
        { name: 'Basic - GET/POST methods', value: 'basic' },
        { name: 'CRUD - All HTTP methods', value: 'crud' },
        { name: 'Protected - Requires authentication', value: 'protected' },
        { name: 'Upload - File upload handling', value: 'upload' }
      ]
    }
  ]);

  const routeContent = createRouteTemplate(name, template, typescript);
  writeFileSync(filePath, routeContent);
  
  console.log(chalk.green(`Created ${filePath}`));

  // Generate corresponding test file
  const testPath = `tests/api/${routePath}.test.${ext}`;
  const testDir = dirname(testPath);
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const testContent = createRouteTest(name, template, typescript);
  writeFileSync(testPath, testContent);
  
  console.log(chalk.green(`Created ${testPath}`));
}

async function generateCrud(name, options) {
  const { typescript } = options;
  const ext = typescript ? 'ts' : 'js';

  // Generate main CRUD route
  const crudPath = `pages/api/${name}.${ext}`;
  const crudContent = createCrudTemplate(name, typescript);
  
  // Create directory if needed
  const dir = dirname(crudPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(crudPath, crudContent);
  console.log(chalk.green(`Created ${crudPath}`));

  // Generate dynamic route for single items
  const dynamicPath = `pages/api/${name}/[id].${ext}`;
  const dynamicDir = dirname(dynamicPath);
  if (!existsSync(dynamicDir)) {
    mkdirSync(dynamicDir, { recursive: true });
  }

  const dynamicContent = createDynamicCrudTemplate(name, typescript);
  writeFileSync(dynamicPath, dynamicContent);
  console.log(chalk.green(`Created ${dynamicPath}`));

  // Generate tests
  const testPath = `tests/api/${name}.test.${ext}`;
  const testDir = dirname(testPath);
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const testContent = createCrudTest(name, typescript);
  writeFileSync(testPath, testContent);
  console.log(chalk.green(`Created ${testPath}`));
}

async function generateAuth(options) {
  const { typescript } = options;
  const ext = typescript ? 'ts' : 'js';

  const authRoutes = [
    { path: 'auth/login', template: 'login' },
    { path: 'auth/register', template: 'register' },
    { path: 'auth/logout', template: 'logout' },
    { path: 'auth/me', template: 'me' }
  ];

  // Create auth directory
  if (!existsSync('pages/api/auth')) {
    mkdirSync('pages/api/auth', { recursive: true });
  }

  for (const route of authRoutes) {
    const filePath = `pages/api/${route.path}.${ext}`;
    const content = createAuthTemplate(route.template, typescript);
    writeFileSync(filePath, content);
    console.log(chalk.green(`Created ${filePath}`));
  }

  // Create auth middleware
  const middlewarePath = `utils/auth-middleware.${ext}`;
  const middlewareContent = createAuthMiddleware(typescript);
  writeFileSync(middlewarePath, middlewareContent);
  console.log(chalk.green(`Created ${middlewarePath}`));

  // Create auth tests
  const testPath = `tests/auth.test.${ext}`;
  const testContent = createAuthTest(typescript);
  writeFileSync(testPath, testContent);
  console.log(chalk.green(`Created ${testPath}`));
}

async function generateMiddleware(name, options) {
  const { typescript } = options;
  const ext = typescript ? 'ts' : 'js';

  const middlewarePath = `utils/${name}-middleware.${ext}`;
  const content = createMiddlewareTemplate(name, typescript);
  
  writeFileSync(middlewarePath, content);
  console.log(chalk.green(`Created ${middlewarePath}`));

  // Generate test
  const testPath = `tests/middleware/${name}.test.${ext}`;
  const testDir = dirname(testPath);
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const testContent = createMiddlewareTest(name, typescript);
  writeFileSync(testPath, testContent);
  console.log(chalk.green(`Created ${testPath}`));
}

async function generateTest(name, options) {
  const { typescript } = options;
  const ext = typescript ? 'ts' : 'js';

  const testPath = `tests/api/${name}.test.${ext}`;
  const testDir = dirname(testPath);
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const content = createTestTemplate(name, typescript);
  writeFileSync(testPath, content);
  console.log(chalk.green(`Created ${testPath}`));
}

// Template creators
function createRouteTemplate(name, template, typescript) {
  const imports = typescript ? "import type { ApiRequest } from '../../types/api';" : '';
  const requestType = typescript ? ': ApiRequest' : '';
  const responseType = typescript ? ': Promise<Response>' : '';

  const templates = {
    basic: `${imports}

// ${name} API route
export async function GET(request${requestType})${responseType} {
  return new Response(JSON.stringify({
    message: 'Hello from ${name}!',
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request${requestType})${responseType} {
  const body = await request.json();
  
  return new Response(JSON.stringify({
    message: '${name} created',
    data: body,
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}`,

    crud: `${imports}

// ${name} CRUD operations
export async function GET(request${requestType})${responseType} {
  // Get all ${name}s
  return new Response(JSON.stringify({
    ${name}s: [],
    total: 0,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request${requestType})${responseType} {
  const body = await request.json();
  
  // Create new ${name}
  return new Response(JSON.stringify({
    message: '${name} created successfully',
    ${name}: { id: Date.now(), ...body },
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request${requestType})${responseType} {
  const body = await request.json();
  
  // Update ${name}
  return new Response(JSON.stringify({
    message: '${name} updated successfully',
    ${name}: body,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request${requestType})${responseType} {
  // Delete ${name}
  return new Response(JSON.stringify({
    message: '${name} deleted successfully',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`,

    protected: `${imports}

// Protected ${name} route
export async function GET(request${requestType})${responseType} {
  const user = request.user;
  
  if (!user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  return new Response(JSON.stringify({
    message: \`Hello \${user.name}!\`,
    ${name}: 'protected data',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`,

    upload: `${imports}

// File upload ${name} route
export async function POST(request${requestType})${responseType} {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return new Response(JSON.stringify({
        error: 'No file provided',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Process file upload
    return new Response(JSON.stringify({
      message: 'File uploaded successfully',
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Upload failed',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}`
  };

  return templates[template] || templates.basic;
}

function createCrudTemplate(name, typescript) {
  const imports = typescript ? "import type { ApiRequest } from '../../types/api';" : '';
  const requestType = typescript ? ': ApiRequest' : '';
  const responseType = typescript ? ': Promise<Response>' : '';

  return `${imports}

// ${name} collection endpoints
const ${name}s = [];

export async function GET(request${requestType})${responseType} {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  
  return new Response(JSON.stringify({
    ${name}s,
    pagination: {
      page,
      limit,
      total: ${name}s.length,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request${requestType})${responseType} {
  const body = await request.json();
  
  const new${name.charAt(0).toUpperCase() + name.slice(1)} = {
    id: Date.now(),
    ...body,
    createdAt: new Date().toISOString(),
  };
  
  ${name}s.push(new${name.charAt(0).toUpperCase() + name.slice(1)});
  
  return new Response(JSON.stringify({
    message: '${name} created successfully',
    ${name}: new${name.charAt(0).toUpperCase() + name.slice(1)},
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}`;
}

function createDynamicCrudTemplate(name, typescript) {
  const imports = typescript ? "import type { ApiRequest } from '../../../types/api';" : '';
  const requestType = typescript ? ': ApiRequest' : '';
  const responseType = typescript ? ': Promise<Response>' : '';

  return `${imports}

// ${name} individual item endpoints
export async function GET(request${requestType})${responseType} {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  // Find ${name} by ID
  return new Response(JSON.stringify({
    ${name}: { id, name: \`${name} \${id}\` },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(request${requestType})${responseType} {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  const body = await request.json();
  
  return new Response(JSON.stringify({
    message: \`${name} \${id} updated successfully\`,
    ${name}: { id, ...body },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request${requestType})${responseType} {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  return new Response(JSON.stringify({
    message: \`${name} \${id} deleted successfully\`,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`;
}

function createAuthTemplate(template, typescript) {
  const imports = typescript ? "import type { ApiRequest } from '../../../types/api';" : '';
  const requestType = typescript ? ': ApiRequest' : '';
  const responseType = typescript ? ': Promise<Response>' : '';

  const templates = {
    login: `${imports}

// Login endpoint
export async function POST(request${requestType})${responseType} {
  const { email, password } = await request.json();
  
  // Mock authentication
  if (email === 'admin@example.com' && password === 'password') {
    const csrfToken = request.getCsrfToken();
    
    return new Response(JSON.stringify({
      success: true,
      user: { id: 1, name: 'Admin', email },
      csrfToken,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'auth_token=mock-token; HttpOnly; Secure; SameSite=Strict',
      },
    });
  }
  
  return new Response(JSON.stringify({
    error: 'Invalid credentials',
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}`,

    register: `${imports}

// Register endpoint
export async function POST(request${requestType})${responseType} {
  const { name, email, password } = await request.json();
  
  // Validate input
  if (!name || !email || !password) {
    return new Response(JSON.stringify({
      error: 'Missing required fields',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Mock user creation
  const user = { id: Date.now(), name, email };
  
  return new Response(JSON.stringify({
    success: true,
    message: 'User registered successfully',
    user,
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}`,

    logout: `${imports}

// Logout endpoint
export async function POST(request${requestType})${responseType} {
  return new Response(JSON.stringify({
    success: true,
    message: 'Logged out successfully',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  });
}`,

    me: `${imports}

// Get current user endpoint
export async function GET(request${requestType})${responseType} {
  const user = request.user;
  
  if (!user) {
    return new Response(JSON.stringify({
      error: 'Not authenticated',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  return new Response(JSON.stringify({
    user,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`
  };

  return templates[template] || templates.login;
}

function createAuthMiddleware(typescript) {
  return `// Authentication middleware
${typescript ? "import type { ApiRequest } from '../types/api';" : ''}

export async function requireAuth(request${typescript ? ': ApiRequest' : ''}) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    return { authenticated: false, user: null };
  }
  
  // Mock token validation
  if (token === 'valid-token') {
    return {
      authenticated: true,
      user: { id: 1, name: 'User', email: 'user@example.com' }
    };
  }
  
  return { authenticated: false, user: null };
}

export async function requireRole(role${typescript ? ': string' : ''}) {
  return async function(request${typescript ? ': ApiRequest' : ''}) {
    const { authenticated, user } = await requireAuth(request);
    
    if (!authenticated || user.role !== role) {
      return { authorized: false, user: null };
    }
    
    return { authorized: true, user };
  };
}`;
}

function createMiddlewareTemplate(name, typescript) {
  return `// ${name} middleware
${typescript ? "import type { ApiRequest } from '../types/api';" : ''}

export async function ${name}Middleware(request${typescript ? ': ApiRequest' : ''}) {
  // Implement your middleware logic here
  console.log(\`${name} middleware executed for \${request.url}\`);
  
  // Return true to continue, false to block
  return true;
}

export function with${name.charAt(0).toUpperCase() + name.slice(1)}(handler${typescript ? ': Function' : ''}) {
  return async function(request${typescript ? ': ApiRequest' : ''}) {
    const allowed = await ${name}Middleware(request);
    
    if (!allowed) {
      return new Response(JSON.stringify({
        error: '${name} middleware blocked request',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return handler(request);
  };
}`;
}

function createRouteTest(name, template, typescript) {
  const imports = typescript ? 
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from '../setup';" :
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from '../setup.js';";

  return `${imports}
import { GET, POST } from '../../pages/api/${name}${typescript ? '' : '.js'}';

describe('${name} API', () => {
  it('should handle GET request', async () => {
    const request = createMockRequest('http://localhost/api/${name}');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('message');
  });

  it('should handle POST request', async () => {
    const request = createMockRequest('http://localhost/api/${name}', {
      method: 'POST',
      body: JSON.stringify({ test: 'data' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data).toHaveProperty('message');
  });
});`;
}

function createCrudTest(name, typescript) {
  const imports = typescript ? 
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from '../setup';" :
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from '../setup.js';";

  return `${imports}
import { GET, POST } from '../../pages/api/${name}${typescript ? '' : '.js'}';

describe('${name} CRUD API', () => {
  it('should get all ${name}s', async () => {
    const request = createMockRequest('http://localhost/api/${name}');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('${name}s');
    expect(data).toHaveProperty('pagination');
  });

  it('should create new ${name}', async () => {
    const request = createMockRequest('http://localhost/api/${name}', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test ${name}' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data).toHaveProperty('${name}');
    expect(data.${name}).toHaveProperty('id');
  });
});`;
}

function createAuthTest(typescript) {
  const imports = typescript ? 
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from './setup';" :
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from './setup.js';";

  return `${imports}
import { POST as login } from '../pages/api/auth/login${typescript ? '' : '.js'}';
import { POST as register } from '../pages/api/auth/register${typescript ? '' : '.js'}';

describe('Auth API', () => {
  it('should login with valid credentials', async () => {
    const request = createMockRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password'
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await login(request);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('user');
  });

  it('should register new user', async () => {
    const request = createMockRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await register(request);
    expect(response.status).toBe(201);
    
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});`;
}

function createMiddlewareTest(name, typescript) {
  const imports = typescript ? 
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from '../setup';" :
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from '../setup.js';";

  return `${imports}
import { ${name}Middleware, with${name.charAt(0).toUpperCase() + name.slice(1)} } from '../../utils/${name}-middleware${typescript ? '' : '.js'}';

describe('${name} Middleware', () => {
  it('should execute middleware', async () => {
    const request = createMockRequest('http://localhost/api/test');
    const result = await ${name}Middleware(request);
    
    expect(typeof result).toBe('boolean');
  });

  it('should wrap handler with middleware', async () => {
    const mockHandler = async () => new Response('OK');
    const wrappedHandler = with${name.charAt(0).toUpperCase() + name.slice(1)}(mockHandler);
    
    const request = createMockRequest('http://localhost/api/test');
    const response = await wrappedHandler(request);
    
    expect(response).toBeInstanceOf(Response);
  });
});`;
}

function createTestTemplate(name, typescript) {
  const imports = typescript ? 
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from './setup';" :
    "import { describe, it, expect } from 'vitest';\nimport { createMockRequest } from './setup.js';";

  return `${imports}

describe('${name} Tests', () => {
  it('should pass basic test', () => {
    expect(true).toBe(true);
  });

  it('should test API endpoint', async () => {
    const request = createMockRequest('http://localhost/api/${name}');
    
    // Add your test logic here
    expect(request.url).toBe('http://localhost/api/${name}');
  });
});`;
}