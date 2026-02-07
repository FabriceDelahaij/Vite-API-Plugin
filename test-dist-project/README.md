# Vite API Routes Plugin - Live Demo

This is a live demonstration of the Vite API Routes Plugin, showcasing its features and capabilities.

## 🌐 Live Demo

Visit the live demo at: [https://your-username.github.io/vite-api-plugin/](https://your-username.github.io/vite-api-plugin/)

## 🚀 Features Demonstrated

### API Endpoints
- **GET /api/test** - Basic JSON response
- **POST /api/test** - Accepts and processes POST data
- **GET /api/users/[id]** - Dynamic route with parameters
- **GET /api/hello** - Hello world with query parameters

### Plugin Features
- ✅ Modern App Router syntax (`export async function GET()`)
- ✅ TypeScript support
- ✅ Security features (CORS, rate limiting)
- ✅ File-based routing
- ✅ Hot module replacement
- ✅ Interactive API testing interface

## 🛠️ Local Development

To run this demo locally:

```bash
# Install dependencies
npm install

# Install the plugin from the built distribution
npm install file:../dist

# Start development server
npm run dev
```

## 📁 Project Structure

```
test-dist-project/
├── pages/api/           # API routes
│   ├── test.js         # Basic test endpoint
│   ├── hello.js        # Hello world endpoint
│   └── users/[id].js   # Dynamic route
├── index.html          # Demo interface
├── vite.config.js      # Vite configuration with plugin
└── package.json        # Dependencies
```

## 🔧 Configuration

The demo uses this Vite configuration:

```javascript
import { defineConfig } from 'vite';
import apiRoutes from 'vite-api-routes-plugin';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/vite-api-plugin/' : '/',
  plugins: [
    apiRoutes({
      apiDir: 'pages/api',
      apiPrefix: '/api',
      cors: { origin: '*', credentials: true },
      security: { enableCsrf: false, enableHelmet: true },
      rateLimit: { windowMs: 15 * 60 * 1000, max: 1000 },
    }),
  ],
});
```

## 📚 Learn More

- [Plugin Documentation](../README.md)
- [TypeScript Guide](../TYPESCRIPT-GUIDE.md)
- [Security Features](../SECURITY.md)
- [CLI Tools](../CLI-GUIDE.md)

## 🤝 Contributing

This demo is part of the Vite API Routes Plugin project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see the [LICENSE](../LICENSE) file for details.