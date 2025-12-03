#!/usr/bin/env node

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { parse } from 'url';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import express from 'express';

const PORT = process.env.PORT || 1234;
const HOST = process.env.HOST || '127.0.0.1';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

// Session tracking
const activeSessions = new Map(); // roomName -> { createdAt, connections, metadata }
const docs = new Map(); // roomName -> Y.Doc
const awarenessInstances = new Map(); // roomName -> Awareness

// Message types
const messageSync = 0;
const messageAwareness = 1;

// Get or create Yjs document for a room
const getYDoc = (roomName) => {
	if (!docs.has(roomName)) {
		const doc = new Y.Doc();
		docs.set(roomName, doc);
	}
	return docs.get(roomName);
};

// Get or create Awareness instance for a room
const getAwareness = (roomName) => {
	if (!awarenessInstances.has(roomName)) {
		const doc = getYDoc(roomName);
		const awareness = new awarenessProtocol.Awareness(doc);
		awarenessInstances.set(roomName, awareness);
	}
	return awarenessInstances.get(roomName);
};

// Setup WebSocket connection for Yjs
const setupWSConnection = (conn, req, roomName) => {
	const doc = getYDoc(roomName);
	const awareness = getAwareness(roomName);

	conn.binaryType = 'arraybuffer';

	// Send sync step 1
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, messageSync);
	syncProtocol.writeSyncStep1(encoder, doc);
	conn.send(encoding.toUint8Array(encoder));

	const awarenessStates = awareness.getStates();
	if (awarenessStates.size > 0) {
		const encoder = encoding.createEncoder();
		encoding.writeVarUint(encoder, messageAwareness);
		encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())));
		conn.send(encoding.toUint8Array(encoder));
	}

	// Handle incoming messages
	const messageListener = (message) => {
		try {
			const uint8Array = new Uint8Array(message);
			const decoder = decoding.createDecoder(uint8Array);
			const messageType = decoding.readVarUint(decoder);

			switch (messageType) {
				case messageSync: {
					console.log(`[${new Date().toISOString()}] [${roomName}] Received sync message, size: ${uint8Array.length}`);
				const docSize = doc.store.clients.size;
				const docUpdates = Y.encodeStateAsUpdate(doc);
				console.log(`[${new Date().toISOString()}] [${roomName}] Doc state before sync: clients=${docSize}, updateSize=${docUpdates.length}`);
					const encoder = encoding.createEncoder();
					encoding.writeVarUint(encoder, messageSync);
					syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
					const responseSize = encoding.length(encoder);
					console.log(`[${new Date().toISOString()}] [${roomName}] Sync response encoded: size=${responseSize}`);
					if (responseSize > 1) {
						console.log(`[${new Date().toISOString()}] [${roomName}] Sending sync response, size: ${responseSize}`);
						conn.send(encoding.toUint8Array(encoder));
					} else {
						console.log(`[${new Date().toISOString()}] [${roomName}] No sync response needed (client is up to date)`);
					}
					break;
				}
				case messageAwareness:
					console.log(`[${new Date().toISOString()}] [${roomName}] Received awareness update`);
					awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), conn);
					break;
			}
		} catch (err) {
			console.error('[ERROR] Message handling error:', err);
		}
	};

	// Broadcast awareness and document updates
	const broadcastMessage = (update, origin) => {
		if (origin !== conn) {
			conn.send(update);
		}
	};

	doc.on('update', (update, origin) => {
		console.log(`[${new Date().toISOString()}] [${roomName}] Document updated, broadcasting to other clients`);
		const encoder = encoding.createEncoder();
		encoding.writeVarUint(encoder, messageSync);
		syncProtocol.writeUpdate(encoder, update);
		const message = encoding.toUint8Array(encoder);

		// Broadcast to all clients in this room
		wss.clients.forEach(client => {
			if (client !== conn && client.readyState === 1 && client._roomName === roomName) {
				console.log(`[${new Date().toISOString()}] [${roomName}] Broadcasting update to client`);
				client.send(message);
			}
		});
	});

	awareness.on('update', ({ added, updated, removed }, origin) => {
		const changedClients = added.concat(updated).concat(removed);
		console.log(`[${new Date().toISOString()}] [${roomName}] Awareness updated, broadcasting to other clients`);
		const encoder = encoding.createEncoder();
		encoding.writeVarUint(encoder, messageAwareness);
		encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
		const message = encoding.toUint8Array(encoder);

		// Broadcast to all clients in this room
		wss.clients.forEach(client => {
			if (client !== conn && client.readyState === 1 && client._roomName === roomName) {
				client.send(message);
			}
		});
	});

	// Store client ID for cleanup
	let clientID = null;
	awareness.on('update', ({ added }) => {
		if (added.length > 0 && clientID === null) {
			clientID = added[0];
		}
	});

	conn.on('message', messageListener);

	conn.on('close', () => {
		doc.off('update', broadcastMessage);
		awareness.off('update', broadcastMessage);
		if (clientID !== null) {
			awarenessProtocol.removeAwarenessStates(awareness, [clientID], 'disconnect');
		}
	});
};

