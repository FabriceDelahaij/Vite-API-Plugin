/**
 * WebSocket Route Handler
 * Provides WebSocket support for API routes
 */

import { parse } from 'url';
import crypto from 'crypto';

export class WebSocketManager {
  constructor(options = {}) {
    this.options = {
      maxConnections: 1000,
      pingInterval: 30000, // 30 seconds
      pingTimeout: 5000, // 5 seconds
      maxPayloadSize: 1024 * 1024, // 1MB
      enableLogging: true,
      // Origin validation (CORS for WebSocket)
      origins: null, // null = allow all, [] = deny all, ['origin1', 'origin2'] = allowlist
      validateOrigin: true, // Enable origin validation
      // UTF-8 validation for text frames
      validateUtf8: true, // Validate UTF-8 in text frames (RFC 6455 requirement)
      ...options,
    };

    this.connections = new Map();
    this.routes = new Map();
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
      originRejections: 0,
      utf8Errors: 0,
    };

    this.log = this.options.enableLogging ? console.log : () => {};
    
    // Create UTF-8 decoder for text frame validation
    if (this.options.validateUtf8) {
      this.utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    }
  }

  /**
   * Register a WebSocket route handler
   */
  registerRoute(route, handler) {
    this.routes.set(route, handler);
    this.log(`📡 WebSocket route registered: ${route}`);
  }

  /**
   * Validate UTF-8 encoding for text frames
   * RFC 6455 Section 8.1: Text frames must contain valid UTF-8
   * 
   * @param {Buffer} buffer - Payload buffer to validate
   * @returns {string|null} Decoded string if valid, null if invalid
   */
  validateUtf8(buffer) {
    if (!this.options.validateUtf8) {
      // Validation disabled, use non-fatal decoding
      return buffer.toString('utf8');
    }

    try {
      // Use TextDecoder with fatal: true to detect invalid UTF-8
      return this.utf8Decoder.decode(buffer);
    } catch (error) {
      // Invalid UTF-8 detected
      this.stats.utf8Errors++;
      return null;
    }
  }

  /**
   * Validate Origin header (CORS for WebSocket)
   * Prevents Cross-Site WebSocket Hijacking (CSWSH)
   * 
   * @param {string} origin - Origin header from request
   * @returns {boolean} True if origin is allowed
   */
  isOriginAllowed(origin) {
    // If validation is disabled, allow all origins
    if (!this.options.validateOrigin) {
      return true;
    }

    // If no origin header, reject (browsers always send Origin)
    if (!origin) {
      return false;
    }

    // If origins is null, allow all origins
    if (this.options.origins === null) {
      return true;
    }

    // If origins is empty array, deny all
    if (Array.isArray(this.options.origins) && this.options.origins.length === 0) {
      return false;
    }

    // Check if origin is in allowlist
    if (Array.isArray(this.options.origins)) {
      return this.options.origins.includes(origin);
    }

    // Default: deny
    return false;
  }

  /**
   * Handle HTTP upgrade request
   */
  async handleUpgrade(req, socket, head, server, apiPrefix) {
    const { pathname } = parse(req.url, true);

    // Check if this is a WebSocket route
    if (!pathname.startsWith(apiPrefix)) {
      socket.destroy();
      return false;
    }

    // Validate Origin header (prevent CSWSH attacks)
    const origin = req.headers.origin;
    if (!this.isOriginAllowed(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      this.stats.originRejections++;
      this.log(`❌ Origin rejected: ${origin}`);
      return false;
    }

    // Find matching handler
    let handler = null;
    let params = {};

    if (this.routes.has(pathname)) {
      handler = this.routes.get(pathname);
    } else {
      // Try dynamic routes
      for (const [route, routeHandler] of this.routes.entries()) {
        const match = this.matchRoute(route, pathname);
        if (match) {
          handler = routeHandler;
          params = match.params;
          break;
        }
      }
    }

    if (!handler) {
      socket.destroy();
      return false;
    }

    // Check connection limit
    if (this.connections.size >= this.options.maxConnections) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return false;
    }

    try {
      // RFC 6455 Section 4.2.1: Validate required headers
      
      // 1. Validate WebSocket version (MUST be 13)
      const version = req.headers['sec-websocket-version'];
      if (version !== '13') {
        socket.write(
          'HTTP/1.1 426 Upgrade Required\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          '\r\n'
        );
        socket.destroy();
        this.log(`❌ Invalid WebSocket version: ${version} (expected 13)`);
        return false;
      }

      // 2. Validate Upgrade header (MUST be "websocket")
      const upgrade = req.headers['upgrade'];
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        this.log(`❌ Invalid Upgrade header: ${upgrade}`);
        return false;
      }

      // 3. Validate Connection header (MUST include "Upgrade")
      const connection = req.headers['connection'];
      if (!connection || !connection.toLowerCase().includes('upgrade')) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        this.log(`❌ Invalid Connection header: ${connection}`);
        return false;
      }

      // 4. Validate Sec-WebSocket-Key (MUST be present)
      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        this.log('❌ Missing Sec-WebSocket-Key header');
        return false;
      }

      // Perform WebSocket handshake
      const acceptKey = this.generateAcceptKey(key);
      
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        '\r\n'
      );

      // Create WebSocket connection wrapper
      const ws = this.createWebSocketConnection(socket, req, params);
      
      // Load and execute handler
      const module = await server.ssrLoadModule(handler);
      const handlerFn = module.WEBSOCKET || module.websocket || module.default;

      if (!handlerFn || typeof handlerFn !== 'function') {
        ws.close(1011, 'Handler not found');
        return false;
      }

      // Execute handler
      await handlerFn(ws, req);

      return true;
    } catch (error) {
      this.stats.errors++;
      this.log('❌ WebSocket upgrade error:', error);
      socket.destroy();
      return false;
    }
  }

  /**
   * Create WebSocket connection wrapper
   */
  createWebSocketConnection(socket, req, params) {
    const connectionId = crypto.randomUUID();
    
    // Fragment buffer for handling continuation frames
    const fragmentBuffer = {
      opcode: null,      // Opcode of the first frame in the sequence
      chunks: [],        // Array of payload chunks
      totalSize: 0,      // Total size of buffered data
    };
    
    // Receive buffer for handling partial TCP frames
    // TCP can split WebSocket frames arbitrarily across multiple data events
    let receiveBuffer = Buffer.alloc(0);
    
    const ws = {
      id: connectionId,
      socket,
      req,
      params,
      readyState: 1, // OPEN
      isAlive: true,
      
      // Send message
      send: (data) => {
        if (ws.readyState !== 1) return;
        
        try {
          const payload = typeof data === 'string' ? data : JSON.stringify(data);
          const frame = this.createFrame(payload);
          socket.write(frame);
          this.stats.messagesSent++;
        } catch (error) {
          this.log('❌ Send error:', error);
          this.stats.errors++;
        }
      },

      // Send JSON
      json: (data) => {
        ws.send(JSON.stringify(data));
      },

      // Close connection
      close: (code = 1000, reason = '') => {
        if (ws.readyState === 3) return; // Already closed
        
        ws.readyState = 2; // CLOSING
        const closeFrame = this.createCloseFrame(code, reason);
        socket.write(closeFrame);
        socket.end();
        ws.readyState = 3; // CLOSED
        
        this.connections.delete(connectionId);
        this.stats.activeConnections--;
      },

      // Ping
      ping: () => {
        if (ws.readyState !== 1) return;
        const pingFrame = this.createPingFrame();
        socket.write(pingFrame);
      },

      // Event handlers (to be set by user)
      onmessage: null,
      onclose: null,
      onerror: null,
    };

    // Handle incoming data with TCP frame buffering
    // TCP can split WebSocket frames arbitrarily, so we must buffer incomplete data
    socket.on('data', (chunk) => {
      try {
        // Append new chunk to receive buffer
        receiveBuffer = Buffer.concat([receiveBuffer, chunk]);
        
        // Parse as many complete frames as possible
        const { frames, remaining } = this.parseFrames(receiveBuffer);
        
        // Update receive buffer with remaining unparsed data
        receiveBuffer = remaining;
        
        // Process each complete frame
        frames.forEach(({ fin, opcode, payload }) => {
          // Handle continuation frames (opcode 0x0)
          if (opcode === 0x0) {
            // Continuation frame - must have a previous frame buffered
            if (fragmentBuffer.opcode === null) {
              throw new Error('Unexpected continuation frame');
            }
            
            fragmentBuffer.chunks.push(payload);
            fragmentBuffer.totalSize += payload.length;
            
            // Check total size doesn't exceed limit
            if (fragmentBuffer.totalSize > this.options.maxPayloadSize) {
              fragmentBuffer.opcode = null;
              fragmentBuffer.chunks = [];
              fragmentBuffer.totalSize = 0;
              throw new Error('Fragmented message too large');
            }
            
            // If this is the final frame, assemble and deliver
            if (fin) {
              const completePayload = Buffer.concat(fragmentBuffer.chunks);
              const messageOpcode = fragmentBuffer.opcode;
              
              // Reset fragment buffer
              fragmentBuffer.opcode = null;
              fragmentBuffer.chunks = [];
              fragmentBuffer.totalSize = 0;
              
              // Validate UTF-8 for text frames (RFC 6455 Section 8.1)
              if (messageOpcode === 0x1) {
                const text = this.validateUtf8(completePayload);
                if (text === null) {
                  // Invalid UTF-8 in text frame
                  this.log('❌ Invalid UTF-8 in text frame');
                  ws.close(1007, 'Invalid UTF-8');
                  return;
                }
                
                // Deliver complete text message
                this.stats.messagesReceived++;
                if (ws.onmessage) {
                  ws.onmessage({ data: text, type: 'text' });
                }
              } else {
                // Deliver complete binary message
                this.stats.messagesReceived++;
                if (ws.onmessage) {
                  ws.onmessage({ data: completePayload, type: 'binary' });
                }
              }
            }
          }
          // Handle data frames (text or binary)
          else if (opcode === 0x1 || opcode === 0x2) {
            // If we have buffered fragments, this is an error (new message before previous finished)
            if (fragmentBuffer.opcode !== null) {
              fragmentBuffer.opcode = null;
              fragmentBuffer.chunks = [];
              fragmentBuffer.totalSize = 0;
              throw new Error('New message started before previous fragmented message finished');
            }
            
            if (!fin) {
              // First frame of a fragmented message
              fragmentBuffer.opcode = opcode;
              fragmentBuffer.chunks.push(payload);
              fragmentBuffer.totalSize = payload.length;
            } else {
              // Complete message in single frame
              
              // Validate UTF-8 for text frames (RFC 6455 Section 8.1)
              if (opcode === 0x1) {
                const text = this.validateUtf8(payload);
                if (text === null) {
                  // Invalid UTF-8 in text frame
                  this.log('❌ Invalid UTF-8 in text frame');
                  ws.close(1007, 'Invalid UTF-8');
                  return;
                }
                
                // Deliver text message
                this.stats.messagesReceived++;
                if (ws.onmessage) {
                  ws.onmessage({ data: text, type: 'text' });
                }
              } else {
                // Deliver binary message
                this.stats.messagesReceived++;
                if (ws.onmessage) {
                  ws.onmessage({ data: payload, type: 'binary' });
                }
              }
            }
          }
          // Handle control frames
          else if (opcode === 0x8) { // Close
            ws.close();
          } else if (opcode === 0x9) { // Ping
            const pongFrame = this.createPongFrame(payload);
            socket.write(pongFrame);
          } else if (opcode === 0xA) { // Pong
            ws.isAlive = true;
          }
        });
      } catch (error) {
        this.log('❌ Frame parse error:', error);
        this.stats.errors++;
        
        // Close connection on protocol violations (e.g., unmasked frames)
        if (error.message.includes('protocol violation') || error.message.includes('Unmasked')) {
          ws.close(1002, 'Protocol error');
        } else {
          ws.close(1011, 'Internal error');
        }
      }
    });

    socket.on('close', () => {
      ws.readyState = 3;
      this.connections.delete(connectionId);
      this.stats.activeConnections--;
      if (ws.onclose) {
        ws.onclose({ code: 1006, reason: 'Connection closed' });
      }
    });

    socket.on('error', (error) => {
      this.stats.errors++;
      if (ws.onerror) {
        ws.onerror({ error });
      }
      ws.close(1011, 'Internal error');
    });

    // Store connection
    this.connections.set(connectionId, ws);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    // Setup ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState !== 1) {
        clearInterval(pingInterval);
        return;
      }
      
      if (!ws.isAlive) {
        clearInterval(pingInterval);
        ws.close(1001, 'Ping timeout');
        return;
      }
      
      ws.isAlive = false;
      ws.ping();
    }, this.options.pingInterval);

    return ws;
  }

  /**
   * Generate WebSocket accept key
   */
  generateAcceptKey(key) {
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');
  }

  /**
   * Create WebSocket frame
   */
  createFrame(payload, opcode = 0x1) {
    const payloadBuffer = Buffer.from(payload);
    const payloadLength = payloadBuffer.length;
    
    let frame;
    let offset = 2;

    if (payloadLength < 126) {
      frame = Buffer.allocUnsafe(2 + payloadLength);
      frame[1] = payloadLength;
    } else if (payloadLength < 65536) {
      frame = Buffer.allocUnsafe(4 + payloadLength);
      frame[1] = 126;
      frame.writeUInt16BE(payloadLength, 2);
      offset = 4;
    } else {
      frame = Buffer.allocUnsafe(10 + payloadLength);
      frame[1] = 127;
      frame.writeBigUInt64BE(BigInt(payloadLength), 2);
      offset = 10;
    }

    frame[0] = 0x80 | opcode; // FIN + opcode
    payloadBuffer.copy(frame, offset);

    return frame;
  }

  /**
   * Create close frame
   */
  createCloseFrame(code, reason) {
    const reasonBuffer = Buffer.from(reason);
    const frame = Buffer.allocUnsafe(4 + reasonBuffer.length);
    frame[0] = 0x88; // FIN + Close opcode
    frame[1] = 2 + reasonBuffer.length;
    frame.writeUInt16BE(code, 2);
    reasonBuffer.copy(frame, 4);
    return frame;
  }

  /**
   * Create ping frame
   */
  createPingFrame() {
    return Buffer.from([0x89, 0x00]); // FIN + Ping opcode, no payload
  }

  /**
   * Create pong frame
   */
  createPongFrame(payload = '') {
    const payloadBuffer = Buffer.from(payload);
    const frame = Buffer.allocUnsafe(2 + payloadBuffer.length);
    frame[0] = 0x8A; // FIN + Pong opcode
    frame[1] = payloadBuffer.length;
    payloadBuffer.copy(frame, 2);
    return frame;
  }

  /**
   * Parse WebSocket frames from client with TCP frame buffering support
   * 
   * Implements RFC 6455 WebSocket protocol frame parsing.
   * IMPORTANT: All client-to-server frames MUST be masked per RFC 6455 Section 5.1.
   * This is a security requirement to prevent cache poisoning attacks.
   * 
   * TCP can split WebSocket frames arbitrarily, so this function:
   * 1. Parses as many complete frames as possible from the buffer
   * 2. Returns remaining unparsed data for the next data event
   * 
   * @param {Buffer} buffer - Raw data buffer from client (may contain partial frames)
   * @returns {Object} { frames: Array<Frame>, remaining: Buffer }
   * @throws {Error} If frame is malformed or unmasked (protocol violation)
   */
  parseFrames(buffer) {
    const frames = [];
    let offset = 0;

    while (offset < buffer.length) {
      // Need at least 2 bytes for frame header
      if (buffer.length - offset < 2) break;

      const byte1 = buffer[offset];
      const byte2 = buffer[offset + 1];

      const fin = (byte1 & 0x80) !== 0;
      const opcode = byte1 & 0x0F;
      const masked = (byte2 & 0x80) !== 0;
      let payloadLength = byte2 & 0x7F;

      offset += 2;

      // Extended payload length (16-bit)
      if (payloadLength === 126) {
        if (buffer.length - offset < 2) break;
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } 
      // Extended payload length (64-bit)
      else if (payloadLength === 127) {
        if (buffer.length - offset < 8) break;
        payloadLength = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      if (payloadLength > this.options.maxPayloadSize) {
        throw new Error('Payload too large');
      }

      // RFC 6455 Section 5.5: Control frame validation
      // Control frames are identified by opcodes where the most significant bit is 1 (>= 0x8)
      // Control frames: Close (0x8), Ping (0x9), Pong (0xA)
      if (opcode >= 0x8) {
        // Control frames MUST NOT be fragmented
        if (!fin) {
          throw new Error('Control frame must not be fragmented');
        }
        
        // Control frames MUST have payload length <= 125 bytes
        if (payloadLength > 125) {
          throw new Error('Control frame payload too large (max 125 bytes)');
        }
      }

      // RFC 6455 Section 5.1: Client-to-server frames MUST be masked
      // This is a security requirement to prevent cache poisoning attacks.
      // All frames from client to server must have the MASK bit set and include a 32-bit masking key.
      // Browsers automatically mask frames, but we enforce this for all clients.
      if (!masked) {
        throw new Error('Unmasked client frame - protocol violation');
      }

      // Need 4 bytes for masking key
      if (buffer.length - offset < 4) break;
      const maskKey = buffer.slice(offset, offset + 4);
      offset += 4;

      // Need full payload
      if (buffer.length - offset < payloadLength) break;

      let payload = buffer.slice(offset, offset + payloadLength);
      offset += payloadLength;

      // Unmask the payload
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }

      frames.push({
        fin,
        opcode,
        payload, // Keep as Buffer, convert to string later if needed
      });
    }

    // Return parsed frames and remaining unparsed data
    const remaining = offset < buffer.length ? buffer.slice(offset) : Buffer.alloc(0);
    
    return {
      frames,
      remaining,
    };
  }

  /**
   * Match route with dynamic parameters
   */
  matchRoute(route, pathname) {
    const routeParts = route.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);

    if (routeParts.length !== pathParts.length) {
      return null;
    }

    const params = {};

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return { params };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      routes: this.routes.size,
    };
  }

  /**
   * Broadcast to all connections
   */
  broadcast(data, filter = null) {
    for (const ws of this.connections.values()) {
      if (filter && !filter(ws)) continue;
      ws.send(data);
    }
  }

  /**
   * Close all connections
   */
  closeAll(code = 1001, reason = 'Server shutdown') {
    for (const ws of this.connections.values()) {
      ws.close(code, reason);
    }
  }
}
