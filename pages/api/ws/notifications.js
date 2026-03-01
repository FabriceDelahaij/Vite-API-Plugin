/**
 * Real-time Notifications WebSocket
 * Demonstrates integration with existing features:
 * - Authentication
 * - Broadcasting
 * - Room management
 * - Message persistence
 */

// Store active connections by user ID
const userConnections = new Map();

// Store notification history
const notificationHistory = [];
const MAX_HISTORY = 100;

export async function WEBSOCKET(ws, req) {
  // Extract user ID from query parameter
  const url = new URL(req.url, 'http://localhost');
  const userId = url.searchParams.get('userId');
  
  if (!userId) {
    ws.close(1008, 'User ID required');
    return;
  }

  console.log(`User ${userId} connected for notifications`);

  // Track connection
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId).add(ws);

  // Send connection confirmation
  ws.json({
    type: 'connected',
    userId,
    timestamp: new Date().toISOString(),
  });

  // Send recent notification history
  const recentNotifications = notificationHistory.slice(-10);
  if (recentNotifications.length > 0) {
    ws.json({
      type: 'history',
      notifications: recentNotifications,
    });
  }

  // Handle incoming messages
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'subscribe':
          handleSubscribe(ws, userId, data);
          break;
          
        case 'unsubscribe':
          handleUnsubscribe(ws, userId, data);
          break;
          
        case 'send_notification':
          handleSendNotification(userId, data);
          break;
          
        case 'mark_read':
          handleMarkRead(ws, userId, data);
          break;
          
        default:
          ws.json({
            type: 'error',
            message: 'Unknown message type',
          });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      ws.json({
        type: 'error',
        message: 'Invalid message format',
      });
    }
  };

  // Handle connection close
  ws.onclose = () => {
    const connections = userConnections.get(userId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        userConnections.delete(userId);
      }
    }
    console.log(`User ${userId} disconnected from notifications`);
  };

  // Handle errors
  ws.onerror = (event) => {
    console.error(`Notification WebSocket error for user ${userId}:`, event.error);
  };
}

function handleSubscribe(ws, userId, data) {
  const { channel } = data;
  
  ws.json({
    type: 'subscribed',
    channel,
    timestamp: new Date().toISOString(),
  });
  
  console.log(`User ${userId} subscribed to ${channel}`);
}

function handleUnsubscribe(ws, userId, data) {
  const { channel } = data;
  
  ws.json({
    type: 'unsubscribed',
    channel,
    timestamp: new Date().toISOString(),
  });
  
  console.log(`User ${userId} unsubscribed from ${channel}`);
}

function handleSendNotification(senderId, data) {
  const { targetUserId, title, message, priority = 'normal' } = data;
  
  const notification = {
    id: crypto.randomUUID(),
    from: senderId,
    to: targetUserId,
    title,
    message,
    priority,
    timestamp: new Date().toISOString(),
    read: false,
  };
  
  // Store in history
  notificationHistory.push(notification);
  if (notificationHistory.length > MAX_HISTORY) {
    notificationHistory.shift();
  }
  
  // Send to target user if connected
  const targetConnections = userConnections.get(targetUserId);
  if (targetConnections) {
    const payload = JSON.stringify({
      type: 'notification',
      notification,
    });
    
    for (const conn of targetConnections) {
      if (conn.readyState === 1) {
        conn.send(payload);
      }
    }
  }
  
  console.log(`Notification sent from ${senderId} to ${targetUserId}`);
}

function handleMarkRead(ws, userId, data) {
  const { notificationId } = data;
  
  // Find and mark notification as read
  const notification = notificationHistory.find(n => n.id === notificationId);
  if (notification && notification.to === userId) {
    notification.read = true;
    
    ws.json({
      type: 'marked_read',
      notificationId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Broadcast notification to all connected users
export function broadcastToAll(notification) {
  const payload = JSON.stringify({
    type: 'broadcast',
    notification,
  });
  
  for (const connections of userConnections.values()) {
    for (const ws of connections) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }
}

// Send notification to specific user
export function sendToUser(userId, notification) {
  const connections = userConnections.get(userId);
  if (!connections) return false;
  
  const payload = JSON.stringify({
    type: 'notification',
    notification,
  });
  
  let sent = false;
  for (const ws of connections) {
    if (ws.readyState === 1) {
      ws.send(payload);
      sent = true;
    }
  }
  
  return sent;
}
