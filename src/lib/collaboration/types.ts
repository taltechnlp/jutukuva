/**
 * Types for collaborative editing
 */

export type SessionRole = 'host' | 'guest';

export interface SessionInfo {
	code: string;
	role: SessionRole;
	roomName: string;
	serverUrl: string;
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
