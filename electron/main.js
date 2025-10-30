import { app, BrowserWindow, ipcMain, desktopCapturer, protocol } from 'electron';
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

// Register custom protocol before app is ready
protocol.registerSchemesAsPrivileged([
	{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});

	// Load the app
	if (process.env.NODE_ENV === 'development') {
		mainWindow.loadURL('http://localhost:5173');
		mainWindow.webContents.openDevTools();
	} else {
		// Use custom app:// protocol
		mainWindow.loadURL('app://./index.html');
	}

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	// Initialize database
	initDatabase();

	// Register protocol handler for serving app files
	protocol.handle('app', async (request) => {
		let url = request.url.slice('app://'.length);

		// Remove leading './' or '/' if present
		if (url.startsWith('./')) {
			url = url.slice(2);
		} else if (url.startsWith('/')) {
			url = url.slice(1);
		}

		// If empty, serve index.html
		if (!url || url === '') {
			url = 'index.html';
		}

		const fullPath = path.normalize(path.join(__dirname, '../build', url));

		try {
			const data = await readFile(fullPath);

			// Determine MIME type
			const ext = path.extname(fullPath).toLowerCase();
			const mimeTypes = {
				'.html': 'text/html',
				'.js': 'text/javascript',
				'.css': 'text/css',
				'.json': 'application/json',
				'.png': 'image/png',
				'.jpg': 'image/jpeg',
				'.svg': 'image/svg+xml',
				'.wasm': 'application/wasm',
				'.onnx': 'application/octet-stream'
			};

			const contentType = mimeTypes[ext] || 'application/octet-stream';

			return new Response(data, {
				headers: { 'Content-Type': contentType }
			});
		} catch (error) {
			console.error('[PROTOCOL] Error loading file:', fullPath, error.message);
			return new Response('File not found: ' + url, { status: 404 });
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
	ipcMain.handle('db:createSession', async (event, id, name) => {
		return dbOperations.createSession(id, name);
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
