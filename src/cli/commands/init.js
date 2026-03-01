import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';

export const initCommand = new Command('init')
  .description('Initialize a new Vite API Routes project')
  .option('-t, --template <template>', 'Project template (basic, auth, full)', 'basic')
  .option('-ts, --typescript', 'Use TypeScript', false)
  .option('-f, --force', 'Overwrite existing files', false)
  .action(async (options) => {
    console.log(chalk.blue('🚀 Initializing Vite API Routes project...\n'));

    // Interactive prompts if no options provided
    if (!options.template || !options.typescript) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'template',
          message: 'Choose a project template:',
          choices: [
            { name: 'Basic - Simple API routes', value: 'basic' },
            { name: 'Auth - With authentication system', value: 'auth' },
            { name: 'Full - Complete setup with all features', value: 'full' }
          ],
          default: options.template
        },
        {
          type: 'confirm',
          name: 'typescript',
          message: 'Use TypeScript?',
          default: options.typescript
        },
        {
          type: 'confirm',
          name: 'security',
          message: 'Enable security features (CORS, CSRF, rate limiting)?',
          default: true
        },
        {
          type: 'confirm',
          name: 'https',
          message: 'Setup HTTPS for development?',
          default: false
        }
      ]);

      Object.assign(options, answers);
    }

    try {
      await createProject(options);
      console.log(chalk.green('\n✅ Project initialized successfully!'));
      console.log(chalk.yellow('\nNext steps:'));
      console.log('  npm install');
      console.log('  npm run dev');
      console.log('\nFor more help: vite-api-routes --help');
    } catch (error) {
      console.error(chalk.red('❌ Error initializing project:'), error.message);
      process.exit(1);
    }
  });

async function createProject(options) {
  const { template, typescript, security, https, force } = options;
  const ext = typescript ? 'ts' : 'js';

  // Create directory structure
  const dirs = [
    'pages/api',
    'types',
    'utils',
    'tests',
    '.vite-api'
  ];

  if (template === 'auth' || template === 'full') {
    dirs.push('pages/api/auth', 'pages/api/protected');
  }

  dirs.forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(chalk.green(`Created directory: ${dir}`));
    }
  });

  // Create package.json if it doesn't exist
  if (!existsSync('package.json') || force) {
    const packageJson = createPackageJson(typescript);
    writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    console.log(chalk.green('Created package.json'));
  }

  // Create vite.config.js
  const viteConfig = createViteConfig(options);
  writeFileSync(`vite.config.${ext}`, viteConfig);
  console.log(chalk.green(`Created vite.config.${ext}`));

  // Create TypeScript config if needed
  if (typescript) {
    const tsConfig = createTsConfig();
    writeFileSync('tsconfig.json', JSON.stringify(tsConfig, null, 2));
    console.log(chalk.green('Created tsconfig.json'));

    // Create type definitions
    const apiTypes = createApiTypes();
    writeFileSync('types/api.ts', apiTypes);
    console.log(chalk.green('Created types/api.ts'));
  }

  // Create example routes based on template
  await createExampleRoutes(template, ext);

  // Create utility files
  const utilsContent = createUtilsFile(typescript);
  writeFileSync(`utils/api-helpers.${ext}`, utilsContent);
  console.log(chalk.green(`Created utils/api-helpers.${ext}`));

  // Create test setup
  const testConfig = createTestConfig(typescript);
  writeFileSync(`tests/setup.${ext}`, testConfig);
  console.log(chalk.green(`Created tests/setup.${ext}`));

  // Create .env.example
  const envExample = createEnvExample(options);
  writeFileSync('.env.example', envExample);
  console.log(chalk.green('Created .env.example'));

  // Create README
  const readme = createReadme(options);
  writeFileSync('README.md', readme);
  console.log(chalk.green('Created README.md'));
}

function createPackageJson(typescript) {
  return {
    name: 'my-vite-api-project',
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: typescript ? 'tsc && vite build' : 'vite build',
      preview: 'vite preview',
      test: 'vitest',
      'test:ui': 'vitest --ui',
      'type-check': typescript ? 'tsc --noEmit' : undefined
    },
    devDependencies: {
      vite: '^5.0.0',
      vitest: '^1.0.0',
      ...(typescript && {
        typescript: '^5.0.0',
        '@types/node': '^20.0.0'
      })
    },
    dependencies: {
      'vite-api-routes-plugin': '^1.0.0'
    }
  };
}

function createViteConfig(options) {
  const { typescript, security, https } = options;
  const importExt = typescript ? '' : '.js';

  return `import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin${importExt}';

export default defineConfig({
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      ${security ? `
      // Security configuration
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:5173'],
        credentials: true,
      },
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100,
      },
      security: {
        enableCsrf: true,
        enableHelmet: true,
        maxBodySize: 1024 * 1024,
      },` : ''}
      ${https ? `
      // HTTPS configuration
      https: {
        enabled: true,
        key: fs.readFileSync('.cert/key.pem'),
        cert: fs.readFileSync('.cert/cert.pem'),
      },` : ''}
    }),
  ],
  ${https ? `
  server: {
    https: {
      key: fs.readFileSync('.cert/key.pem'),
      cert: fs.readFileSync('.cert/cert.pem'),
    },
  },` : ''}
});`;
}

function createTsConfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'node',
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      resolveJsonModule: true,
      isolatedModules: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      baseUrl: '.',
      paths: {
        '@/*': ['./*'],
        '@/types/*': ['./types/*'],
        '@/utils/*': ['./utils/*']
      }
    },
    include: ['pages/**/*', 'types/**/*', 'utils/**/*', 'tests/**/*'],
    exclude: ['node_modules', 'dist']
  };
}

