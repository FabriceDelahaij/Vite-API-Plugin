#!/usr/bin/env node

/**
 * Generate self-signed SSL certificate for local HTTPS development
 * For production, use proper SSL certificates from Let's Encrypt or your provider
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const certDir = path.join(process.cwd(), '.cert');

// Create .cert directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('✓ SSL certificates already exist in .cert/');
  console.log('  Key:  .cert/key.pem');
  console.log('  Cert: .cert/cert.pem');
  process.exit(0);
}

console.log('Generating self-signed SSL certificate...');

try {
  // Generate self-signed certificate using OpenSSL
  execSync(
    `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" ` +
    `-days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`,
    { stdio: 'inherit' }
  );

  console.log('\n✓ SSL certificates generated successfully!');
  console.log('  Key:  .cert/key.pem');
  console.log('  Cert: .cert/cert.pem');
  console.log('\n⚠ Note: These are self-signed certificates for development only.');
  console.log('  Your browser will show a security warning. This is normal.');
  console.log('  For production, use proper SSL certificates from Let\'s Encrypt or your provider.');
} catch (error) {
  console.error('\n✗ Error generating SSL certificates:');
  console.error('  Make sure OpenSSL is installed on your system.');
  console.error('  Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
  console.error('  macOS: brew install openssl');
  console.error('  Linux: sudo apt-get install openssl');
  process.exit(1);
}
