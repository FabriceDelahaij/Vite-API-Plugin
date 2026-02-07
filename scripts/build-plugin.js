#!/usr/bin/env node

/**
 * Build script for NPM package distribution
 * Updated to include CLI tools, testing utilities, and encryption features
 */

import fs from 'fs';
import path from 'path';

console.log('🔨 Building vite-api-routes-plugin for NPM distribution...\n');

// Clean dist directory
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Create necessary directories
const directories = ['types', 'utils', 'testing', 'cli', 'bin'];
directories.forEach(dir => {
  fs.mkdirSync(path.join(distDir, dir), { recursive: true });
});

// Copy main plugin file
console.log('📦 Copying plugin files...');
fs.copyFileSync('vite-plugin-api-routes.js', path.join(distDir, 'index.js'));

// Copy CLI tools (optional dependencies)
console.log('�️ Copying CLI tools...');
if (fs.existsSync('bin')) {
  fs.cpSync('bin', path.join(distDir, 'bin'), { recursive: true });
}
if (fs.existsSync('src/cli')) {
  fs.cpSync('src/cli', path.join(distDir, 'cli'), { recursive: true });
}

// Copy utilities
console.log('🔧 Copying utilities...');
if (fs.existsSync('src/utils')) {
  // Copy TypeScript files and rename to .js for distribution
  const utilsFiles = fs.readdirSync('src/utils');
  utilsFiles.forEach(file => {
    const srcPath = path.join('src/utils', file);
    const stat = fs.statSync(srcPath);
    
    // Skip directories and test files
    if (stat.isDirectory() || file.includes('.test.') || file.includes('.spec.')) {
      return;
    }
    
    const destPath = path.join(distDir, 'utils', file.replace('.ts', '.js'));
    
    if (file.endsWith('.ts')) {
      // For TypeScript files, we'll copy as .js but keep the content
      // In a real build, you'd compile TypeScript to JavaScript
      let content = fs.readFileSync(srcPath, 'utf-8');
      
      // Simple TypeScript to JavaScript conversion (basic)
      content = content
        .replace(/import\s+type\s+{[^}]+}\s+from\s+[^;]+;?\s*/g, '') // Remove type imports
        .replace(/from\s+['"]\.\.\/types\/api['"];?/g, "from './types/api.js';") // Fix relative imports
        .replace(/:\s*[A-Za-z<>[\]|&\s]+(?=\s*[=,)])/g, '') // Remove type annotations
        .replace(/interface\s+\w+\s*{[^}]*}/g, '') // Remove interfaces
        .replace(/export\s+interface\s+\w+\s*{[^}]*}/g, '') // Remove exported interfaces
        .replace(/as\s+\w+/g, ''); // Remove type assertions
      
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

// Copy testing utilities
console.log('🧪 Copying testing utilities...');
if (fs.existsSync('src/testing')) {
  const testingFiles = fs.readdirSync('src/testing');
  testingFiles.forEach(file => {
    const srcPath = path.join('src/testing', file);
    const stat = fs.statSync(srcPath);
    
    // Skip directories and test files
    if (stat.isDirectory() || file.includes('.test.') || file.includes('.spec.')) {
      return;
    }
    
    const destPath = path.join(distDir, 'testing', file.replace('.ts', '.js'));
    
    if (file.endsWith('.ts')) {
      let content = fs.readFileSync(srcPath, 'utf-8');
      
      // Simple TypeScript to JavaScript conversion
      content = content
        .replace(/import\s+type\s+{[^}]+}\s+from\s+[^;]+;?\s*/g, '')
        .replace(/:\s*[A-Za-z<>[\]|&\s]+(?=\s*[=,)])/g, '')
        .replace(/interface\s+\w+\s*{[^}]*}/g, '')
        .replace(/export\s+interface\s+\w+\s*{[^}]*}/g, '')
        .replace(/as\s+\w+/g, '');
      
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

// Copy types
console.log('� Copying type definitions...');
if (fs.existsSync('src/types')) {
  fs.cpSync('src/types', path.join(distDir, 'types'), { recursive: true });
}

// Create main index.d.ts that exports everything
const mainTypes = `/**
 * Vite API Routes Plugin - Type Definitions
 */

// Export all API types
export * from './types/api';

// Plugin function type
export interface ViteApiRoutesOptions {
  apiDir?: string;
  apiPrefix?: string;
  cors?: {
    origin?: string | string[] | '*';
    methods?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
  rateLimit?: {
    windowMs?: number;
    max?: number;
  };
  security?: {
    enableCsrf?: boolean;
    enableHelmet?: boolean;
    maxBodySize?: number;
    allowedMethods?: string[];
  };
  https?: {
    enabled?: boolean;
    key?: Buffer | string;
    cert?: Buffer | string;
  };
  errorTracking?: {
    enabled?: boolean;
    dsn?: string;
    environment?: string;
    sampleRate?: number;
    beforeSend?: Function;
  };
  auth?: Function;
  encryption?: any;
}

export interface ViteApiRoutesPlugin {
  (options?: ViteApiRoutesOptions): any;
}

// Default export (the plugin function)
declare const viteApiRoutes: ViteApiRoutesPlugin;
export default viteApiRoutes;

// Re-export utilities for convenience
export * from './utils/api-helpers';
export * from './utils/encryption';
export * from './testing';
`;

fs.writeFileSync(path.join(distDir, 'index.d.ts'), mainTypes);

// Create CommonJS version for compatibility
console.log('🔄 Creating CommonJS version...');
const cjsContent = `const plugin = require('./index.js');
module.exports = plugin.default || plugin;
module.exports.default = plugin.default || plugin;

// Re-export utilities
if (plugin.createEncryptionManager) {
  module.exports.createEncryptionManager = plugin.createEncryptionManager;
}
if (plugin.createTestRequest) {
  module.exports.createTestRequest = plugin.createTestRequest;
}
`;

fs.writeFileSync(path.join(distDir, 'index.cjs'), cjsContent);

// Copy lib directory if it exists
if (fs.existsSync('src/lib')) {
  console.log('📚 Copying lib directory...');
  fs.cpSync('src/lib', path.join(distDir, 'lib'), { recursive: true });
}

// Copy HMR directory if it exists
if (fs.existsSync('src/hmr')) {
  console.log('🔥 Copying HMR directory...');
  fs.cpSync('src/hmr', path.join(distDir, 'hmr'), { recursive: true });
}

// Copy essential files and documentation
console.log('📄 Copying documentation...');
const filesToCopy = [
  'README.md', 
  'LICENSE',
  'DOCS.md',
  'SECURITY.md',
  'MIGRATION.md',
  'AUTH-GUIDE.md',
  'CACHE-GUIDE.md',
  'CLI-GUIDE.md',
  'COMPRESSION-GUIDE.md',
  'COOKIES-GUIDE.md',
  'DEPENDENCIES-GUIDE.md',
  'ENCRYPTION-GUIDE.md',
  'ENV-GUIDE.md',
  'HMR-GUIDE.md',
  'HTTPS-SETUP.md',
  'SENTRY-SETUP.md',
  'TESTING-GUIDE.md',
  'TYPESCRIPT-GUIDE.md'
];

filesToCopy.forEach(file => {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(distDir, file));
  }
});

