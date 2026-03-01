/**
 * WebSocket Route Handler Type Definitions
 * Provides WebSocket support for API routes
 */

import { IncomingMessage } from 'http';
import { Socket } from 'net';

export interface WebSocketOptions {
  maxConnections?: number;
  pingInterval?: number;
  pingTimeout?: number;
  maxPayloadSize?: number;
  enableLogging?: boolean;
  origins?: string[] | null;
  validateOrigin?: boolean;
  validateUtf8?: boolean;
}

export interface WebSocketConnection {
  id: string;
  socket: Socket;
  req: IncomingMessage;
  params: Record<string, string>;
  readyState: number;
  isAlive: boolean;
  
  send(data: string | object): void;
  json(data: any): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  
  onmessage: ((event: { data: string | Buffer; type: 'text' | 'binary' }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: { error: Error }) => void) | null;
}

export interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  messagesReceived: number;
  messagesSent: number;
  errors: number;
  originRejections: number;
  utf8Errors: number;
  routes: number;
}

export interface WebSocketFrame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
}

export interface ParseFramesResult {
  frames: WebSocketFrame[];
  remaining: Buffer;
}

export class WebSocketManager {
  constructor(options?: WebSocketOptions);
  
  options: Required<WebSocketOptions>;
  connections: Map<string, WebSocketConnection>;
  routes: Map<string, string>;
  stats: Omit<WebSocketStats, 'routes'>;
  
  registerRoute(route: string, handler: string): void;
  
  validateUtf8(buffer: Buffer): string | null;
  
  isOriginAllowed(origin: string | undefined): boolean;
  
  handleUpgrade(
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
    server: any,
    apiPrefix: string
  ): Promise<boolean>;
  
  createWebSocketConnection(
    socket: Socket,
    req: IncomingMessage,
    params: Record<string, string>
  ): WebSocketConnection;
  
  generateAcceptKey(key: string): string;
  
  createFrame(payload: string | Buffer, opcode?: number): Buffer;
  
  createCloseFrame(code: number, reason: string): Buffer;
  
  createPingFrame(): Buffer;
  
  createPongFrame(payload?: string | Buffer): Buffer;
  
  parseFrames(buffer: Buffer): ParseFramesResult;
  
  matchRoute(route: string, pathname: string): { params: Record<string, string> } | null;
  
  getStats(): WebSocketStats;
  
  broadcast(data: string | object, filter?: ((ws: WebSocketConnection) => boolean) | null): void;
  
  closeAll(code?: number, reason?: string): void;
}

export type WebSocketHandler = (
  ws: WebSocketConnection,
  req: IncomingMessage
) => void | Promise<void>;
