#!/usr/bin/env node

/**
 * Validate environment variables
 * Usage: node scripts/validate-env.js
 */

import { validateEnvironment, EnvChecker } from '../src/lib/env.js';

console.log('\n🔍 Environment Variable Validation\n');
console.log('═'.repeat(50));

try {
  const loader = validateEnvironment();

  console.log('\n📊 Environment Summary:\n');
  console.log(`  Environment: ${EnvChecker.getEnvironment()}`);
  console.log(`  Production: ${EnvChecker.isProduction()}`);
  console.log(`  Development: ${EnvChecker.isDevelopment()}`);
  console.log(`  HTTPS Enabled: ${EnvChecker.isHttpsEnabled()}`);
  console.log(`  Debug Mode: ${EnvChecker.isDebugEnabled()}`);

  console.log('\n📋 Loaded Variables:\n');
  const safeEnv = loader.getSafeEnv();
  for (const [key, value] of Object.entries(safeEnv)) {
    if (value) {
      console.log(`  ${key}: ${value}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('\n✅ All environment variables are valid!\n');

} catch (error) {
  console.error('\n❌ Validation failed:', error.message);
  process.exit(1);
}
