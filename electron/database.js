import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export function initDatabase() {
	const userDataPath = app.getPath('userData');
	const dbPath = path.join(userDataPath, 'database.sqlite');

	db = new Database(dbPath);
	db.pragma('journal_mode = WAL');

	// Create settings table
	db.exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	// Create transcription sessions table
	db.exec(`
		CREATE TABLE IF NOT EXISTS transcription_sessions (
			id TEXT PRIMARY KEY,
			name TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			duration_seconds INTEGER DEFAULT 0,
			word_count INTEGER DEFAULT 0,
			subtitle_count INTEGER DEFAULT 0,
			status TEXT DEFAULT 'active',
			is_collaborative INTEGER DEFAULT 0,
			session_code TEXT,
			collaboration_role TEXT,
			participants TEXT,
			scheduled_date DATETIME,
			completed_at DATETIME,
			cancelled_at DATETIME
		)
	`);

	// Run migrations to add new columns if they don't exist
	// Add older columns that might be missing from pre-existing databases
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN is_collaborative INTEGER DEFAULT 0');
	} catch (e) {
		// Column already exists
	}
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN session_code TEXT');
	} catch (e) {
		// Column already exists
	}
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN collaboration_role TEXT');
	} catch (e) {
		// Column already exists
	}
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN participants TEXT');
	} catch (e) {
		// Column already exists
	}

	// Add new session management columns
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN scheduled_date DATETIME');
	} catch (e) {
		// Column already exists
	}
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN completed_at DATETIME');
	} catch (e) {
		// Column already exists
	}
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN cancelled_at DATETIME');
	} catch (e) {
		// Column already exists
	}

	// Add speakers column for session speaker management
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN speakers TEXT');
	} catch (e) {
		// Column already exists
	}

	// Add editor_state column for periodic editor state persistence
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN editor_state TEXT');
	} catch (e) {
		// Column already exists
	}

	// Add session_password column for optional password protection
	try {
		db.exec('ALTER TABLE transcription_sessions ADD COLUMN session_password TEXT');
	} catch (e) {
		// Column already exists
	}

	// Create indexes for better query performance
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_sessions_status
		ON transcription_sessions(status)
	`);
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_sessions_scheduled
		ON transcription_sessions(scheduled_date)
	`);

	// Create autocomplete dictionaries table
	db.exec(`
		CREATE TABLE IF NOT EXISTS autocomplete_dictionaries (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			is_active INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	// Create autocomplete entries table
	db.exec(`
		CREATE TABLE IF NOT EXISTS autocomplete_entries (
			id TEXT PRIMARY KEY,
			dictionary_id TEXT NOT NULL,
			trigger TEXT NOT NULL,
			replacement TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (dictionary_id) REFERENCES autocomplete_dictionaries(id) ON DELETE CASCADE
		)
	`);

	// Add is_builtin column to autocomplete_dictionaries
	try {
		db.exec('ALTER TABLE autocomplete_dictionaries ADD COLUMN is_builtin INTEGER DEFAULT 0');
	} catch (e) {
		// Column already exists
	}

	// Create indexes for autocomplete
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_entries_dictionary
		ON autocomplete_entries(dictionary_id)
	`);
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_entries_trigger
		ON autocomplete_entries(trigger COLLATE NOCASE)
	`);

	// Create transcripts table (stores the actual text and subtitles)
	db.exec(`
		CREATE TABLE IF NOT EXISTS transcripts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			segment_index INTEGER NOT NULL,
			text TEXT NOT NULL,
			srt_text TEXT,
			start_time REAL,
			end_time REAL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES transcription_sessions(id)
		)
	`);

	// Create index for faster queries
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_transcripts_session
		ON transcripts(session_id, segment_index)
	`);

	console.log('Database initialized at:', dbPath);

	return db;
}

export function getDatabase() {
	if (!db) {
		throw new Error('Database not initialized. Call initDatabase() first.');
	}
	return db;
}

export function closeDatabase() {
	if (db) {
		db.close();
		db = null;
	}
}

