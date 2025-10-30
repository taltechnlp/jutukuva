#!/usr/bin/env node

const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const { setupWSConnection } = require('y-websocket/bin/utils');

const PORT = process.env.PORT || 1234;
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

// Session tracking
const activeSessions = new Map(); // roomName -> { createdAt, connections, metadata }

// Create HTTP server
const server = http.createServer((request, response) => {
  // Add CORS headers
  const origin = request.headers.origin;
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin || '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(200);
    response.end();
    return;
  }

  // Health check endpoint
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      status: 'healthy',
      activeSessions: activeSessions.size,
      totalConnections: Array.from(activeSessions.values())
        .reduce((sum, session) => sum + session.connections, 0)
    }));
    return;
  }

  // Stats endpoint
  if (request.url === '/stats') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    const stats = Array.from(activeSessions.entries()).map(([roomName, session]) => ({
      roomName,
      connections: session.connections,
      createdAt: session.createdAt
    }));
    response.end(JSON.stringify(stats, null, 2));
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Yjs WebSocket Server for ProseMirror Sync\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    // Verify origin if specified
    const origin = info.origin || info.req.headers.origin;
    if (ALLOWED_ORIGINS.includes('*')) {
      return true;
    }
    return ALLOWED_ORIGINS.some(allowed => origin?.includes(allowed));
  }
});

wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const roomName = parsedUrl.pathname?.slice(1) || 'default';

  console.log(`[${new Date().toISOString()}] New connection to room: ${roomName} from ${req.socket.remoteAddress}`);

  // Track session
  if (!activeSessions.has(roomName)) {
    activeSessions.set(roomName, {
      createdAt: new Date().toISOString(),
      connections: 0,
      metadata: {}
    });
  }
  activeSessions.get(roomName).connections++;

  // Setup Yjs connection
  setupWSConnection(ws, req);

  // Handle disconnection
  ws.on('close', () => {
    const session = activeSessions.get(roomName);
    if (session) {
      session.connections--;
      if (session.connections <= 0) {
        activeSessions.delete(roomName);
        console.log(`[${new Date().toISOString()}] Room closed: ${roomName}`);
      }
    }
  });

  console.log(`[${new Date().toISOString()}] Active sessions: ${activeSessions.size}, Total connections: ${Array.from(activeSessions.values()).reduce((sum, s) => sum + s.connections, 0)}`);
});

wss.on('error', (error) => {
  console.error('[ERROR] WebSocket server error:', error);
});

server.listen(PORT, HOST, () => {
  console.log(`Yjs WebSocket server running on ws://${HOST}:${PORT}`);
  console.log(`HTTP server running on http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});
