# WebSocket Quick Start

Get started with WebSocket routes in 5 minutes.

## 1. Enable WebSocket Support

Add to your `vite.config.js`:

```javascript
import apiRoutes from './vite-plugin-api-routes.js';

export default {
  plugins: [
    apiRoutes({
      websocket: {
        enabled: true,
      },
    }),
  ],
};
```

## 2. Create Your First WebSocket Route

Create `pages/api/ws/echo.js`:

```javascript
export async function WEBSOCKET(ws, req) {
  console.log('Client connected:', ws.id);

  ws.send('Welcome to the echo server!');

  ws.onmessage = (event) => {
    ws.send(`Echo: ${event.data}`);
  };

  ws.onclose = () => {
    console.log('Client disconnected');
  };
}
```

## 3. Start Your Server

```bash
npm run dev
```

## 4. Test Your WebSocket

### Option A: Use the Test Client

Open in your browser:
```
http://localhost:3000/websocket-test.html
```

### Option B: Use Browser Console

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws/echo');

ws.onopen = () => {
  console.log('Connected!');
  ws.send('Hello');
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};
```

## 5. Try More Examples

### Chat Room

Create `pages/api/ws/chat.js`:

```javascript
const clients = new Set();

export async function WEBSOCKET(ws, req) {
  clients.add(ws);
  
  ws.onmessage = (event) => {
    // Broadcast to all clients
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(event.data);
      }
    }
  };

  ws.onclose = () => {
    clients.delete(ws);
  };
}
```

Connect:
```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws/chat');
```

### Dynamic Routes

Create `pages/api/ws/[room].js`:

```javascript
export async function WEBSOCKET(ws, req) {
  const roomId = ws.params.room;
  
  ws.send(`Welcome to room: ${roomId}`);
  
  ws.onmessage = (event) => {
    ws.send(`[${roomId}] ${event.data}`);
  };
}
```

Connect to different rooms:
```javascript
const ws1 = new WebSocket('ws://localhost:3000/api/ws/lobby');
const ws2 = new WebSocket('ws://localhost:3000/api/ws/general');
```

## Common Patterns

### Send JSON

```javascript
ws.json({ type: 'message', text: 'Hello' });
```

### Handle JSON Messages

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data.text);
};
```

### Broadcast to Multiple Clients

```javascript
const clients = new Set();

function broadcast(message) {
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}
```

### Authentication

```javascript
export async function WEBSOCKET(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  
  if (!isValidToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  // Continue with authenticated connection
}
```

## Next Steps

- Read the [full WebSocket guide](./WEBSOCKET-GUIDE.md)
- Check out [example implementations](./pages/api/ws/)
- Review [TypeScript types](./src/types/api.ts)
- Monitor connections at `http://localhost:3000/__hmr_status`

## Troubleshooting

**Connection fails?**
- Check WebSocket is enabled in config
- Verify route exports `WEBSOCKET` function
- Ensure server is running

**Messages not received?**
- Check `ws.readyState === 1` before sending
- Verify event handlers are set up
- Check browser console for errors

**Need help?**
- See [full documentation](./WEBSOCKET-GUIDE.md)
- Review working examples in `pages/api/ws/`
