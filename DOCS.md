# Documentation Index

Complete guide to all available documentation for the Vite API Routes Plugin.

## 🚀 Getting Started

- **[README.md](./README.md)** - Main documentation with installation, quick start, and examples
- **[MIGRATION.md](./MIGRATION.md)** - Migrate between API route styles and from other frameworks

## 🔒 Security & Authentication

- **[SECURITY.md](./SECURITY.md)** - Comprehensive security features and best practices
- **[AUTH-GUIDE.md](./AUTH-GUIDE.md)** - Authentication implementation (JWT, API keys, sessions)
- **[HMAC-AUTH-GUIDE.md](./HMAC-AUTH-GUIDE.md)** - HMAC authentication for API security
- **[COOKIES-GUIDE.md](./COOKIES-GUIDE.md)** - Secure cookie management and best practices
- **[HTTPS-SETUP.md](./HTTPS-SETUP.md)** - HTTPS configuration for development and production

## 🔐 Encryption & Environment

- **[ENCRYPTION-GUIDE.md](./ENCRYPTION-GUIDE.md)** - Request/response encryption with key rotation
- **[ENV-GUIDE.md](./ENV-GUIDE.md)** - Environment variables and secrets management

## ⚡ Performance

- **[CACHE-GUIDE.md](./CACHE-GUIDE.md)** - API response caching (in-memory & Redis)
- **[CACHE-SWR-GUIDE.md](./CACHE-SWR-GUIDE.md)** - Stale-while-revalidate pattern for better UX
- **[CACHE-SECURITY-GUIDE.md](./CACHE-SECURITY-GUIDE.md)** - Cache security and encryption
- **[CACHE-HELPERS-GUIDE.md](./CACHE-HELPERS-GUIDE.md)** - Cache helper methods and utilities
- **[COMPRESSION-GUIDE.md](./COMPRESSION-GUIDE.md)** - API response compression (Brotli, Gzip, Zstd)
- **[COMPRESSION-STREAMING-GUIDE.md](./COMPRESSION-STREAMING-GUIDE.md)** - Streaming compression for large responses
- **[ZSTD-IMPLEMENTATION.md](./ZSTD-IMPLEMENTATION.md)** - Zstd compression implementation details

## 🌐 Real-time Communication

- **[WEBSOCKET-QUICKSTART.md](./WEBSOCKET-QUICKSTART.md)** - Get started with WebSocket in 5 minutes
- **[WEBSOCKET-GUIDE.md](./WEBSOCKET-GUIDE.md)** - Complete WebSocket routes guide with security and fragmentation

## 🔍 Debugging & Monitoring

- **[REQUEST-ID-GUIDE.md](./REQUEST-ID-GUIDE.md)** - Request ID tracing for debugging and correlation
- **[SENTRY-SETUP.md](./SENTRY-SETUP.md)** - Error tracking and monitoring setup
- **[CACHE-OBSERVABILITY.md](./CACHE-OBSERVABILITY.md)** - Cache monitoring and observability

## 🛠️ Development Tools

- **[CLI-GUIDE.md](./CLI-GUIDE.md)** - CLI tool for scaffolding and code generation
- **[TYPESCRIPT-GUIDE.md](./TYPESCRIPT-GUIDE.md)** - TypeScript integration and type safety
- **[TESTING-GUIDE.md](./TESTING-GUIDE.md)** - API testing guide and utilities
- **[HMR-GUIDE.md](./HMR-GUIDE.md)** - Hot module replacement for development
- **[IMPORT-GUIDE.md](./IMPORT-GUIDE.md)** - Import patterns and module resolution
- **[DEPENDENCIES-GUIDE.md](./DEPENDENCIES-GUIDE.md)** - Dependency management and updates

## 📝 Examples

- **[EXAMPLE-CUSTOM-AUTH-ONLY.md](./EXAMPLE-CUSTOM-AUTH-ONLY.md)** - Custom authentication examples
- **[EXAMPLE-MULTI-AUTH.md](./EXAMPLE-MULTI-AUTH.md)** - Multiple authentication strategies

## 📋 Quick Reference

### For New Users
1. Start with **[README.md](./README.md)** for installation and basic setup
2. Follow the Quick Start section for your first API route
3. Check **[SECURITY.md](./SECURITY.md)** for production security setup

### For Migration
1. **[MIGRATION.md](./MIGRATION.md)** - Complete migration guide
2. **[TYPESCRIPT-GUIDE.md](./TYPESCRIPT-GUIDE.md)** - Adding TypeScript support
3. **[ENCRYPTION-GUIDE.md](./ENCRYPTION-GUIDE.md)** - Encryption setup and migration

### For Production
1. **[SECURITY.md](./SECURITY.md)** - Security checklist and features
2. **[HTTPS-SETUP.md](./HTTPS-SETUP.md)** - SSL/TLS configuration
3. **[ENV-GUIDE.md](./ENV-GUIDE.md)** - Environment variables and secrets
4. **[SENTRY-SETUP.md](./SENTRY-SETUP.md)** - Error tracking setup
5. **[DEPENDENCIES-GUIDE.md](./DEPENDENCIES-GUIDE.md)** - Keep dependencies secure