function createApiTypes() {
  return `// API type definitions
export interface ApiRequest extends Request {
  ip: string;
  user?: User;
  cookies: Record<string, string>;
  getCsrfToken(): string;
}

export interface User {
  id: string | number;
  name: string;
  email: string;
  role?: string;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  field?: string;
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type ApiHandler = (request: ApiRequest) => Promise<Response>;
`;
}

async function createExampleRoutes(template, ext) {
  // Basic hello route
  const helloRoute = `// Example API route
export async function GET(request${ext === 'ts' ? ': ApiRequest' : ''}) {
  return new Response(JSON.stringify({
    message: 'Hello from Vite API Routes!',
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request${ext === 'ts' ? ': ApiRequest' : ''}) {
  const body = await request.json();
  
  return new Response(JSON.stringify({
    message: 'Data received',
    received: body,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`;

  writeFileSync(`pages/api/hello.${ext}`, helloRoute);
  console.log(chalk.green(`Created pages/api/hello.${ext}`));

  if (template === 'auth' || template === 'full') {
    // Auth routes
    const loginRoute = `// Login endpoint
export async function POST(request${ext === 'ts' ? ': ApiRequest' : ''}) {
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
}`;

    writeFileSync(`pages/api/auth/login.${ext}`, loginRoute);
    console.log(chalk.green(`Created pages/api/auth/login.${ext}`));

    const protectedRoute = `// Protected route example
export async function GET(request${ext === 'ts' ? ': ApiRequest' : ''}) {
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
    user,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`;

    writeFileSync(`pages/api/protected/profile.${ext}`, protectedRoute);
    console.log(chalk.green(`Created pages/api/protected/profile.${ext}`));
  }
}

function createUtilsFile(typescript) {
  return `// API utility functions
${typescript ? "import type { ApiErrorResponse, ApiSuccessResponse } from '../types/api';" : ''}

export function createJsonResponse(data${typescript ? ': any' : ''}, status${typescript ? ': number' : ''} = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createErrorResponse(error${typescript ? ': string' : ''}, status${typescript ? ': number' : ''} = 400, message${typescript ? '?: string' : ''}) {
  const errorResponse${typescript ? ': ApiErrorResponse' : ''} = { error, message };
  return createJsonResponse(errorResponse, status);
}

export function createSuccessResponse(data${typescript ? ': any' : ''}, message${typescript ? '?: string' : ''}, status${typescript ? ': number' : ''} = 200) {
  const successResponse${typescript ? ': ApiSuccessResponse<typeof data>' : ''} = {
    success: true,
    data,
    message,
  };
  return createJsonResponse(successResponse, status);
}

export function isValidEmail(email${typescript ? ': string' : ''}) {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}`;
}

function createTestConfig(typescript) {
  return `// Test configuration
${typescript ? "import { beforeAll, afterAll } from 'vitest';" : ''}

// Global test setup
beforeAll(async () => {
  // Setup test environment
  console.log('Setting up tests...');
});

afterAll(async () => {
  // Cleanup after tests
  console.log('Cleaning up tests...');
});

// Test utilities
export function createMockRequest(url${typescript ? ': string' : ''}, options${typescript ? '?: RequestInit' : ''} = {}) {
  const request = new Request(url, options)${typescript ? ' as any' : ''};
  
  // Add custom properties
  request.ip = '127.0.0.1';
  request.cookies = {};
  request.getCsrfToken = () => 'mock-csrf-token';
  
  return request;
}

export function createMockUser(overrides${typescript ? '?: Partial<any>' : ''} = {}) {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    ...overrides,
  };
}`;
}

function createEnvExample(options) {
  return `# Environment Variables

# Development
NODE_ENV=development
PORT=5173

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this
API_TOKEN=your-api-token-here

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

${options.https ? `
# SSL Certificates (for HTTPS)
SSL_KEY_PATH=.cert/key.pem
SSL_CERT_PATH=.cert/cert.pem
` : ''}

# Optional: Sentry Error Tracking
# SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Optional: Database
# DATABASE_URL=postgresql://user:password@localhost:5432/mydb
`;
}

function createReadme(options) {
  return `# My Vite API Project

Generated with Vite API Routes Plugin CLI.

## Features

- 🚀 Fast development with Vite
- 📁 File-based API routing
- ${options.typescript ? '🔷 Full TypeScript support' : '📝 JavaScript ready'}
- ${options.security ? '🔒 Built-in security features' : '🔓 Basic setup'}
- ${options.https ? '🌐 HTTPS development server' : '🌐 HTTP development server'}
- ✅ Testing setup with Vitest

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Copy environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Start development server:
   \`\`\`bash
   npm run dev
   \`\`\`

4. Visit your API:
   - Hello endpoint: http://localhost:5173/api/hello
   ${options.template === 'auth' || options.template === 'full' ? '- Login endpoint: http://localhost:5173/api/auth/login' : ''}

## Available Scripts

- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run preview\` - Preview production build
- \`npm run test\` - Run tests
- \`npm run test:ui\` - Run tests with UI
${options.typescript ? '- `npm run type-check` - Check TypeScript types' : ''}

## CLI Commands

- \`vite-api-routes generate route <name>\` - Generate new route
- \`vite-api-routes generate auth\` - Generate auth system
- \`vite-api-routes test\` - Run tests
- \`vite-api-routes docs\` - Generate API documentation

## Project Structure

\`\`\`
pages/api/          # API routes
${options.typescript ? 'types/              # TypeScript definitions' : ''}
utils/              # Utility functions
tests/              # Test files
\`\`\`

## Learn More

- [Vite API Routes Plugin Documentation](https://github.com/your-repo/vite-api-routes)
- [Vite Documentation](https://vitejs.dev/)
${options.typescript ? '- [TypeScript Documentation](https://www.typescriptlang.org/)' : ''}
`;
}