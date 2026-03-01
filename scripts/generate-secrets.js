#!/usr/bin/env node

/**
 * Generate secure secrets for environment variables
 * Usage: node scripts/generate-secrets.js
 */

import { SecretGenerator, createEnvExample } from '../src/lib/env.js';
import fs from 'fs';
import path from 'path';

console.log('\n🔐 Secure Secret Generator\n');
console.log('═'.repeat(50));

// Generate all secrets
const secrets = SecretGenerator.generateAll();

console.log('\n📝 Generated Secrets:\n');
console.log('Copy these to your .env file:\n');

for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}=${value}`);
}

console.log('\n' + '═'.repeat(50));

// Offer to create .env file
console.log('\n💡 Options:\n');
console.log('1. Copy the secrets above to your .env file manually');
console.log('2. Run this script with --create to create .env file automatically');
console.log('3. Run with --example to create .env.example file');

if (process.argv.includes('--create')) {
  const envPath = path.join(process.cwd(), '.env');
  
  if (fs.existsSync(envPath)) {
    console.log('\n⚠️  .env file already exists!');
    console.log('Backup your existing .env file before proceeding.');
    process.exit(1);
  }

  let content = '# Environment Variables\n';
  content += `# Generated: ${new Date().toISOString()}\n`;
  content += '# IMPORTANT: Never commit this file to version control!\n\n';

  content += '# Security Secrets\n';
  for (const [key, value] of Object.entries(secrets)) {
    content += `${key}=${value}\n`;
  }

  content += '\n# CORS Configuration\n';
  content += 'ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173\n\n';

  content += '# Server Configuration\n';
  content += 'PORT=5173\n';
  content += 'HOST=localhost\n';
  content += 'NODE_ENV=development\n\n';

  content += '# Rate Limiting\n';
  content += 'RATE_LIMIT_WINDOW_MS=900000\n';
  content += 'RATE_LIMIT_MAX_REQUESTS=100\n\n';

  content += '# Optional: Sentry Error Tracking\n';
  content += '# SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id\n\n';

  content += '# Optional: SSL Certificates (Production)\n';
  content += '# SSL_KEY_PATH=/etc/ssl/private/key.pem\n';
  content += '# SSL_CERT_PATH=/etc/ssl/certs/cert.pem\n';

  fs.writeFileSync(envPath, content);
  console.log('\n✅ Created .env file successfully!');
  console.log(`   Location: ${envPath}`);
}

if (process.argv.includes('--example')) {
  const examplePath = path.join(process.cwd(), '.env.example');
  const content = createEnvExample();
  fs.writeFileSync(examplePath, content);
  console.log('\n✅ Created .env.example file successfully!');
  console.log(`   Location: ${examplePath}`);
}

console.log('\n⚠️  Security Reminders:\n');
console.log('  • Never commit .env files to version control');
console.log('  • Add .env to your .gitignore file');
console.log('  • Use different secrets for each environment');
console.log('  • Rotate secrets regularly in production');
console.log('  • Store production secrets in a secure vault\n');
