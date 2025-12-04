/**
 * Store for managing modal visibility state across components.
 * This allows the navbar in +layout.svelte to control modals
 * that are rendered in +page.svelte.
 */

// Modal visibility state using Svelte 5 runes
let _showSessionsModal = $state(false);
let _showDictionariesModal = $state(false);

export const modalStore = {
	get showSessionsModal() {
		return _showSessionsModal;
	},
	set showSessionsModal(value: boolean) {
		_showSessionsModal = value;
	},
	get showDictionariesModal() {
		return _showDictionariesModal;
	},
	set showDictionariesModal(value: boolean) {
		_showDictionariesModal = value;
	},
	openSessions() {
		_showSessionsModal = true;
	},
	closeSessions() {
		_showSessionsModal = false;
	},
	openDictionaries() {
		_showDictionariesModal = true;
	},
	closeDictionaries() {
		_showDictionariesModal = false;
	}
};
