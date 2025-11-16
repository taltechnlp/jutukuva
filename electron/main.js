import { app, BrowserWindow, ipcMain, desktopCapturer, protocol, net } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';
import { initDatabase, closeDatabase, dbOperations } from './database.js';
import {
	initBroadcastServer,
	stopBroadcastServer,
	broadcastSubtitle,
	broadcastSessionStart,
	broadcastSessionEnd,
	getBroadcastServerStatus,
	getConnectedClientsCount
} from './broadcast-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;

// Register custom app:// protocol before app is ready
protocol.registerSchemesAsPrivileged([
	{
		scheme: 'app',
		privileges: {
			secure: true,
			standard: true,
			supportFetchAPI: true,
			corsEnabled: true,
			stream: true
		}
	}
]);

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			webSecurity: false // Disable web security to allow fetch from app:// protocol
		}
	});

	// Load the app
	if (process.env.NODE_ENV === 'development') {
		mainWindow.loadURL('http://localhost:5173');
		mainWindow.webContents.openDevTools();
	} else {
		// Load from custom app:// protocol
		mainWindow.loadURL('app://./index.html');
	}

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	// Initialize database
	initDatabase();

	// Register app:// protocol handler
	protocol.handle('app', async (request) => {
		const url = request.url.slice('app://'.length);
		// Remove leading './' if present
		const filePath = url.startsWith('./') ? url.slice(2) : url;
		const fullPath = path.normalize(path.join(__dirname, '../build', filePath));

		console.log('[PROTOCOL] Serving:', filePath, '→', fullPath);

		try {
			const data = await readFile(fullPath);

			// Determine content type
			let contentType = 'application/octet-stream';
			const ext = path.extname(fullPath).toLowerCase();
			const mimeTypes = {
				'.html': 'text/html',
				'.js': 'application/javascript',
				'.mjs': 'application/javascript',
				'.css': 'text/css',
				'.json': 'application/json',
				'.png': 'image/png',
				'.jpg': 'image/jpeg',
				'.gif': 'image/gif',
				'.svg': 'image/svg+xml',
				'.ico': 'image/x-icon',
				'.wasm': 'application/wasm',
				'.onnx': 'application/octet-stream'
			};
			contentType = mimeTypes[ext] || contentType;

			return new Response(data, {
				headers: { 'Content-Type': contentType }
			});
		} catch (error) {
			console.error('[PROTOCOL] Error serving file:', error);
			return new Response('File not found', { status: 404 });
		}
	});

	// Initialize broadcast server (disabled)
	// const broadcastPort = dbOperations.getSetting('broadcast_port') || 8082;
	// initBroadcastServer(parseInt(broadcastPort));

	// Set up IPC handlers for database operations
	ipcMain.handle('db:getSetting', async (event, key) => {
		return dbOperations.getSetting(key);
	});

	ipcMain.handle('db:setSetting', async (event, key, value) => {
		return dbOperations.setSetting(key, value);
	});

	ipcMain.handle('db:getAllSettings', async () => {
		return dbOperations.getAllSettings();
	});

	// Set up IPC handlers for transcription sessions
	ipcMain.handle('db:createSession', async (event, id, name, scheduledDate, description) => {
		return dbOperations.createSession(id, name, scheduledDate, description);
	});

	ipcMain.handle('db:updateSession', async (event, id, data) => {
		dbOperations.updateSession(id, data);
		return true;
	});

	ipcMain.handle('db:getSession', async (event, id) => {
		return dbOperations.getSession(id);
	});

	ipcMain.handle('db:getAllSessions', async () => {
		return dbOperations.getAllSessions();
	});

	ipcMain.handle('db:deleteSession', async (event, id) => {
		dbOperations.deleteSession(id);
		return true;
	});

	// Session lifecycle handlers
	ipcMain.handle('db:getSessionsByStatus', async (event, status) => {
		return dbOperations.getSessionsByStatus(status);
	});

	ipcMain.handle('db:getUpcomingSessions', async () => {
		return dbOperations.getUpcomingSessions();
	});

	ipcMain.handle('db:getPastSessions', async () => {
		return dbOperations.getPastSessions();
	});

	ipcMain.handle('db:activateSession', async (event, id) => {
		return dbOperations.activateSession(id);
	});

	ipcMain.handle('db:completeSession', async (event, id) => {
		return dbOperations.completeSession(id);
	});

	ipcMain.handle('db:cancelSession', async (event, id) => {
		return dbOperations.cancelSession(id);
	});

	ipcMain.handle('db:updateSessionStatus', async (event, id, status) => {
		return dbOperations.updateSessionStatus(id, status);
	});

	ipcMain.handle('db:addTranscript', async (event, sessionId, segmentIndex, text, srtText, startTime, endTime) => {
		return dbOperations.addTranscript(sessionId, segmentIndex, text, srtText, startTime, endTime);
	});

	ipcMain.handle('db:getSessionTranscripts', async (event, sessionId) => {
		return dbOperations.getSessionTranscripts(sessionId);
	});

	// Set up IPC handlers for broadcast server
	ipcMain.handle('broadcast:start', async (event, port) => {
		return initBroadcastServer(port);
	});

	ipcMain.handle('broadcast:stop', async () => {
		stopBroadcastServer();
		return true;
	});

	ipcMain.handle('broadcast:subtitle', async (event, subtitle) => {
		broadcastSubtitle(subtitle);
		return true;
	});

	ipcMain.handle('broadcast:sessionStart', async (event, sessionInfo) => {
		broadcastSessionStart(sessionInfo);
		return true;
	});

	ipcMain.handle('broadcast:sessionEnd', async () => {
		broadcastSessionEnd();
		return true;
	});

	ipcMain.handle('broadcast:status', async () => {
		return getBroadcastServerStatus();
	});

	ipcMain.handle('broadcast:clientCount', async () => {
		return getConnectedClientsCount();
	});

	// Set up IPC handlers for audio source management
	ipcMain.handle('audio:getDesktopSources', async () => {
		try {
			const sources = await desktopCapturer.getSources({
				types: ['screen', 'window'],
				thumbnailSize: { width: 0, height: 0 }
			});
			return sources.map((source) => ({
				id: source.id,
				name: source.name,
				thumbnail: null // Don't need thumbnails for audio
			}));
		} catch (error) {
			console.error('Error getting desktop sources:', error);
			return [];
		}
	});

	ipcMain.handle('audio:getPlatform', async () => {
		return process.platform;
	});

	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		// stopBroadcastServer();
		closeDatabase();
		app.quit();
	}
});

app.on('before-quit', () => {
	// stopBroadcastServer();
	closeDatabase();
});
