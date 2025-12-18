<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import DictionaryEditor from '$lib/components/settings/DictionaryEditor.svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
	}

	let { open = $bindable(false), onClose }: Props = $props();

	// State
	let dictionaries = $state<AutocompleteDictionary[]>([]);
	let selectedDictionary = $state<AutocompleteDictionary | null>(null);
	let showNewDictionaryModal = $state(false);
	let newDictionaryName = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	// Load dictionaries when modal opens
	$effect(() => {
		if (open) {
			loadDictionaries();
		}
	});

	async function loadDictionaries() {
		loading = true;
		error = null;
		try {
			if (typeof window !== 'undefined' && window.db) {
				dictionaries = await window.db.getAllDictionaries();
			}
		} catch (err) {
			console.error('Failed to load dictionaries:', err);
			error = 'Failed to load dictionaries';
		} finally {
			loading = false;
		}
	}

	async function createDictionary() {
		if (!newDictionaryName.trim()) return;

		try {
			const id = crypto.randomUUID();
			await window.db.createDictionary(id, newDictionaryName.trim(), 1);
			await loadDictionaries();
			newDictionaryName = '';
			showNewDictionaryModal = false;
		} catch (err) {
			console.error('Failed to create dictionary:', err);
			error = 'Failed to create dictionary';
		}
	}

	async function toggleActive(dictionary: AutocompleteDictionary) {
		try {
			await window.db.updateDictionary(dictionary.id, {
				is_active: dictionary.is_active === 1 ? 0 : 1
			});
			await loadDictionaries();
		} catch (err) {
			console.error('Failed to toggle dictionary:', err);
			error = 'Failed to update dictionary';
		}
	}

	async function deleteDictionary(dictionary: AutocompleteDictionary) {
		if (!confirm($_('settings.dictionaries.confirmDelete', { default: 'Are you sure you want to delete this dictionary? All entries will be deleted.' }))) {
			return;
		}

		try {
			await window.db.deleteDictionary(dictionary.id);
			await loadDictionaries();
			if (selectedDictionary?.id === dictionary.id) {
				selectedDictionary = null;
			}
		} catch (err) {
			console.error('Failed to delete dictionary:', err);
			error = 'Failed to delete dictionary';
		}
	}

	function selectDictionary(dictionary: AutocompleteDictionary) {
		selectedDictionary = dictionary;
	}

	function closeEditor() {
		selectedDictionary = null;
	}

	async function exportDictionary(dictionary: AutocompleteDictionary) {
		try {
			const data = await window.db.exportDictionary(dictionary.id);
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${dictionary.name.replace(/[^a-z0-9]/gi, '_')}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Failed to export dictionary:', err);
			error = $_('settings.dictionaries.exportError', { default: 'Failed to export dictionary' });
		}
	}

	function triggerImport() {
		fileInput?.click();
	}

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			let name: string;
			let entries: Record<string, string>;

			// Support TextOnTop format: { "shortform": { "<default>": { "shortforms": { ... } } } }
			if (data.shortform && typeof data.shortform === 'object') {
				// TextOnTop format - extract shortforms from the first profile (usually "<default>")
				const profiles = Object.keys(data.shortform);
				if (profiles.length === 0) {
					throw new Error('No shortform profiles found in TextOnTop format');
				}
				const firstProfile = data.shortform[profiles[0]];
				if (!firstProfile?.shortforms || typeof firstProfile.shortforms !== 'object') {
					throw new Error('Invalid TextOnTop shortform structure');
				}
				entries = firstProfile.shortforms;
				// Use filename without extension as dictionary name
				name = file.name.replace(/\.[^/.]+$/, '');
			} else if (data.name && data.entries && typeof data.entries === 'object') {
				// Native format: { "name": "...", "entries": { ... } }
				name = data.name;
				entries = data.entries;
			} else {
				throw new Error('Invalid dictionary format');
			}

			await window.db.importDictionary(name, entries);
			await loadDictionaries();
			error = null;
		} catch (err) {
			console.error('Failed to import dictionary:', err);
			error = $_('settings.dictionaries.importError', { default: 'Failed to import dictionary. Please check the file format.' });
		} finally {
			// Reset file input
			input.value = '';
		}
	}

	function closeModal() {
		open = false;
		onClose?.();
	}

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open && !showNewDictionaryModal) {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<dialog class="modal modal-open">
		<div class="modal-box max-w-6xl w-full max-h-[90vh] overflow-y-auto">
			<!-- Close button -->
			<button
				class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-10"
				onclick={closeModal}
			>
				✕
			</button>

			<div class="mb-6 pr-8">
				<h1 class="text-3xl font-bold mb-2">{$_('settings.dictionaries.title', { default: 'Text Snippet Dictionaries' })}</h1>
				<p class="text-base-content/70">
					{$_('settings.dictionaries.description', {
						default: 'Manage your text snippet dictionaries. Create custom shortcuts that automatically expand as you type.'
					})}
				</p>
			</div>

			{#if error}
				<div class="alert alert-error mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="stroke-current shrink-0 h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Dictionaries List -->
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<div class="flex justify-between items-center mb-4">
							<h2 class="card-title">{$_('settings.dictionaries.myDictionaries', { default: 'My Dictionaries' })}</h2>
							<div class="flex gap-2">
								<button class="btn btn-ghost btn-sm" onclick={triggerImport}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
									</svg>
									{$_('settings.dictionaries.import', { default: 'Import' })}
								</button>
								<button class="btn btn-primary btn-sm" onclick={() => (showNewDictionaryModal = true)}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
									</svg>
									{$_('settings.dictionaries.new', { default: 'New Dictionary' })}
								</button>
							</div>
						</div>
						<input type="file" accept=".json" class="hidden" bind:this={fileInput} onchange={handleImport} />

						{#if loading}
							<div class="flex justify-center py-8">
								<span class="loading loading-spinner loading-lg"></span>
							</div>
						{:else if dictionaries.length === 0}
							<div class="text-center py-8 text-base-content/60">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-16 w-16 mx-auto mb-4 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								<p class="text-lg font-medium mb-2">{$_('settings.dictionaries.noDictionaries', { default: 'No dictionaries yet' })}</p>
								<p class="text-sm">{$_('settings.dictionaries.createFirst', { default: 'Create your first dictionary to get started' })}</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each dictionaries as dictionary}
									<div
										class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
										class:ring-2={selectedDictionary?.id === dictionary.id}
										class:ring-primary={selectedDictionary?.id === dictionary.id}
									>
										<div class="card-body p-4">
											<div class="flex items-center justify-between">
												<button type="button" class="flex-1 text-left" onclick={() => selectDictionary(dictionary)}>
													<div class="flex items-center gap-2">
														<h3 class="font-semibold text-lg">{dictionary.name}</h3>
														{#if dictionary.is_builtin === 1}
															<span class="badge badge-secondary badge-sm">{$_('settings.dictionaries.builtin', { default: 'Built-in' })}</span>
														{/if}
													</div>
													<p class="text-sm text-base-content/60">
														{$_('settings.dictionaries.createdAt', { default: 'Created' })}:
														{new Date(dictionary.created_at).toLocaleDateString()}
													</p>
												</button>
												<div class="flex items-center gap-2">
													<input
														type="checkbox"
														class="toggle toggle-primary"
														checked={dictionary.is_active === 1}
														onchange={() => toggleActive(dictionary)}
													/>
													<button
														class="btn btn-ghost btn-sm btn-square"
														onclick={() => exportDictionary(dictionary)}
														title={$_('settings.dictionaries.export', { default: 'Export' })}
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="h-5 w-5"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
															/>
														</svg>
													</button>
													{#if dictionary.is_builtin !== 1}
														<button
															class="btn btn-ghost btn-sm btn-square"
															onclick={() => deleteDictionary(dictionary)}
															title={$_('settings.dictionaries.delete', { default: 'Delete' })}
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																class="h-5 w-5"
																fill="none"
																viewBox="0 0 24 24"
																stroke="currentColor"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
																/>
															</svg>
														</button>
													{/if}
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Dictionary Editor -->
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						{#if selectedDictionary}
							<DictionaryEditor dictionary={selectedDictionary} onClose={closeEditor} />
						{:else}
							<div class="text-center py-16 text-base-content/60">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-16 w-16 mx-auto mb-4 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
									/>
								</svg>
								<p class="text-lg font-medium">
									{$_('settings.dictionaries.selectDictionary', { default: 'Select a dictionary to manage entries' })}
								</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
		<div class="modal-backdrop bg-black/50" role="presentation" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()}>
			<button type="button" class="sr-only">close</button>
		</div>

		<!-- New Dictionary Modal (nested inside parent modal) -->
		{#if showNewDictionaryModal}
			<dialog class="modal modal-open" style="z-index: 60;">
				<div class="modal-box">
					<h3 class="font-bold text-lg mb-4">{$_('settings.dictionaries.newDictionaryTitle', { default: 'Create New Dictionary' })}</h3>
					<div class="form-control">
						<label class="label" for="dict-name">
							<span class="label-text">{$_('settings.dictionaries.dictionaryName', { default: 'Dictionary Name' })}</span>
						</label>
						<input
							id="dict-name"
							type="text"
							placeholder={$_('settings.dictionaries.namePlaceholder', { default: 'e.g., Medical Terms' })}
							class="input input-bordered w-full"
							bind:value={newDictionaryName}
							onkeydown={(e) => e.key === 'Enter' && createDictionary()}
						/>
					</div>
					<div class="modal-action">
						<button class="btn" onclick={() => (showNewDictionaryModal = false)}>
							{$_('common.cancel', { default: 'Cancel' })}
						</button>
						<button class="btn btn-primary" onclick={createDictionary} disabled={!newDictionaryName.trim()}>
							{$_('settings.dictionaries.create', { default: 'Create' })}
						</button>
					</div>
				</div>
				<div class="modal-backdrop" role="presentation" onclick={() => (showNewDictionaryModal = false)} onkeydown={(e) => e.key === 'Escape' && (showNewDictionaryModal = false)}>
					<button type="button" class="sr-only">close</button>
				</div>
			</dialog>
		{/if}
	</dialog>
{/if}
