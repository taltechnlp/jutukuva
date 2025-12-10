import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import type { AppSettings, OverlaySettings, FontSettings } from '$lib/types/settings';
import { defaultSettings } from '$lib/types/settings';

class SettingsStore {
	settings = $state<AppSettings>(defaultSettings);
	loading = $state(true);
	error = $state<string | null>(null);

	private emitSettingsToOverlay(settings: AppSettings) {
		emitTo('overlay', 'settings-changed', settings).catch(() => {
			// Overlay might not exist, that's ok
		});
	}

	async load() {
		this.loading = true;
		this.error = null;
		try {
			const loaded = await invoke<AppSettings>('get_settings');
			this.settings = loaded;
		} catch (e) {
			console.error('Failed to load settings:', e);
			this.error = String(e);
		} finally {
			this.loading = false;
		}
	}

	async save(settings: Partial<AppSettings>) {
		const merged = { ...this.settings, ...settings };
		this.settings = merged;

		try {
			await invoke('save_settings', { newSettings: merged });
			this.emitSettingsToOverlay(merged);
		} catch (e) {
			console.error('Failed to save settings:', e);
			this.error = String(e);
		}
	}

	async updateOverlay(overlay: Partial<OverlaySettings>) {
		await this.save({
			overlay: { ...this.settings.overlay, ...overlay }
		});
	}

	async updateFont(font: Partial<FontSettings>) {
		await this.save({
			font: { ...this.settings.font, ...font }
		});
	}

	async reset() {
		try {
			const reset = await invoke<AppSettings>('reset_settings');
			this.settings = reset;
			this.emitSettingsToOverlay(reset);
		} catch (e) {
			console.error('Failed to reset settings:', e);
			this.error = String(e);
		}
	}

	async setLastSessionCode(code: string | null) {
		try {
			await invoke('set_last_session_code', { code });
			this.settings.lastSessionCode = code;
		} catch (e) {
			console.error('Failed to save session code:', e);
		}
	}
}

export const settingsStore = new SettingsStore();
