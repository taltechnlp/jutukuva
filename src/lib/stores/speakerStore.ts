/**
 * Speaker store for solo (non-collaborative) mode
 */

import { writable, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import type { Speaker } from '$lib/collaboration/types';

// Speaker colors for visual distinction
const SPEAKER_COLORS = [
	'#FF6B6B', // Red
	'#4ECDC4', // Teal
	'#45B7D1', // Blue
	'#FFA07A', // Salmon
	'#98D8C8', // Mint
	'#F7DC6F', // Yellow
	'#BB8FCE', // Purple
	'#85C1E2' // Sky blue
];

function getRandomColor(): string {
	return SPEAKER_COLORS[Math.floor(Math.random() * SPEAKER_COLORS.length)];
}

function createSpeakerStore() {
	const { subscribe, set, update } = writable<Speaker[]>([]);

	return {
		subscribe,

		/**
		 * Add a new speaker
		 */
		addSpeaker: (name: string): Speaker => {
			const speaker: Speaker = {
				id: uuidv4(),
				name,
				color: getRandomColor(),
				createdAt: Date.now()
			};
			update((speakers) => [...speakers, speaker]);
			return speaker;
		},

		/**
		 * Update a speaker's properties
		 */
		updateSpeaker: (id: string, updates: Partial<Pick<Speaker, 'name' | 'color'>>): void => {
			update((speakers) => speakers.map((s) => (s.id === id ? { ...s, ...updates } : s)));
		},

		/**
		 * Remove a speaker
		 */
		removeSpeaker: (id: string): void => {
			update((speakers) => speakers.filter((s) => s.id !== id));
		},

		/**
		 * Get a speaker by ID
		 */
		getSpeaker: (id: string): Speaker | undefined => {
			const speakers = get({ subscribe });
			return speakers.find((s) => s.id === id);
		},

		/**
		 * Get all speakers
		 */
		getSpeakers: (): Speaker[] => {
			return get({ subscribe });
		},

		/**
		 * Initialize speakers from database
		 */
		initFromDb: (speakers: Speaker[]): void => {
			set(speakers);
		},

		/**
		 * Reset the store
		 */
		reset: (): void => {
			set([]);
		}
	};
}

export const speakerStore = createSpeakerStore();
