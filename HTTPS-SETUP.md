# HTTPS Setup Guide

This guide covers setting up HTTPS for both development and production environments.

## 🔒 Development (Self-Signed Certificates)

### Quick Start

Generate self-signed certificates and start HTTPS dev server:

```bash
npm run dev:https
```

This will:
1. Generate self-signed SSL certificates in `.cert/` directory
2. Start Vite dev server with HTTPS enabled
3. Your API will be available at `https://localhost:5173`

### Manual Certificate Generation

```bash
npm run generate-cert
```

Or manually with OpenSSL:

```bash
mkdir .cert
openssl req -x509 -newkey rsa:4096 -keyout .cert/key.pem -out .cert/cert.pem \
  -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

### Browser Security Warning

Self-signed certificates will trigger browser security warnings. This is normal for development.

**Chrome/Edge:**
1. Click "Advanced"
2. Click "Proceed to localhost (unsafe)"

**Firefox:**
1. Click "Advanced"
2. Click "Accept the Risk and Continue"

**Safari:**
1. Click "Show Details"
2. Click "visit this website"

### Trust Certificate (Optional)

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain .cert/cert.pem
```

**Windows:**
```powershell
certutil -addstore -f "ROOT" .cert/cert.pem
```

**Linux:**
```bash
sudo cp .cert/cert.pem /usr/local/share/ca-certificates/localhost.crt
sudo update-ca-certificates
```

## 🚀 Production (Real SSL Certificates)

### Option 1: Let's Encrypt (Free)

**Using Certbot:**

```bash
# Install Certbot
sudo apt-get install certbot  # Ubuntu/Debian
brew install certbot          # macOS

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

**Set environment variables:**

```bash
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

**Auto-renewal:**

```bash
# Add to crontab
sudo crontab -e

# Add this line (renew daily at 2am)
0 2 * * * certbot renew --quiet
```

### Option 2: Cloud Provider SSL

**AWS Certificate Manager:**
- Use AWS ALB/CloudFront with ACM certificates
- Terminate SSL at load balancer
- Forward HTTP traffic to your app

**Cloudflare:**
- Enable Cloudflare proxy
- Use Cloudflare's SSL/TLS encryption
- Set SSL mode to "Full (strict)"

**DigitalOcean:**
- Use DigitalOcean Load Balancer
- Add SSL certificate in control panel
- Forward traffic to your droplet

### Option 3: Custom SSL Certificate

If you have a certificate from a provider:

```bash
# Set paths to your certificates
export SSL_KEY_PATH=/path/to/your/private.key
export SSL_CERT_PATH=/path/to/your/certificate.crt
```

## 📝 Production Configuration

### Environment Variables

Create `.env.production`:

```bash
# SSL Certificates
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem

# CORS - Your production domains
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Sentry
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Auth
API_TOKEN=your-secure-production-token

NODE_ENV=production
```

### Build and Run

```bash
# Build for production
npm run build:prod

# Preview production build
npm run preview
```

### Deployment

**Using PM2:**

```bash
npm install -g pm2

# Start with production config
pm2 start npm --name "api-server" -- run preview

# Save PM2 configuration
pm2 save

# Auto-start on reboot
pm2 startup
```

**Using Docker:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build:prod

# Copy SSL certificates
COPY certs/key.pem /etc/ssl/private/key.pem
COPY certs/cert.pem /etc/ssl/certs/cert.pem

EXPOSE 5173

CMD ["npm", "run", "preview"]
```

**Using systemd:**

Create `/etc/systemd/system/api-server.service`:

```ini
[Unit]
Description=API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/api
Environment=NODE_ENV=production
Environment=SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
Environment=SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
ExecStart=/usr/bin/npm run preview
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable api-server
sudo systemctl start api-server
sudo systemctl status api-server
```

## 🔐 Security Best Practices

### 1. Certificate Permissions

```bash
# Restrict access to private key
sudo chmod 600 /path/to/private.key
sudo chown root:root /path/to/private.key
```

### 2. Force HTTPS

Add redirect in your web server (nginx example):

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Strong SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. HSTS Header

Already enabled in the plugin via security headers:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 4. Certificate Monitoring

Monitor certificate expiration:

```bash
# Check expiration date
openssl x509 -in /path/to/cert.pem -noout -enddate

# Set up monitoring alert (30 days before expiration)
echo "0 0 * * * /usr/local/bin/check-cert-expiry.sh" | crontab -
```

## 🧪 Testing HTTPS

### Test SSL Configuration

```bash
# Using curl
curl -v https://localhost:5173/api/hello

# Using openssl
openssl s_client -connect localhost:5173 -showcerts

# Check SSL rating (production)
# Visit: https://www.ssllabs.com/ssltest/
```

### Test API with HTTPS

```bash
# GET request
curl -k https://localhost:5173/api/hello

# POST request with CSRF token
TOKEN=$(curl -k https://localhost:5173/api/auth/login | jq -r '.csrfToken')
curl -k -X POST https://localhost:5173/api/users \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{"name":"John"}'
```

## 📚 Resources

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
