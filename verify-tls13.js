import https from 'https';
import fs from 'fs';

console.log('🔒 Verifying TLS 1.3 Configuration\n');

// Check if certificates exist
if (!fs.existsSync('.cert/cert.pem') || !fs.existsSync('.cert/key.pem')) {
  console.log('⚠️  Certificates not found. Run: npm run generate-cert');
  process.exit(1);
}

// Create HTTPS server with TLS 1.3 only
const server = https.createServer({
  key: fs.readFileSync('.cert/key.pem'),
  cert: fs.readFileSync('.cert/cert.pem'),
  minVersion: 'TLSv1.3',
  maxVersion: 'TLSv1.3',
}, (req, res) => {
  res.writeHead(200);
  res.end('TLS 1.3 Server Running!');
});

server.listen(8443, () => {
  console.log('✅ HTTPS Server started on port 8443');
  console.log('📋 TLS Configuration:');
  console.log('   Min Version: TLSv1.3');
  console.log('   Max Version: TLSv1.3');
  console.log('\n💡 Test with:');
  console.log('   curl -k --tlsv1.3 https://localhost:8443');
  console.log('   curl -k --tlsv1.2 https://localhost:8443  (should fail)');
  console.log('\nPress Ctrl+C to stop');
});

server.on('secureConnection', (tlsSocket) => {
  console.log('\n🔐 New connection:');
  console.log('   Protocol:', tlsSocket.getProtocol());
  console.log('   Cipher:', tlsSocket.getCipher().name);
});

server.on('tlsClientError', (err) => {
  console.log('\n❌ TLS Error:', err.message);
});
