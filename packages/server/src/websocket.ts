/**
 * WebSocket Module
 *
 * Provides real-time communication between server, agents, and clients.
 * Replaces HTTP polling for command results and device status updates.
 */

import type { FastifyInstance } from 'fastify';
import { logger } from './config/logger.js';

// WebSocket type (works with both native and ws package)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebSocketLike = any;

// ─── Types ────────────────────────────────────────────────────────

/** Device WebSocket connection metadata */
interface DeviceConnection {
  socket: WebSocketLike;
  deviceId: string;
  connectedAt: Date;
  os?: string;
  capabilities?: string[];
}

/** User WebSocket connection metadata */
interface UserConnection {
  socket: WebSocketLike;
  userId: string;
  connectedAt: Date;
}

/** Incoming WebSocket message from device */
interface DeviceMessage {
  type: 'command:result' | 'device:status' | 'ping';
  commandId?: string;
  userId?: string;
  result?: unknown;
  status?: {
    cpu?: number;
    ram?: number;
    disk?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Outgoing WebSocket message */
interface OutgoingMessage {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

// Connection tracking
const deviceConnections = new Map<string, DeviceConnection>();
const userConnections = new Map<string, Set<UserConnection>>();

/**
 * Setup WebSocket on the Fastify server
 */
export async function setupWebSocket(fastify: FastifyInstance): Promise<void> {
  // Dynamic import to avoid issues if @fastify/websocket is not installed
  try {
    const websocket = await import('@fastify/websocket');
    await fastify.register(websocket.default);

    fastify.get('/ws', { websocket: true }, (socket: WebSocketLike, req) => {
      const query = req.query as { type?: string; id?: string };
      const connType = query.type; // 'device' | 'user' | 'bot'
      const connId = query.id;

      logger.info({ connType, connId }, 'WebSocket connected');

      // Track connection
      if (connType === 'device' && connId) {
        deviceConnections.set(connId, {
          socket,
          deviceId: connId,
          connectedAt: new Date(),
        });
      } else if ((connType === 'user' || connType === 'bot') && connId) {
        if (!userConnections.has(connId)) {
          userConnections.set(connId, new Set());
        }
        userConnections.get(connId)!.add({
          socket,
          userId: connId,
          connectedAt: new Date(),
        });
      }

      // Handle messages from clients
      socket.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as DeviceMessage;
          handleMessage(connType, connId, msg);
        } catch (err) {
          logger.error({ err }, 'Invalid WebSocket message');
        }
      });

      // Handle disconnection
      socket.on('close', () => {
        if (connType === 'device' && connId) {
          deviceConnections.delete(connId);
        } else if (connId) {
          const connections = userConnections.get(connId);
          if (connections) {
            for (const conn of connections) {
              if (conn.socket === socket) {
                connections.delete(conn);
                break;
              }
            }
            if (connections.size === 0) {
              userConnections.delete(connId);
            }
          }
        }
        logger.info({ connType, connId }, 'WebSocket disconnected');
      });

      // Handle errors
      socket.on('error', (err: Error) => {
        logger.error({ err, connType, connId }, 'WebSocket error');
      });

      // Send welcome message
      const welcome: OutgoingMessage = {
        type: 'connected',
        connectionType: connType ?? 'unknown',
        connectionId: connId ?? 'unknown',
        timestamp: new Date().toISOString(),
      };
      socket.send(JSON.stringify(welcome));
    });

    logger.info('WebSocket module registered at /ws');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ error: message }, 'WebSocket module not available (install @fastify/websocket)');
  }
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(
  connType: string | undefined,
  connId: string | undefined,
  msg: DeviceMessage,
): void {
  switch (msg.type) {
    case 'command:result':
      // Agent sent command result -> notify user/bot
      if (msg.userId) {
        notifyUser(msg.userId, {
          type: 'command:completed',
          commandId: msg.commandId,
          result: msg.result,
          timestamp: new Date().toISOString(),
        });
      }
      break;

    case 'device:status':
      // Agent sent status update -> broadcast to admins
      broadcastToUsers({
        type: 'device:status',
        deviceId: connId,
        status: msg.status,
        timestamp: new Date().toISOString(),
      });
      break;

    case 'ping': {
      // Keepalive
      const conn = deviceConnections.get(connId || '');
      if (conn) {
        const pong: OutgoingMessage = { type: 'pong', timestamp: new Date().toISOString() };
        conn.socket.send(JSON.stringify(pong));
      }
      break;
    }

    default:
      logger.debug({ type: msg.type, connType, connId }, 'Unknown WebSocket message type');
  }
}

/**
 * Send message to a specific device
 */
export function sendToDevice(deviceId: string, message: OutgoingMessage): boolean {
  const conn = deviceConnections.get(deviceId);
  if (conn && conn.socket.readyState === 1) { // WebSocket.OPEN
    conn.socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Send message to a specific user (all their connections)
 */
export function notifyUser(userId: string, message: OutgoingMessage): void {
  const connections = userConnections.get(userId);
  if (connections) {
    const data = JSON.stringify(message);
    for (const conn of connections) {
      if (conn.socket.readyState === 1) {
        conn.socket.send(data);
      }
    }
  }
}

/**
 * Broadcast message to all connected users
 */
function broadcastToUsers(message: OutgoingMessage): void {
  const data = JSON.stringify(message);
  for (const [, connections] of userConnections) {
    for (const conn of connections) {
      if (conn.socket.readyState === 1) {
        conn.socket.send(data);
      }
    }
  }
}

/**
 * Get connection statistics
 */
export function getWebSocketStats(): {
  devices: number;
  users: number;
  totalConnections: number;
} {
  let userCount = 0;
  for (const connections of userConnections.values()) {
    userCount += connections.size;
  }

  return {
    devices: deviceConnections.size,
    users: userCount,
    totalConnections: deviceConnections.size + userCount,
  };
}
