/**
 * WebSocket Fragment Test
 * Tests handling of fragmented messages
 * 
 * This route demonstrates that the WebSocket implementation correctly handles:
 * - Single-frame messages (FIN=1)
 * - Multi-frame fragmented messages (FIN=0 followed by FIN=1)
 * - Large messages that may be automatically fragmented by clients
 */

export async function WEBSOCKET(ws, req) {
  console.log('Fragment test connection established:', ws.id);

  ws.send('Fragment test server ready. Send messages of any size!');

  let messageCount = 0;

  ws.onmessage = (event) => {
    messageCount++;
    const size = typeof event.data === 'string' ? event.data.length : event.data.length;
    
    console.log(`Message ${messageCount} received:`, {
      type: event.type,
      size: size,
      preview: typeof event.data === 'string' 
        ? event.data.substring(0, 50) + (event.data.length > 50 ? '...' : '')
        : `<binary ${size} bytes>`,
    });

    // Echo back with metadata
    ws.json({
      messageNumber: messageCount,
      type: event.type,
      size: size,
      received: typeof event.data === 'string' ? event.data : `<binary ${size} bytes>`,
      timestamp: new Date().toISOString(),
    });
  };

  ws.onclose = (event) => {
    console.log(`Fragment test connection closed: ${event.code} - ${event.reason}`);
    console.log(`Total messages received: ${messageCount}`);
  };

  ws.onerror = (event) => {
    console.error('Fragment test error:', event.error);
  };
}