// Create Express app
const app = express();

// Add CORS middleware
app.use((req, res, next) => {
	const origin = req.headers.origin;
	if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin || '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	}

	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	next();
});

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({
		status: 'healthy',
		activeSessions: activeSessions.size,
		totalConnections: Array.from(activeSessions.values())
			.reduce((sum, session) => sum + session.connections, 0)
	});
});

// Stats endpoint
app.get('/stats', (req, res) => {
	const stats = Array.from(activeSessions.entries()).map(([roomName, session]) => ({
		roomName,
		connections: session.connections,
		createdAt: session.createdAt
	}));
	res.json(stats);
});

// Try to load SvelteKit handler (optional - only in production with built app)
let svelteKitHandler;
try {
	const { handler } = await import('../web-viewer/build/handler.js');
	svelteKitHandler = handler;
	console.log('[INFO] SvelteKit handler loaded - serving web viewer');
} catch (error) {
	console.log('[INFO] SvelteKit handler not found - WebSocket only mode');
	console.log('[DEBUG] Import error:', error.message);
	console.log('[INFO] To enable web viewer: cd packages/web-viewer && npm run build');

	// Fallback: Simple status page
	app.get('*', (req, res) => {
		res.send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Jutukuva Server</title>
				<meta charset="utf-8">
				<style>
					body { font-family: system-ui; max-width: 600px; margin: 100px auto; padding: 20px; }
					pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
				</style>
			</head>
			<body>
				<h1>Jutukuva WebSocket Server</h1>
				<p>Server is running. Web viewer not built yet.</p>
				<h2>Endpoints:</h2>
				<ul>
					<li><a href="/health">/health</a> - Health check</li>
					<li><a href="/stats">/stats</a> - Active sessions</li>
				</ul>
				<h2>To enable web viewer:</h2>
				<pre>cd packages/web-viewer && npm run build</pre>
			</body>
			</html>
		`);
	});
}

// Use SvelteKit handler if available
if (svelteKitHandler) {
	app.use(svelteKitHandler);
}

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({
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
	const parsedUrl = parse(req.url, true);
	const roomName = parsedUrl.pathname?.slice(1) || 'default';

	console.log(`[${new Date().toISOString()}] New connection to room: ${roomName} from ${req.socket.remoteAddress}`);

	// Store room name on the WebSocket connection
	ws._roomName = roomName;

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
	setupWSConnection(ws, req, roomName);

	// Handle disconnection
	ws.on('close', () => {
		const session = activeSessions.get(roomName);
		if (session) {
			session.connections--;
			if (session.connections <= 0) {
				activeSessions.delete(roomName);
				// Clean up document and awareness for this room
				docs.delete(roomName);
				awarenessInstances.delete(roomName);
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
	console.log(`========================================`);
	console.log(`Jutukuva Server`);
	console.log(`========================================`);
	console.log(`HTTP/WS server: http://${HOST}:${PORT}`);
	console.log(`WebSocket URL:  ws://${HOST}:${PORT}`);
	console.log(`Health check:   http://${HOST}:${PORT}/health`);
	console.log(`Stats:          http://${HOST}:${PORT}/stats`);
	if (svelteKitHandler) {
		console.log(`Web Viewer:     http://${HOST}:${PORT}/kk`);
	}
	console.log(`========================================`);
});

// Graceful shutdown
const shutdown = () => {
	console.log('\n[SHUTDOWN] Closing server...');
	wss.close(() => {
		server.close(() => {
			console.log('[SHUTDOWN] Server closed');
			process.exit(0);
		});
	});
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
