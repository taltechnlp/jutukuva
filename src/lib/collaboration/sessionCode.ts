/**
 * Session code generation and validation utilities
 * Generates 6-character URL-safe codes for collaborative sessions
 */

import { customAlphabet } from 'nanoid';

// Use only uppercase letters and numbers (no ambiguous characters like 0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Create custom nanoid generator
const generateNanoid = customAlphabet(ALPHABET, CODE_LENGTH);

/**
 * Generate a new session code
 * @returns 6-character uppercase alphanumeric code (e.g., "A3F9K2")
 */
export function generateSessionCode(): string {
	return generateNanoid();
}

/**
 * Validate a session code format
 * @param code - Code to validate
 * @returns true if code is valid format
 */
export function isValidSessionCode(code: string): boolean {
	if (!code || code.length !== CODE_LENGTH) {
		return false;
	}

	// Check if all characters are alphanumeric
	return /^[A-Z0-9]+$/.test(code);
}

/**
 * Normalize a session code (trim, uppercase)
 * @param code - Code to normalize
 * @returns Normalized code
 */
export function normalizeSessionCode(code: string): string {
	return code.trim().toUpperCase();
}
