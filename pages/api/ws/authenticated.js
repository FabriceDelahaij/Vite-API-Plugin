/**
 * Authenticated WebSocket Example
 * Demonstrates authentication before accepting WebSocket connection
 */

// Simple token validation (replace with your actual auth logic)
function validateToken(token) {
  // In production, verify JWT or session token
  return token && token.startsWith('valid-');
}

function getUserFromToken(token) {
  // In production, decode JWT or lookup session
  return {
    id: token.replace('valid-', ''),
    name: `User ${token.replace('valid-', '')}`,
  };
}

export async function WEBSOCKET(ws, req) {
  // Extract token from query parameter or header
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || req.headers['authorization']?.replace('Bearer ', '');
  
  // Validate authentication
  if (!validateToken(token)) {
    console.log('Unauthorized WebSocket connection attempt');
    ws.close(1008, 'Unauthorized');
    return;
  }

  // Get user info
  const user = getUserFromToken(token);
  console.log(`Authenticated user ${user.name} connected`);

  // Send welcome message with user info
  ws.json({
    type: 'welcome',
    user: {
      id: user.id,
      name: user.name,
    },
    message: `Welcome ${user.name}!`,
    timestamp: new Date().toISOString(),
  });

  // Handle incoming messages
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      console.log(`Message from ${user.name}:`, data);
      
      // Echo back with user context
      ws.json({
        type: 'message',
        user: {
          id: user.id,
          name: user.name,
        },
        content: data.message || data.content,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      ws.json({
        type: 'error',
        message: 'Invalid message format',
      });
    }
  };

  // Handle connection close
  ws.onclose = (event) => {
    console.log(`User ${user.name} disconnected:`, event.code, event.reason);
  };

  // Handle errors
  ws.onerror = (event) => {
    console.error(`WebSocket error for user ${user.name}:`, event.error);
  };
}
