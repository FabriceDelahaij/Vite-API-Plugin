/**
 * WebSocket Chat Room Example
 * Broadcasts messages to all connected clients
 */

const rooms = new Map();

export async function WEBSOCKET(ws, req) {
  const roomId = new URL(req.url, 'http://localhost').searchParams.get('room') || 'default';
  
  // Get or create room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const room = rooms.get(roomId);
  
  // Add connection to room
  room.add(ws);
  
  console.log(`User ${ws.id} joined room: ${roomId}`);
  
  // Broadcast join message
  broadcast(room, {
    type: 'join',
    userId: ws.id,
    message: `User ${ws.id} joined the room`,
    timestamp: new Date().toISOString(),
  }, ws);

  // Send room info to new user
  ws.json({
    type: 'info',
    roomId,
    users: room.size,
    message: `Welcome to room ${roomId}`,
  });

  // Handle incoming messages
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Broadcast message to all users in room
      broadcast(room, {
        type: 'message',
        userId: ws.id,
        message: data.message || event.data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Handle plain text messages
      broadcast(room, {
        type: 'message',
        userId: ws.id,
        message: event.data,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Handle connection close
  ws.onclose = () => {
    room.delete(ws);
    console.log(`User ${ws.id} left room: ${roomId}`);
    
    // Broadcast leave message
    broadcast(room, {
      type: 'leave',
      userId: ws.id,
      message: `User ${ws.id} left the room`,
      timestamp: new Date().toISOString(),
    });
    
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  };

  // Handle errors
  ws.onerror = (event) => {
    console.error('WebSocket error:', event.error);
  };
}

function broadcast(room, message, exclude = null) {
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload);
    }
  }
}
