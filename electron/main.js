import { app, BrowserWindow, ipcMain, desktopCapturer, protocol, net, systemPreferences, nativeTheme } from 'electron';
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
		backgroundColor: '#1a1a1a', // Dark background that works with both themes
		autoHideMenuBar: true, // Hide menu bar (press Alt to show it)
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

	// Sync native theme with system preferences
	nativeTheme.themeSource = 'system';

	// Listen for theme changes
	nativeTheme.on('updated', () => {
		console.log('Native theme changed:', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
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

	// Set up IPC handlers for autocomplete dictionaries
	ipcMain.handle('db:createDictionary', async (event, id, name, isActive) => {
		return dbOperations.createDictionary(id, name, isActive);
	});

	ipcMain.handle('db:getDictionary', async (event, id) => {
		return dbOperations.getDictionary(id);
	});

	ipcMain.handle('db:getAllDictionaries', async () => {
		return dbOperations.getAllDictionaries();
	});

	ipcMain.handle('db:updateDictionary', async (event, id, data) => {
		return dbOperations.updateDictionary(id, data);
	});

	ipcMain.handle('db:deleteDictionary', async (event, id) => {
		dbOperations.deleteDictionary(id);
		return true;
	});

	ipcMain.handle('db:createEntry', async (event, id, dictionaryId, trigger, replacement) => {
		return dbOperations.createEntry(id, dictionaryId, trigger, replacement);
	});

	ipcMain.handle('db:getEntry', async (event, id) => {
		return dbOperations.getEntry(id);
	});

	ipcMain.handle('db:getDictionaryEntries', async (event, dictionaryId) => {
		return dbOperations.getDictionaryEntries(dictionaryId);
	});

	ipcMain.handle('db:updateEntry', async (event, id, data) => {
		return dbOperations.updateEntry(id, data);
	});

	ipcMain.handle('db:deleteEntry', async (event, id) => {
		dbOperations.deleteEntry(id);
		return true;
	});

	ipcMain.handle('db:getActiveEntries', async () => {
		return dbOperations.getActiveEntries();
	});

	// Speaker operations
	ipcMain.handle('db:getSessionSpeakers', async (event, sessionId) => {
		return dbOperations.getSessionSpeakers(sessionId);
	});

	ipcMain.handle('db:setSessionSpeakers', async (event, sessionId, speakers) => {
		dbOperations.setSessionSpeakers(sessionId, speakers);
		return true;
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
	let screenRecordingPermissionChecked = false;
	let screenRecordingPermissionGranted = false;

	ipcMain.handle('audio:getDesktopSources', async () => {
		try {
			console.log('[Main] Getting desktop sources...');

			// On macOS, check screen recording permission
			if (process.platform === 'darwin') {
				if (!screenRecordingPermissionChecked) {
					const status = systemPreferences.getMediaAccessStatus('screen');
					console.log('[Main] Screen Recording permission status:', status);
					screenRecordingPermissionChecked = true;
					screenRecordingPermissionGranted = (status === 'granted');

					if (!screenRecordingPermissionGranted) {
						console.log('[Main] ⚠️  Screen Recording permission NOT granted!');
						console.log('[Main] Permission status is:', status);
						console.log('[Main] Returning empty array until permission is granted.');
						return [];
					}
				} else if (!screenRecordingPermissionGranted) {
					// Permission already checked and not granted, don't retry
					console.log('[Main] Permission still not granted, returning empty array');
					return [];
				}
			}

			// Try to get sources
			const sources = await desktopCapturer.getSources({
				types: ['screen', 'window'],
				thumbnailSize: { width: 150, height: 150 },
				fetchWindowIcons: false
			});

			console.log('[Main] ✓ Got desktop sources:', sources.length);
			if (sources.length > 0) {
				sources.forEach(s => console.log(`[Main]   - ${s.name}`));
			}

			// If we got sources successfully on macOS, mark permission as granted
			if (process.platform === 'darwin' && sources.length > 0) {
				screenRecordingPermissionGranted = true;
			}

			return sources.map((source) => ({
				id: source.id,
				name: source.name,
				thumbnail: null
			}));
		} catch (error) {
			console.error('[Main] ❌ Error getting desktop sources:', error.message);

			// If error on macOS, mark permission as not granted
			if (process.platform === 'darwin') {
				screenRecordingPermissionGranted = false;
			}

			return [];
		}
	});

	// Add handler to reset permission check (useful after user grants permission)
	ipcMain.handle('audio:resetPermissionCheck', async () => {
		screenRecordingPermissionChecked = false;
		screenRecordingPermissionGranted = false;
		console.log('[Main] Permission check reset - will recheck on next request');
		return { success: true };
	});

	ipcMain.handle('audio:getPlatform', async () => {
		return process.platform;
	});

	ipcMain.handle('audio:openAudioMIDISetup', async () => {
		if (process.platform === 'darwin') {
			try {
				const { exec } = await import('child_process');
				exec('open "/System/Applications/Utilities/Audio MIDI Setup.app"');
				return { success: true };
			} catch (error) {
				console.error('[Main] Error opening Audio MIDI Setup:', error);
				return { success: false, error: error.message };
			}
		}
		return { success: false, error: 'Not supported on this platform' };
	});

	// Download BlackHole installer
	ipcMain.handle('audio:downloadBlackHole', async (event) => {
		if (process.platform !== 'darwin') {
			return { success: false, error: 'Not supported on this platform' };
		}

		try {
			const { app } = await import('electron');
			const os = await import('os');
			const fs = await import('fs');
			const https = await import('https');

			// Try to find the latest BlackHole release
			// Using the v0.6.1 release as fallback
			const downloadUrl = 'https://github.com/ExistentialAudio/BlackHole/releases/download/v0.6.1/BlackHole2ch.v0.6.1.pkg';
			const downloadsPath = app.getPath('downloads');
			const fileName = 'BlackHole2ch.pkg';
			const filePath = `${downloadsPath}/${fileName}`;

			console.log('[Main] Downloading BlackHole to:', filePath);

			return new Promise((resolve, reject) => {
				const file = fs.createWriteStream(filePath);

				https.get(downloadUrl, (response) => {
					// Check for redirect or error
					if (response.statusCode === 302 || response.statusCode === 301) {
						// Follow redirect
						const redirectUrl = response.headers.location;
						console.log('[Main] Following redirect to:', redirectUrl);
						https.get(redirectUrl, (redirectResponse) => {
							const totalSize = parseInt(redirectResponse.headers['content-length'], 10);
							let downloadedSize = 0;

							redirectResponse.pipe(file);

							redirectResponse.on('data', (chunk) => {
								downloadedSize += chunk.length;
								const progress = totalSize ? (downloadedSize / totalSize) * 100 : 0;
								mainWindow?.webContents.send('download-progress', progress);
							});

							file.on('finish', () => {
								file.close();
								console.log('[Main] Download complete');

								// Open the downloaded file
								const { exec } = require('child_process');
								exec(`open "${filePath}"`);

								resolve({ success: true, path: filePath });
							});
						}).on('error', (err) => {
							fs.unlink(filePath, () => {});
							reject({ success: false, error: err.message });
						});
					} else if (response.statusCode === 200) {
						const totalSize = parseInt(response.headers['content-length'], 10);
						let downloadedSize = 0;

						response.pipe(file);

						response.on('data', (chunk) => {
							downloadedSize += chunk.length;
							const progress = totalSize ? (downloadedSize / totalSize) * 100 : 0;
							mainWindow?.webContents.send('download-progress', progress);
						});

						file.on('finish', () => {
							file.close();
							console.log('[Main] Download complete');

							// Open the downloaded file
							const { exec } = require('child_process');
							exec(`open "${filePath}"`);

							resolve({ success: true, path: filePath });
						});
					} else {
						fs.unlink(filePath, () => {});
						reject({ success: false, error: `HTTP ${response.statusCode}` });
					}
				}).on('error', (err) => {
					fs.unlink(filePath, () => {});
					reject({ success: false, error: err.message });
				});

				file.on('error', (err) => {
					fs.unlink(filePath, () => {});
					reject({ success: false, error: err.message });
				});
			});
		} catch (error) {
			console.error('[Main] Error downloading BlackHole:', error);
			return { success: false, error: error.message };
		}
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
