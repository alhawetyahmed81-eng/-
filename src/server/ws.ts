import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyBearerToken, isUserAdmin } from './firebaseAdmin.ts';

interface AuthedSocket extends WebSocket {
  uid?: string;
  isAdmin?: boolean;
  subscribedOrders: Set<string>;
}

const clients = new Set<AuthedSocket>();

export function attachWebSocketServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws: AuthedSocket, req) => {
    ws.subscribedOrders = new Set<string>();
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        const decoded = await verifyBearerToken(`Bearer ${token}`);
        if (decoded) {
          ws.uid = decoded.uid;
          ws.isAdmin = await isUserAdmin(decoded.uid, decoded.email, token);
        }
      }
    } catch {
      // Unauthenticated sockets remain public-only (no private rooms)
    }

    clients.add(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'subscribe_order' && typeof msg.orderId === 'string' && ws.uid) {
          ws.subscribedOrders.add(msg.orderId);
        } else if (msg?.type === 'unsubscribe_order' && typeof msg.orderId === 'string') {
          ws.subscribedOrders.delete(msg.orderId);
        } else if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });
}

export function broadcastToUser(uid: string, event: string, payload: unknown): void {
  const data = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client.uid === uid) {
      client.send(data);
    }
  }
}

export function broadcastToOrder(orderId: string, event: string, payload: unknown): void {
  const data = JSON.stringify({ event, orderId, payload });
  for (const client of clients) {
    if (
      client.readyState === WebSocket.OPEN &&
      client.uid &&
      (client.subscribedOrders.has(orderId) || client.isAdmin)
    ) {
      client.send(data);
    }
  }
}

export function broadcastToAdmins(event: string, payload: unknown): void {
  const data = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client.isAdmin) {
      client.send(data);
    }
  }
}