// Database operations
export const dbOperations = {
	// Settings operations
	getSetting: (key) => {
		const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
		const row = stmt.get(key);
		return row ? row.value : null;
	},

	setSetting: (key, value) => {
		const stmt = db.prepare(`
			INSERT INTO settings (key, value)
			VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
		`);
		stmt.run(key, value, value);
	},

	getAllSettings: () => {
		const stmt = db.prepare('SELECT key, value FROM settings');
		return stmt.all();
	},

	// Transcription session operations
	createSession: (id, name, scheduledDate = null, description = null) => {
		const stmt = db.prepare(`
			INSERT INTO transcription_sessions (id, name, scheduled_date, status, is_collaborative, session_code)
			VALUES (?, ?, ?, ?, ?, ?)
		`);
		const status = scheduledDate ? 'planned' : 'active';
		const isCollaborative = 1; // New sessions are collaborative by default
		const sessionCode = id; // Use ID as session code for simplicity
		stmt.run(id, name, scheduledDate, status, isCollaborative, sessionCode);
		return id;
	},

	updateSession: (id, data) => {
		const fields = [];
		const values = [];

		if (data.name !== undefined) {
			fields.push('name = ?');
			values.push(data.name);
		}
		if (data.duration_seconds !== undefined) {
			fields.push('duration_seconds = ?');
			values.push(data.duration_seconds);
		}
		if (data.word_count !== undefined) {
			fields.push('word_count = ?');
			values.push(data.word_count);
		}
		if (data.subtitle_count !== undefined) {
			fields.push('subtitle_count = ?');
			values.push(data.subtitle_count);
		}
		if (data.status !== undefined) {
			fields.push('status = ?');
			values.push(data.status);
		}
		if (data.scheduled_date !== undefined) {
			fields.push('scheduled_date = ?');
			values.push(data.scheduled_date);
		}
		if (data.completed_at !== undefined) {
			fields.push('completed_at = ?');
			values.push(data.completed_at);
		}
		if (data.cancelled_at !== undefined) {
			fields.push('cancelled_at = ?');
			values.push(data.cancelled_at);
		}
		if (data.session_code !== undefined) {
			fields.push('session_code = ?');
			values.push(data.session_code);
		}
		if (data.collaboration_role !== undefined) {
			fields.push('collaboration_role = ?');
			values.push(data.collaboration_role);
		}
		if (data.participants !== undefined) {
			fields.push('participants = ?');
			values.push(data.participants);
		}
		if (data.session_password !== undefined) {
			fields.push('session_password = ?');
			values.push(data.session_password);
		}

		if (fields.length > 0) {
			fields.push('updated_at = CURRENT_TIMESTAMP');
			values.push(id);
			const stmt = db.prepare(`
				UPDATE transcription_sessions
				SET ${fields.join(', ')}
				WHERE id = ?
			`);
			stmt.run(...values);
		}
	},

	getSession: (id) => {
		const stmt = db.prepare('SELECT * FROM transcription_sessions WHERE id = ?');
		return stmt.get(id);
	},

	getAllSessions: () => {
		const stmt = db.prepare('SELECT * FROM transcription_sessions ORDER BY created_at DESC');
		return stmt.all();
	},

	deleteSession: (id) => {
		// Delete transcripts first
		const deleteTranscripts = db.prepare('DELETE FROM transcripts WHERE session_id = ?');
		deleteTranscripts.run(id);

		// Then delete session
		const deleteSession = db.prepare('DELETE FROM transcription_sessions WHERE id = ?');
		deleteSession.run(id);
	},

	// Session lifecycle operations
	getSessionsByStatus: (status) => {
		const stmt = db.prepare('SELECT * FROM transcription_sessions WHERE status = ? ORDER BY scheduled_date DESC, created_at DESC');
		return stmt.all(status);
	},

	getUpcomingSessions: () => {
		const stmt = db.prepare(`
			SELECT * FROM transcription_sessions
			WHERE status = 'planned' AND scheduled_date >= datetime('now')
			ORDER BY scheduled_date ASC
		`);
		return stmt.all();
	},

	getPastSessions: () => {
		const stmt = db.prepare(`
			SELECT * FROM transcription_sessions
			WHERE status IN ('completed', 'cancelled') OR (status = 'planned' AND scheduled_date < datetime('now'))
			ORDER BY scheduled_date DESC, created_at DESC
		`);
		return stmt.all();
	},

	activateSession: (id) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET status = 'active', updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(id);
		return db.prepare('SELECT * FROM transcription_sessions WHERE id = ?').get(id);
	},

	completeSession: (id) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(id);
		return db.prepare('SELECT * FROM transcription_sessions WHERE id = ?').get(id);
	},

	cancelSession: (id) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(id);
		return db.prepare('SELECT * FROM transcription_sessions WHERE id = ?').get(id);
	},

	updateSessionStatus: (id, status) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET status = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(status, id);
		return db.prepare('SELECT * FROM transcription_sessions WHERE id = ?').get(id);
	},

	// Transcript operations
	addTranscript: (sessionId, segmentIndex, text, srtText, startTime, endTime) => {
		const stmt = db.prepare(`
			INSERT INTO transcripts (session_id, segment_index, text, srt_text, start_time, end_time)
			VALUES (?, ?, ?, ?, ?, ?)
		`);
		const result = stmt.run(sessionId, segmentIndex, text, srtText, startTime, endTime);
		return result.lastInsertRowid;
	},

	getSessionTranscripts: (sessionId) => {
		const stmt = db.prepare('SELECT * FROM transcripts WHERE session_id = ? ORDER BY segment_index');
		return stmt.all(sessionId);
	},

	getSessionTranscriptsCount: (sessionId) => {
		const stmt = db.prepare('SELECT COUNT(*) as count FROM transcripts WHERE session_id = ?');
		const row = stmt.get(sessionId);
		return row ? row.count : 0;
	},

	// Autocomplete dictionary operations
	createDictionary: (id, name, isActive = 1) => {
		const stmt = db.prepare(`
			INSERT INTO autocomplete_dictionaries (id, name, is_active)
			VALUES (?, ?, ?)
		`);
		stmt.run(id, name, isActive);
		return db.prepare('SELECT * FROM autocomplete_dictionaries WHERE id = ?').get(id);
	},

	getDictionary: (id) => {
		const stmt = db.prepare('SELECT * FROM autocomplete_dictionaries WHERE id = ?');
		return stmt.get(id);
	},

	getAllDictionaries: () => {
		const stmt = db.prepare('SELECT * FROM autocomplete_dictionaries ORDER BY created_at DESC');
		return stmt.all();
	},

	updateDictionary: (id, data) => {
		const fields = [];
		const values = [];

		if (data.name !== undefined) {
			fields.push('name = ?');
			values.push(data.name);
		}
		if (data.is_active !== undefined) {
			fields.push('is_active = ?');
			values.push(data.is_active);
		}

		if (fields.length > 0) {
			fields.push('updated_at = CURRENT_TIMESTAMP');
			values.push(id);
			const stmt = db.prepare(`
				UPDATE autocomplete_dictionaries
				SET ${fields.join(', ')}
				WHERE id = ?
			`);
			stmt.run(...values);
		}
		return db.prepare('SELECT * FROM autocomplete_dictionaries WHERE id = ?').get(id);
	},

	deleteDictionary: (id) => {
		// Check if dictionary is built-in
		const dict = db.prepare('SELECT is_builtin FROM autocomplete_dictionaries WHERE id = ?').get(id);
		if (dict && dict.is_builtin === 1) {
			throw new Error('Cannot delete built-in dictionary');
		}
		// Entries will be deleted automatically due to CASCADE
		const stmt = db.prepare('DELETE FROM autocomplete_dictionaries WHERE id = ?');
		stmt.run(id);
	},

	// Autocomplete entry operations
	createEntry: (id, dictionaryId, trigger, replacement) => {
		const stmt = db.prepare(`
			INSERT INTO autocomplete_entries (id, dictionary_id, trigger, replacement)
			VALUES (?, ?, ?, ?)
		`);
		stmt.run(id, dictionaryId, trigger, replacement);
		return db.prepare('SELECT * FROM autocomplete_entries WHERE id = ?').get(id);
	},

	getEntry: (id) => {
		const stmt = db.prepare('SELECT * FROM autocomplete_entries WHERE id = ?');
		return stmt.get(id);
	},

	getDictionaryEntries: (dictionaryId) => {
		const stmt = db.prepare('SELECT * FROM autocomplete_entries WHERE dictionary_id = ? ORDER BY trigger');
		return stmt.all(dictionaryId);
	},

	updateEntry: (id, data) => {
		const fields = [];
		const values = [];

		if (data.trigger !== undefined) {
			fields.push('trigger = ?');
			values.push(data.trigger);
		}
		if (data.replacement !== undefined) {
			fields.push('replacement = ?');
			values.push(data.replacement);
		}

		if (fields.length > 0) {
			values.push(id);
			const stmt = db.prepare(`
				UPDATE autocomplete_entries
				SET ${fields.join(', ')}
				WHERE id = ?
			`);
			stmt.run(...values);
		}
		return db.prepare('SELECT * FROM autocomplete_entries WHERE id = ?').get(id);
	},

	deleteEntry: (id) => {
		const stmt = db.prepare('DELETE FROM autocomplete_entries WHERE id = ?');
		stmt.run(id);
	},

	// Get all entries from active dictionaries (for the editor)
	getActiveEntries: () => {
		const stmt = db.prepare(`
			SELECT e.id, e.trigger, e.replacement, e.dictionary_id, d.name as dictionary_name
			FROM autocomplete_entries e
			INNER JOIN autocomplete_dictionaries d ON e.dictionary_id = d.id
			WHERE d.is_active = 1
			ORDER BY LENGTH(e.trigger) DESC, e.trigger
		`);
		return stmt.all();
	},

	// Export dictionary to simplified format
	exportDictionary: (id) => {
		const dict = db.prepare('SELECT * FROM autocomplete_dictionaries WHERE id = ?').get(id);
		if (!dict) {
			throw new Error('Dictionary not found');
		}

		const entries = db.prepare('SELECT trigger, replacement FROM autocomplete_entries WHERE dictionary_id = ? ORDER BY trigger').all(id);

		// Convert array of entries to object format
		const entriesObj = {};
		for (const entry of entries) {
			entriesObj[entry.trigger] = entry.replacement;
		}

		return {
			name: dict.name,
			entries: entriesObj
		};
	},

	// Import dictionary from simplified format
	importDictionary: (name, entries) => {
		const id = crypto.randomUUID();

		// Create the dictionary
		const createDict = db.prepare(`
			INSERT INTO autocomplete_dictionaries (id, name, is_active, is_builtin)
			VALUES (?, ?, 1, 0)
		`);
		createDict.run(id, name);

		// Bulk insert entries using a transaction
		const insertEntry = db.prepare(`
			INSERT INTO autocomplete_entries (id, dictionary_id, trigger, replacement)
			VALUES (?, ?, ?, ?)
		`);

		const insertMany = db.transaction((entries) => {
			let count = 0;
			for (const [trigger, replacement] of Object.entries(entries)) {
				const entryId = crypto.randomUUID();
				insertEntry.run(entryId, id, trigger, replacement);
				count++;
			}
			return count;
		});

		insertMany(entries);

		return db.prepare('SELECT * FROM autocomplete_dictionaries WHERE id = ?').get(id);
	},

	// Speaker operations
	getSessionSpeakers: (sessionId) => {
		const stmt = db.prepare('SELECT speakers FROM transcription_sessions WHERE id = ?');
		const row = stmt.get(sessionId);
		if (row && row.speakers) {
			try {
				return JSON.parse(row.speakers);
			} catch (e) {
				return [];
			}
		}
		return [];
	},

	setSessionSpeakers: (sessionId, speakers) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET speakers = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(JSON.stringify(speakers), sessionId);
	},

	// Editor state persistence operations
	saveEditorState: (sessionId, editorState) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET editor_state = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(editorState, sessionId);
	},

	getEditorState: (sessionId) => {
		const stmt = db.prepare('SELECT editor_state FROM transcription_sessions WHERE id = ?');
		const row = stmt.get(sessionId);
		return row?.editor_state || null;
	},

	clearEditorState: (sessionId) => {
		const stmt = db.prepare(`
			UPDATE transcription_sessions
			SET editor_state = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);
		stmt.run(sessionId);
	},

	// End session with optional content deletion
	endSession: (id, deleteContent = false) => {
		if (deleteContent) {
			// Delete transcripts
			db.prepare('DELETE FROM transcripts WHERE session_id = ?').run(id);

			// Clear speakers and editor state
			db.prepare(`
				UPDATE transcription_sessions
				SET speakers = NULL, editor_state = NULL,
					status = 'completed', completed_at = CURRENT_TIMESTAMP,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`).run(id);
		} else {
			// Just mark as completed, keep content
			db.prepare(`
				UPDATE transcription_sessions
				SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`).run(id);
		}
		return db.prepare('SELECT * FROM transcription_sessions WHERE id = ?').get(id);
	}
};