### For Advanced Features
1. **[AUTH-GUIDE.md](./AUTH-GUIDE.md)** - Authentication systems
2. **[COOKIES-GUIDE.md](./COOKIES-GUIDE.md)** - Secure cookie handling
3. **[ENCRYPTION-GUIDE.md](./ENCRYPTION-GUIDE.md)** - Request/response encryption
4. **[CLI-GUIDE.md](./CLI-GUIDE.md)** - CLI tools and scaffolding

## 🎯 Common Use Cases

### "I want to get started quickly"
→ **[README.md](./README.md)** Quick Start section

### "I'm migrating from Next.js"
→ **[MIGRATION.md](./MIGRATION.md)** Next.js → Modern Style section

### "I need authentication"
→ **[AUTH-GUIDE.md](./AUTH-GUIDE.md)** + **[COOKIES-GUIDE.md](./COOKIES-GUIDE.md)**

### "I want TypeScript support"
→ **[TYPESCRIPT-GUIDE.md](./TYPESCRIPT-GUIDE.md)**

### "I need HTTPS in production"
→ **[HTTPS-SETUP.md](./HTTPS-SETUP.md)** + **[SECURITY.md](./SECURITY.md)**

### "I want to encrypt API data"
→ **[ENCRYPTION-GUIDE.md](./ENCRYPTION-GUIDE.md)**

### "I need error tracking"
→ **[SENTRY-SETUP.md](./SENTRY-SETUP.md)**

### "I need request tracing and debugging"
→ **[REQUEST-ID-GUIDE.md](./REQUEST-ID-GUIDE.md)** + **[CACHE-OBSERVABILITY.md](./CACHE-OBSERVABILITY.md)**

### "I want to test my APIs"
→ **[TESTING-GUIDE.md](./TESTING-GUIDE.md)**

### "I need CLI tools"
→ **[CLI-GUIDE.md](./CLI-GUIDE.md)**

### "I want real-time communication"
→ **[WEBSOCKET-QUICKSTART.md](./WEBSOCKET-QUICKSTART.md)** + **[WEBSOCKET-GUIDE.md](./WEBSOCKET-GUIDE.md)**

## 📚 File Organization

```
docs/
├── README.md                      # Main documentation & quick start
├── DOCS.md                        # This documentation index
├── MIGRATION.md                   # Migration between styles/frameworks
├── SECURITY.md                    # Security features & best practices
│
├── Authentication & Security
│   ├── AUTH-GUIDE.md              # Authentication implementation
│   ├── HMAC-AUTH-GUIDE.md         # HMAC authentication
│   ├── COOKIES-GUIDE.md           # Secure cookie management
│   ├── HTTPS-SETUP.md             # HTTPS configuration
│   └── ENCRYPTION-GUIDE.md        # Request/response encryption
│
├── Performance
│   ├── CACHE-GUIDE.md             # Response caching
│   ├── CACHE-SWR-GUIDE.md         # Stale-while-revalidate
│   ├── CACHE-SECURITY-GUIDE.md    # Cache security
│   ├── CACHE-HELPERS-GUIDE.md     # Cache helpers
│   ├── CACHE-OBSERVABILITY.md     # Cache monitoring
│   ├── COMPRESSION-GUIDE.md       # Response compression
│   ├── COMPRESSION-STREAMING-GUIDE.md  # Streaming compression
│   └── ZSTD-IMPLEMENTATION.md     # Zstd compression details
│
├── Real-time & WebSocket
│   ├── WEBSOCKET-QUICKSTART.md    # WebSocket quick start
│   └── WEBSOCKET-GUIDE.md         # Complete WebSocket guide
│
├── Development & Tools
│   ├── CLI-GUIDE.md               # CLI tool documentation
│   ├── TYPESCRIPT-GUIDE.md        # TypeScript integration
│   ├── TESTING-GUIDE.md           # API testing guide
│   ├── HMR-GUIDE.md               # Hot module replacement
│   └── IMPORT-GUIDE.md            # Import patterns
│
├── Configuration & Setup
│   ├── ENV-GUIDE.md               # Environment variables
│   ├── SENTRY-SETUP.md            # Error tracking setup
│   ├── DEPENDENCIES-GUIDE.md      # Dependency management
│   └── REQUEST-ID-GUIDE.md        # Request ID tracing
│
└── Examples
    ├── EXAMPLE-CUSTOM-AUTH-ONLY.md
    └── EXAMPLE-MULTI-AUTH.md
```

## 🆘 Need Help?

1. **Check the relevant guide** using this index
2. **Search the documentation** for specific topics
3. **Review examples** in the guides
4. **Check GitHub Issues** for common problems
5. **Create a new issue** if you can't find the answer

Happy coding! 🚀