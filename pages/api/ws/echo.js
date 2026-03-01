/**
 * WebSocket Echo Example
 * Echoes back any message received from the client
 */

export async function WEBSOCKET(ws, req) {
  console.log('WebSocket connection established:', ws.id);

  // Send welcome message
  ws.send('Welcome to the echo server!');

  // Handle incoming messages
  ws.onmessage = (event) => {
    console.log('Received:', event.data);
    
    // Echo back the message
    ws.send(`Echo: ${event.data}`);
  };

  // Handle connection close
  ws.onclose = (event) => {
    console.log('Connection closed:', event.code, event.reason);
  };

  // Handle errors
  ws.onerror = (event) => {
    console.error('WebSocket error:', event.error);
  };
}
