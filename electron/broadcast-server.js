import { WebSocketServer } from 'ws';

let wss = null;
let broadcastPort = 8082;
let isRunning = false;

/**
 * Initialize the WebSocket broadcast server
 * @param {number} port - Port number for the WebSocket server
 * @returns {boolean} - Success status
 */
export function initBroadcastServer(port = 8082) {
	if (isRunning) {
		console.log('Broadcast server already running on port', broadcastPort);
		return true;
	}

	try {
		broadcastPort = port;
		wss = new WebSocketServer({ port: broadcastPort });

		wss.on('connection', (ws) => {
			console.log('New client connected to broadcast server');

			// Send welcome message
			ws.send(JSON.stringify({
				type: 'connected',
				message: 'Connected to Kirikaja subtitle broadcast',
				timestamp: new Date().toISOString()
			}));

			ws.on('close', () => {
				console.log('Client disconnected from broadcast server');
			});

			ws.on('error', (error) => {
				console.error('WebSocket client error:', error);
			});
		});

		wss.on('error', (error) => {
			console.error('Broadcast server error:', error);
			isRunning = false;
		});

		isRunning = true;
		console.log(`Broadcast server started on port ${broadcastPort}`);
		return true;
	} catch (error) {
		console.error('Failed to start broadcast server:', error);
		isRunning = false;
		return false;
	}
}

/**
 * Stop the WebSocket broadcast server
 */
export function stopBroadcastServer() {
	if (!wss || !isRunning) {
		return;
	}

	wss.close(() => {
		console.log('Broadcast server stopped');
	});
	isRunning = false;
	wss = null;
}

/**
 * Broadcast subtitle data to all connected clients
 * @param {Object} subtitle - Subtitle data to broadcast
 */
export function broadcastSubtitle(subtitle) {
	if (!wss || !isRunning) {
		console.warn('Cannot broadcast: server not running');
		return;
	}

	const message = JSON.stringify({
		type: 'subtitle',
		data: subtitle,
		timestamp: new Date().toISOString()
	});

	let clientCount = 0;
	wss.clients.forEach((client) => {
		if (client.readyState === 1) { // WebSocket.OPEN
			client.send(message);
			clientCount++;
		}
	});

	console.log(`Broadcasted subtitle to ${clientCount} clients`);
}

/**
 * Broadcast session start event
 * @param {Object} sessionInfo - Session information
 */
export function broadcastSessionStart(sessionInfo) {
	if (!wss || !isRunning) {
		return;
	}

	const message = JSON.stringify({
		type: 'session_start',
		data: sessionInfo,
		timestamp: new Date().toISOString()
	});

	wss.clients.forEach((client) => {
		if (client.readyState === 1) {
			client.send(message);
		}
	});
}

/**
 * Broadcast session end event
 */
export function broadcastSessionEnd() {
	if (!wss || !isRunning) {
		return;
	}

	const message = JSON.stringify({
		type: 'session_end',
		timestamp: new Date().toISOString()
	});

	wss.clients.forEach((client) => {
		if (client.readyState === 1) {
			client.send(message);
		}
	});
}

/**
 * Get broadcast server status
 * @returns {Object} - Server status information
 */
export function getBroadcastServerStatus() {
	return {
		isRunning,
		port: broadcastPort,
		clientCount: wss ? wss.clients.size : 0
	};
}

/**
 * Get the number of connected clients
 * @returns {number} - Number of connected clients
 */
export function getConnectedClientsCount() {
	if (!wss || !isRunning) {
		return 0;
	}
	return wss.clients.size;
}