// Create package.json for dist (without dev dependencies)
console.log('📦 Creating distribution package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

// Remove dev-only fields but keep essential scripts
const scriptsToKeep = {
  'generate-cert': packageJson.scripts['generate-cert'],
  'generate-secrets': packageJson.scripts['generate-secrets'],
  'validate-env': packageJson.scripts['validate-env'],
  'check-deps': packageJson.scripts['check-deps'],
  'update-deps': packageJson.scripts['update-deps']
};

packageJson.scripts = scriptsToKeep;
delete packageJson.devDependencies;

// Update paths to be relative to dist
packageJson.main = './index.js';
packageJson.module = './index.js';
packageJson.types = './index.d.ts';

// Enhanced exports configuration
packageJson.exports = {
  ".": {
    "types": "./index.d.ts",
    "import": "./index.js",
    "require": "./index.cjs"
  },
  "./types": {
    "types": "./types/api.d.ts"
  },
  "./types/*": {
    "types": "./types/*.d.ts"
  },
  "./utils/*": {
    "types": "./utils/*.d.ts",
    "import": "./utils/*.js",
    "require": "./utils/*.js"
  },
  "./testing": {
    "types": "./testing/index.d.ts",
    "import": "./testing/index.js",
    "require": "./testing/index.js"
  },
  "./encryption": {
    "types": "./utils/encryption.d.ts",
    "import": "./utils/encryption.js",
    "require": "./utils/encryption.js"
  },
  "./package.json": "./package.json"
};

// Add keywords for better discoverability
packageJson.keywords = [
  ...(packageJson.keywords || []),
  'vite-plugin',
  'api-routes',
  'nextjs-style',
  'security',
  'cors',
  'csrf',
  'rate-limiting',
  'https',
  'encryption',
  'cli-tools',
  'testing',
  'typescript'
];

fs.writeFileSync(
  path.join(distDir, 'package.json'), 
  JSON.stringify(packageJson, null, 2)
);

// Create .npmignore to exclude unnecessary files
console.log('🚫 Creating .npmignore...');
const npmIgnore = `# Development files
*.log
.env*
.vscode/
.idea/
node_modules/
coverage/
.nyc_output/

# Test files
**/*.test.js
**/*.test.ts
**/*.spec.js
**/*.spec.ts

# Build artifacts
dist/
build/

# OS files
.DS_Store
Thumbs.db

# Git
.git/
.gitignore
`;

fs.writeFileSync(path.join(distDir, '.npmignore'), npmIgnore);

console.log('\n✅ Build complete!');
console.log('\n📁 Distribution structure:');
console.log('dist/');
console.log('├── index.js              # Main plugin');
console.log('├── index.cjs             # CommonJS version');
console.log('├── index.d.ts            # Main type definitions');
console.log('├── bin/                  # CLI binary (optional)');
console.log('│   └── vite-api-routes.js');
console.log('├── cli/                  # CLI commands (optional)');
console.log('│   └── commands/');
console.log('├── lib/                  # Core libraries');
console.log('│   ├── auth.js');
console.log('│   ├── cache.js');
console.log('│   ├── compression.js');
console.log('│   ├── cookies.js');
console.log('│   ├── cors.js');
console.log('│   └── env.js');
console.log('├── hmr/                  # Hot Module Replacement');
console.log('│   ├── client-hmr.js');
console.log('│   ├── dependency-tracker.js');
console.log('│   ├── hot-reload-manager.js');
console.log('│   └── state-manager.js');
console.log('├── utils/                # Utilities');
console.log('│   ├── api-helpers.js');
console.log('│   └── encryption.js');
console.log('├── testing/              # Testing utilities');
console.log('│   ├── index.js');
console.log('│   └── setup.js');
console.log('├── types/                # Type definitions');
console.log('│   └── api.d.ts');
console.log('├── package.json          # Distribution package.json');
console.log('├── README.md             # Main documentation');
console.log('├── DOCS.md               # Documentation index');
console.log('├── AUTH-GUIDE.md         # Authentication guide');
console.log('├── CACHE-GUIDE.md        # Caching guide');
console.log('├── CLI-GUIDE.md          # CLI documentation');
console.log('├── COMPRESSION-GUIDE.md  # Compression guide');
console.log('├── ENCRYPTION-GUIDE.md   # Encryption documentation');
console.log('└── *.md                  # Other guides');

console.log('\n🚀 Ready for NPM publishing!');
console.log('   Run: cd dist && npm publish');
console.log('\n💡 Package features:');
console.log('   ✅ Core plugin functionality');
console.log('   ✅ Optional CLI tools (requires commander, chalk, inquirer)');
console.log('   ✅ Testing utilities');
console.log('   ✅ Encryption utilities');
console.log('   ✅ Complete TypeScript support');
console.log('   ✅ Comprehensive documentation');