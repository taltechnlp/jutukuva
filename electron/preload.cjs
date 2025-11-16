const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
	send: (channel, data) => {
		const validChannels = [];
		if (validChannels.includes(channel)) {
			ipcRenderer.send(channel, data);
		}
	},
	receive: (channel, func) => {
		const validChannels = [];
		if (validChannels.includes(channel)) {
			ipcRenderer.on(channel, (event, ...args) => func(...args));
		}
	}
});

// Expose SQLite API
contextBridge.exposeInMainWorld('db', {
	// Settings
	getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
	setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
	getAllSettings: () => ipcRenderer.invoke('db:getAllSettings'),

	// Transcription sessions
	createSession: (id, name, scheduledDate, description) => ipcRenderer.invoke('db:createSession', id, name, scheduledDate, description),
	updateSession: (id, data) => ipcRenderer.invoke('db:updateSession', id, data),
	getSession: (id) => ipcRenderer.invoke('db:getSession', id),
	getAllSessions: () => ipcRenderer.invoke('db:getAllSessions'),
	deleteSession: (id) => ipcRenderer.invoke('db:deleteSession', id),

	// Session lifecycle
	getSessionsByStatus: (status) => ipcRenderer.invoke('db:getSessionsByStatus', status),
	getUpcomingSessions: () => ipcRenderer.invoke('db:getUpcomingSessions'),
	getPastSessions: () => ipcRenderer.invoke('db:getPastSessions'),
	activateSession: (id) => ipcRenderer.invoke('db:activateSession', id),
	completeSession: (id) => ipcRenderer.invoke('db:completeSession', id),
	cancelSession: (id) => ipcRenderer.invoke('db:cancelSession', id),
	updateSessionStatus: (id, status) => ipcRenderer.invoke('db:updateSessionStatus', id, status),

	// Transcripts
	addTranscript: (sessionId, segmentIndex, text, srtText, startTime, endTime) =>
		ipcRenderer.invoke('db:addTranscript', sessionId, segmentIndex, text, srtText, startTime, endTime),
	getSessionTranscripts: (sessionId) => ipcRenderer.invoke('db:getSessionTranscripts', sessionId)
});

// Expose Broadcast API
contextBridge.exposeInMainWorld('broadcast', {
	start: (port) => ipcRenderer.invoke('broadcast:start', port),
	stop: () => ipcRenderer.invoke('broadcast:stop'),
	subtitle: (subtitle) => ipcRenderer.invoke('broadcast:subtitle', subtitle),
	sessionStart: (sessionInfo) => ipcRenderer.invoke('broadcast:sessionStart', sessionInfo),
	sessionEnd: () => ipcRenderer.invoke('broadcast:sessionEnd'),
	status: () => ipcRenderer.invoke('broadcast:status'),
	clientCount: () => ipcRenderer.invoke('broadcast:clientCount')
});

// Expose Audio/System API
contextBridge.exposeInMainWorld('electronAPI', {
	getDesktopSources: () => ipcRenderer.invoke('audio:getDesktopSources'),
	getPlatform: () => ipcRenderer.invoke('audio:getPlatform'),
	openAudioMIDISetup: () => ipcRenderer.invoke('audio:openAudioMIDISetup'),
	resetPermissionCheck: () => ipcRenderer.invoke('audio:resetPermissionCheck'),
	downloadBlackHole: () => ipcRenderer.invoke('audio:downloadBlackHole'),
	onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, progress) => callback(progress)),
	setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
	getSetting: (key) => ipcRenderer.invoke('db:getSetting', key)
});
