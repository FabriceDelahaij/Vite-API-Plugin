/**
 * Dynamic WebSocket Room Example
 * Demonstrates dynamic routing with WebSocket
 * Access via: ws://localhost:3000/api/ws/room-name
 */

const rooms = new Map();

export async function WEBSOCKET(ws, req) {
  // Get room from dynamic route parameter
  const roomId = ws.params.room;
  
  // Get or create room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Set(),
      messages: [],
      created: new Date(),
    });
  }
  const room = rooms.get(roomId);
  
  // Add connection to room
  room.clients.add(ws);
  
  console.log(`Client ${ws.id} joined room: ${roomId} (${room.clients.size} users)`);
  
  // Send room history
  ws.json({
    type: 'history',
    roomId,
    messages: room.messages.slice(-50), // Last 50 messages
    users: room.clients.size,
  });
  
  // Broadcast join notification
  broadcastToRoom(room, {
    type: 'user-joined',
    userId: ws.id,
    users: room.clients.size,
    timestamp: new Date().toISOString(),
  }, ws);

  // Handle incoming messages
  ws.onmessage = (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      
      const message = {
        id: crypto.randomUUID(),
        userId: ws.id,
        content: data.content || data.message || event.data,
        timestamp: new Date().toISOString(),
      };
      
      // Store message in room history
      room.messages.push(message);
      if (room.messages.length > 100) {
        room.messages.shift(); // Keep only last 100 messages
      }
      
      // Broadcast to all clients in room
      broadcastToRoom(room, {
        type: 'message',
        ...message,
      });
    } catch (error) {
      console.error('Message handling error:', error);
      ws.json({
        type: 'error',
        message: 'Failed to process message',
      });
    }
  };

  // Handle connection close
  ws.onclose = () => {
    room.clients.delete(ws);
    console.log(`Client ${ws.id} left room: ${roomId} (${room.clients.size} users)`);
    
    // Broadcast leave notification
    broadcastToRoom(room, {
      type: 'user-left',
      userId: ws.id,
      users: room.clients.size,
      timestamp: new Date().toISOString(),
    });
    
    // Clean up empty rooms after 5 minutes
    if (room.clients.size === 0) {
      setTimeout(() => {
        if (room.clients.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} cleaned up`);
        }
      }, 5 * 60 * 1000);
    }
  };

  // Handle errors
  ws.onerror = (event) => {
    console.error(`WebSocket error in room ${roomId}:`, event.error);
  };
}

function broadcastToRoom(room, message, exclude = null) {
  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload);
    }
  }
}
