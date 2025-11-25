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
	getSessionTranscripts: (sessionId) => ipcRenderer.invoke('db:getSessionTranscripts', sessionId),

	// Autocomplete dictionaries
	createDictionary: (id, name, isActive) => ipcRenderer.invoke('db:createDictionary', id, name, isActive),
	getDictionary: (id) => ipcRenderer.invoke('db:getDictionary', id),
	getAllDictionaries: () => ipcRenderer.invoke('db:getAllDictionaries'),
	updateDictionary: (id, data) => ipcRenderer.invoke('db:updateDictionary', id, data),
	deleteDictionary: (id) => ipcRenderer.invoke('db:deleteDictionary', id),

	// Autocomplete entries
	createEntry: (id, dictionaryId, trigger, replacement) => ipcRenderer.invoke('db:createEntry', id, dictionaryId, trigger, replacement),
	getEntry: (id) => ipcRenderer.invoke('db:getEntry', id),
	getDictionaryEntries: (dictionaryId) => ipcRenderer.invoke('db:getDictionaryEntries', dictionaryId),
	updateEntry: (id, data) => ipcRenderer.invoke('db:updateEntry', id, data),
	deleteEntry: (id) => ipcRenderer.invoke('db:deleteEntry', id),
	getActiveEntries: () => ipcRenderer.invoke('db:getActiveEntries'),

	// Dictionary import/export
	exportDictionary: (id) => ipcRenderer.invoke('db:exportDictionary', id),
	importDictionary: (name, entries) => ipcRenderer.invoke('db:importDictionary', name, entries),

	// Speakers
	getSessionSpeakers: (sessionId) => ipcRenderer.invoke('db:getSessionSpeakers', sessionId),
	setSessionSpeakers: (sessionId, speakers) => ipcRenderer.invoke('db:setSessionSpeakers', sessionId, speakers),

	// Editor state persistence
	saveEditorState: (sessionId, editorState) => ipcRenderer.invoke('db:saveEditorState', sessionId, editorState),
	getEditorState: (sessionId) => ipcRenderer.invoke('db:getEditorState', sessionId),
	clearEditorState: (sessionId) => ipcRenderer.invoke('db:clearEditorState', sessionId),

	// End session
	endSession: (id, deleteContent) => ipcRenderer.invoke('db:endSession', id, deleteContent)
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
	getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
	// Deep link handler
	onDeepLinkJoin: (callback) => ipcRenderer.on('deep-link-join', (event, sessionCode) => callback(sessionCode))
});
