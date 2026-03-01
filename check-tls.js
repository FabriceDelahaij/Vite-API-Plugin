import https from 'https';
import tls from 'tls';
import fs from 'fs';

console.log('🔍 Checking TLS Configuration...\n');

// Check Node.js TLS defaults
console.log('📋 Node.js TLS Information:');
console.log('Node.js Version:', process.version);
console.log('OpenSSL Version:', process.versions.openssl);
console.log('Default TLS Min Version:', tls.DEFAULT_MIN_VERSION);
console.log('Default TLS Max Version:', tls.DEFAULT_MAX_VERSION);
console.log('Supported TLS Versions:', tls.getCiphers().length, 'ciphers available');

// Check if HTTPS is configured
const certPath = '.cert/cert.pem';
const keyPath = '.cert/key.pem';

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('\n✅ SSL Certificates found');
  console.log('Certificate:', certPath);
  console.log('Key:', keyPath);
  
  // Check certificate details
  try {
    const cert = fs.readFileSync(certPath, 'utf8');
    console.log('\n📜 Certificate Info:');
    console.log(cert.substring(0, 100) + '...');
  } catch (err) {
    console.error('Error reading certificate:', err.message);
  }
} else {
  console.log('\n⚠️  SSL Certificates not found in .cert/ directory');
  console.log('Run: npm run generate-cert');
}

// Check production SSL paths
const prodKeyPath = process.env.SSL_KEY_PATH || '/etc/ssl/private/key.pem';
const prodCertPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/cert.pem';

console.log('\n🏭 Production SSL Paths:');
console.log('Key:', prodKeyPath, fs.existsSync(prodKeyPath) ? '✅' : '❌');
console.log('Cert:', prodCertPath, fs.existsSync(prodCertPath) ? '✅' : '❌');

// Check environment variables
console.log('\n🌍 Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('SSL_KEY_PATH:', process.env.SSL_KEY_PATH || 'not set');
console.log('SSL_CERT_PATH:', process.env.SSL_CERT_PATH || 'not set');

console.log('\n💡 Recommendations:');
console.log('- Node.js', process.version, 'supports TLS 1.2 and TLS 1.3 by default');
console.log('- For production, use TLS 1.2+ (TLS 1.0 and 1.1 are deprecated)');
console.log('- Current default min version:', tls.DEFAULT_MIN_VERSION);
console.log('- Current default max version:', tls.DEFAULT_MAX_VERSION);
