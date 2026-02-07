# Sentry Error Tracking Setup

Complete guide for integrating Sentry error tracking with your Vite API plugin.

## 🚀 Quick Start

### 1. Install Sentry

```bash
npm install @sentry/node
```

### 2. Create Sentry Account

1. Go to [sentry.io](https://sentry.io)
2. Sign up for free account
3. Create a new project (select "Node.js")
4. Copy your DSN (Data Source Name)

### 3. Configure Environment

Add to `.env`:

```bash
SENTRY_DSN=https://your-key@sentry.io/your-project-id
NODE_ENV=development
```

### 4. Enable in Config

The plugin automatically initializes Sentry when configured:

```js
// vite.config.js
export default defineConfig({
  plugins: [
    apiRoutes({
      errorTracking: {
        enabled: true,
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        sampleRate: 1.0, // Capture 100% of errors
      },
    }),
  ],
});
```

### 5. Test Error Tracking

```bash
npm run dev
```

Visit: `http://localhost:5173/api/test-error`

Check your Sentry dashboard for the error.

## 📊 Configuration Options

### Basic Configuration

```js
errorTracking: {
  enabled: true,
  dsn: process.env.SENTRY_DSN,
  environment: 'production',
  sampleRate: 1.0, // 1.0 = 100%, 0.5 = 50%
}
```

### Advanced Configuration

```js
errorTracking: {
  enabled: true,
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  
  // Sample rate (0.0 to 1.0)
  sampleRate: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,
  
  // Filter and modify events before sending
  beforeSend(event, hint) {
    // Remove sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.authorization;
      delete event.request.headers?.cookie;
    }
    
    // Redact sensitive query params
    if (event.request?.query_string) {
      event.request.query_string = event.request.query_string
        .replace(/token=[^&]*/gi, 'token=[REDACTED]')
        .replace(/password=[^&]*/gi, 'password=[REDACTED]')
        .replace(/secret=[^&]*/gi, 'secret=[REDACTED]');
    }
    
    // Don't send certain errors
    if (event.exception?.values?.[0]?.value?.includes('Network Error')) {
      return null; // Drop this event
    }
    
    return event;
  },
}
```

## 🎯 Error Context

The plugin automatically captures rich context with each error:

```js
{
  method: 'POST',
  url: '/api/users',
  ip: '192.168.1.1',
  query: { id: '123' },
  body: { name: 'John' },
}
```

## 🔍 Manual Error Tracking

### In API Handlers

```js
// pages/api/example.js
export default async function handler(req, res) {
  try {
    // Your code...
    const result = await riskyOperation();
    res.json({ result });
  } catch (error) {
    // Error is automatically captured by the plugin
    // But you can add custom context:
    console.error('Custom context:', { userId: req.user?.id });
    throw error; // Re-throw to let plugin handle it
  }
}
```

### Custom Error Capture

If you need to manually capture errors:

```js
import * as Sentry from '@sentry/node';

export default function handler(req, res) {
  try {
    // Your code...
  } catch (error) {
    // Capture with custom context
    Sentry.captureException(error, {
      tags: {
        endpoint: '/api/example',
        userId: req.user?.id,
      },
      extra: {
        requestBody: req.body,
        customData: 'additional info',
      },
    });
    
    res.status(500).json({ error: 'Internal error' });
  }
}
```

## 📈 Performance Monitoring

Enable performance tracing:

```js
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of transactions
  
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});
```

Track custom transactions:

```js
export default async function handler(req, res) {
  const transaction = Sentry.startTransaction({
    op: 'api.request',
    name: 'POST /api/users',
  });
  
  try {
    const span = transaction.startChild({
      op: 'db.query',
      description: 'Fetch user data',
    });
    
    const user = await db.getUser(req.query.id);
    span.finish();
    
    res.json({ user });
  } finally {
    transaction.finish();
  }
}
```

## 🏷️ User Context

Track which users experience errors:

```js
import * as Sentry from '@sentry/node';

// In your auth middleware
auth: async (req, res) => {
  const user = await authenticateUser(req);
  
  if (user) {
    // Set user context for Sentry
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
    
    req.user = user;
    return true;
  }
  
  return false;
}
```

## 🔔 Alerts and Notifications

### Email Alerts

1. Go to Sentry project settings
2. Navigate to "Alerts"
3. Create new alert rule:
   - Trigger: "An issue is first seen"
   - Action: "Send email to team"

### Slack Integration

1. Go to Settings → Integrations
2. Install Slack integration
3. Configure alert rules to post to Slack

### Custom Webhooks

```js
// Sentry webhook endpoint
export default function handler(req, res) {
  const { action, data } = req.body;
  
  if (action === 'issue.created') {
    // Send to your monitoring system
    await notifyTeam({
      title: data.issue.title,
      url: data.issue.web_url,
      level: data.issue.level,
    });
  }
  
  res.status(200).json({ received: true });
}
```

## 📊 Dashboard and Monitoring

### Key Metrics to Monitor

1. **Error Rate**: Errors per minute/hour
2. **Affected Users**: Number of unique users experiencing errors
3. **Error Frequency**: Most common errors
4. **Response Time**: API performance metrics

### Custom Dashboards

Create custom dashboards in Sentry:

1. Go to Dashboards
2. Create new dashboard
3. Add widgets:
   - Error frequency by endpoint
   - Error rate over time
   - Top 10 errors
   - Affected users

## 🧪 Testing Error Tracking

### Test Error Endpoint

```js
// pages/api/test-error.js
export default function handler(req, res) {
  // This will be captured by Sentry
  throw new Error('Test error for Sentry');
}
```

### Test in Development

```bash
# Start dev server
npm run dev

# Trigger test error
curl http://localhost:5173/api/test-error

# Check Sentry dashboard
```

### Verify Integration

```js
import * as Sentry from '@sentry/node';

// Send test event
Sentry.captureMessage('Test message from API', 'info');
```

## 🔒 Security and Privacy

### Remove Sensitive Data

```js
beforeSend(event, hint) {
  // Remove PII
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers?.authorization;
  }
  
  // Scrub sensitive fields
  if (event.extra?.body) {
    const body = event.extra.body;
    if (body.password) body.password = '[REDACTED]';
    if (body.ssn) body.ssn = '[REDACTED]';
    if (body.creditCard) body.creditCard = '[REDACTED]';
  }
  
  return event;
}
```

### IP Address Anonymization

```js
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event) {
    // Remove IP address
    if (event.user) {
      delete event.user.ip_address;
    }
    return event;
  },
});
```

## 💰 Pricing and Limits

### Free Tier
- 5,000 errors/month
- 10,000 performance units/month
- 30-day data retention
- 1 project

### Paid Plans
- Team: $26/month (50k errors)
- Business: $80/month (100k errors)
- Enterprise: Custom pricing

### Optimize Usage

```js
// Sample errors in production
sampleRate: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,

// Ignore common errors
beforeSend(event) {
  // Ignore 404s
  if (event.exception?.values?.[0]?.value?.includes('404')) {
    return null;
  }
  
  // Ignore bot traffic
  if (event.request?.headers?.['user-agent']?.includes('bot')) {
    return null;
  }
  
  return event;
}
```

## 📚 Resources

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)
- [Error Tracking Guide](https://docs.sentry.io/product/issues/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

## 🆘 Troubleshooting

### Errors Not Appearing

1. Check DSN is correct
2. Verify `enabled: true`
3. Check network connectivity
4. Look for console warnings

### Too Many Errors

1. Reduce sample rate
2. Add filters in `beforeSend`
3. Fix underlying issues
4. Upgrade Sentry plan

### Missing Context

1. Ensure error is thrown (not just logged)
2. Check `beforeSend` isn't removing data
3. Verify user context is set
4. Add custom context manually
