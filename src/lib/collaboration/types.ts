/**
 * Types for collaborative editing
 */

export type SessionRole = 'host' | 'guest';

export interface SessionInfo {
	code: string;
	role: SessionRole;
	roomName: string;
	serverUrl: string;
	password?: string;
}

export interface Participant {
	clientId: number;
	name: string;
	color: string;
	role: SessionRole;
}

export interface WordApprovalData {
	approved: boolean;
	approvedBy: string; // clientId
	timestamp: number;
}

export interface SessionMetadata {
	hostClientId: number;
}

/**
 * Speaker information for transcription sessions
 */
export interface Speaker {
	id: string;
	name: string;
	color?: string;
	createdBy?: number; // clientId in collaborative mode
	createdAt?: number;
}
