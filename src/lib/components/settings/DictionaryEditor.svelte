<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	// Props
	let {
		dictionary,
		onClose = () => {}
	}: {
		dictionary: AutocompleteDictionary;
		onClose?: () => void;
	} = $props();

	// State
	let entries = $state<AutocompleteEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let editingEntry = $state<AutocompleteEntry | null>(null);
	let showAddModal = $state(false);
	let newTrigger = $state('');
	let newReplacement = $state('');
	let searchQuery = $state('');

	// Load entries when dictionary changes
	$effect(() => {
		if (dictionary) {
			loadEntries();
		}
	});

	async function loadEntries() {
		loading = true;
		error = null;
		try {
			if (typeof window !== 'undefined' && window.db) {
				entries = await window.db.getDictionaryEntries(dictionary.id);
			}
		} catch (err) {
			console.error('Failed to load entries:', err);
			error = 'Failed to load entries';
		} finally {
			loading = false;
		}
	}

	async function addEntry() {
		if (!newTrigger.trim() || !newReplacement.trim()) return;

		// Check for duplicate trigger
		const duplicate = entries.find(e => e.trigger.toLowerCase() === newTrigger.trim().toLowerCase());
		if (duplicate) {
			error = $_('settings.dictionaries.duplicateTrigger', { default: 'A snippet with this trigger already exists' });
			return;
		}

		try {
			const id = crypto.randomUUID();
			await window.db.createEntry(id, dictionary.id, newTrigger.trim(), newReplacement.trim());
			await loadEntries();
			newTrigger = '';
			newReplacement = '';
			showAddModal = false;
			error = null;
		} catch (err) {
			console.error('Failed to add entry:', err);
			error = 'Failed to add entry';
		}
	}

	async function updateEntry(entry: AutocompleteEntry) {
		try {
			await window.db.updateEntry(entry.id, {
				trigger: entry.trigger,
				replacement: entry.replacement
			});
			await loadEntries();
			editingEntry = null;
		} catch (err) {
			console.error('Failed to update entry:', err);
			error = 'Failed to update entry';
		}
	}

	async function deleteEntry(entry: AutocompleteEntry) {
		if (!confirm($_('settings.dictionaries.confirmDeleteEntry', { default: 'Delete this entry?' }))) {
			return;
		}

		try {
			await window.db.deleteEntry(entry.id);
			await loadEntries();
		} catch (err) {
			console.error('Failed to delete entry:', err);
			error = 'Failed to delete entry';
		}
	}

	function startEdit(entry: AutocompleteEntry) {
		editingEntry = { ...entry };
	}

	function cancelEdit() {
		editingEntry = null;
	}

	// Filtered entries based on search
	const filteredEntries = $derived(
		searchQuery
			? entries.filter(
					e =>
						e.trigger.toLowerCase().includes(searchQuery.toLowerCase()) ||
						e.replacement.toLowerCase().includes(searchQuery.toLowerCase())
			  )
			: entries
	);
</script>

<div class="flex flex-col h-full">
	<div class="flex justify-between items-center mb-4">
		<div>
			<h2 class="text-xl font-bold">{dictionary.name}</h2>
			<p class="text-sm text-base-content/60">
				{entries.length} {$_('settings.dictionaries.entries', { default: 'entries' })}
			</p>
		</div>
		<button class="btn btn-sm" onclick={onClose}>
			{$_('common.close', { default: 'Close' })}
		</button>
	</div>

	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
			<button class="btn btn-sm btn-ghost" onclick={() => (error = null)}>✕</button>
		</div>
	{/if}

	<!-- Search and Add -->
	<div class="flex gap-2 mb-4">
		<input
			type="text"
			placeholder={$_('settings.dictionaries.searchPlaceholder', { default: 'Search snippets...' })}
			class="input input-bordered flex-1"
			bind:value={searchQuery}
		/>
		<button class="btn btn-primary" onclick={() => (showAddModal = true)}>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			{$_('settings.dictionaries.addEntry', { default: 'Add' })}
		</button>
	</div>

	<!-- Entries List -->
	<div class="flex-1 overflow-auto">
		{#if loading}
			<div class="flex justify-center py-8">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if filteredEntries.length === 0}
			<div class="text-center py-8 text-base-content/60">
				{#if searchQuery}
					<p>{$_('settings.dictionaries.noResults', { default: 'No entries match your search' })}</p>
				{:else}
					<p>{$_('settings.dictionaries.noEntries', { default: 'No entries yet. Add your first snippet!' })}</p>
				{/if}
			</div>
		{:else}
			<div class="space-y-2">
				{#each filteredEntries as entry (entry.id)}
					{#if editingEntry?.id === entry.id}
						<!-- Edit Mode -->
						<div class="card bg-base-200 border-2 border-primary">
							<div class="card-body p-4">
								<div class="grid grid-cols-1 gap-2">
									<div class="form-control">
										<label class="label">
											<span class="label-text text-xs">{$_('settings.dictionaries.trigger', { default: 'Trigger' })}</span>
										</label>
										<input type="text" class="input input-bordered input-sm" bind:value={editingEntry.trigger} />
									</div>
									<div class="form-control">
										<label class="label">
											<span class="label-text text-xs">{$_('settings.dictionaries.replacement', { default: 'Replacement' })}</span>
										</label>
										<input type="text" class="input input-bordered input-sm" bind:value={editingEntry.replacement} />
									</div>
								</div>
								<div class="flex justify-end gap-2 mt-2">
									<button class="btn btn-ghost btn-sm" onclick={cancelEdit}>
										{$_('common.cancel', { default: 'Cancel' })}
									</button>
									<button class="btn btn-primary btn-sm" onclick={() => updateEntry(editingEntry!)}>
										{$_('common.save', { default: 'Save' })}
									</button>
								</div>
							</div>
						</div>
					{:else}
						<!-- View Mode -->
						<div class="card bg-base-200 hover:bg-base-300 transition-colors">
							<div class="card-body p-4">
								<div class="flex items-center justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-2 mb-1">
											<code class="badge badge-primary font-mono">{entry.trigger}</code>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
											</svg>
											<span class="font-medium">{entry.replacement}</span>
										</div>
										<p class="text-xs text-base-content/50">
											{$_('settings.dictionaries.addedOn', { default: 'Added' })}:
											{new Date(entry.created_at).toLocaleDateString()}
										</p>
									</div>
									<div class="flex items-center gap-1">
										<button class="btn btn-ghost btn-sm btn-square" onclick={() => startEdit(entry)} title={$_('common.edit', { default: 'Edit' })}>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
												/>
											</svg>
										</button>
										<button
											class="btn btn-ghost btn-sm btn-square"
											onclick={() => deleteEntry(entry)}
											title={$_('common.delete', { default: 'Delete' })}
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										</button>
									</div>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Add Entry Modal -->
{#if showAddModal}
	<dialog class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">{$_('settings.dictionaries.addNewEntry', { default: 'Add New Snippet' })}</h3>

			{#if error}
				<div class="alert alert-error mb-4">
					<span>{error}</span>
				</div>
			{/if}

			<div class="space-y-4">
				<div class="form-control">
					<label class="label" for="new-trigger">
						<span class="label-text">{$_('settings.dictionaries.trigger', { default: 'Trigger' })}</span>
					</label>
					<input
						id="new-trigger"
						type="text"
						placeholder={$_('settings.dictionaries.triggerPlaceholder', { default: 'e.g., amb' })}
						class="input input-bordered w-full"
						bind:value={newTrigger}
					/>
					<label class="label">
						<span class="label-text-alt">{$_('settings.dictionaries.triggerHelp', { default: 'The text you type to trigger the replacement' })}</span>
					</label>
				</div>
				<div class="form-control">
					<label class="label" for="new-replacement">
						<span class="label-text">{$_('settings.dictionaries.replacement', { default: 'Replacement' })}</span>
					</label>
					<input
						id="new-replacement"
						type="text"
						placeholder={$_('settings.dictionaries.replacementPlaceholder', { default: 'e.g., ambulance' })}
						class="input input-bordered w-full"
						bind:value={newReplacement}
						onkeydown={(e) => e.key === 'Enter' && addEntry()}
					/>
					<label class="label">
						<span class="label-text-alt">{$_('settings.dictionaries.replacementHelp', { default: 'The text that will replace the trigger' })}</span>
					</label>
				</div>
			</div>

			<div class="modal-action">
				<button
					class="btn"
					onclick={() => {
						showAddModal = false;
						error = null;
					}}
				>
					{$_('common.cancel', { default: 'Cancel' })}
				</button>
				<button class="btn btn-primary" onclick={addEntry} disabled={!newTrigger.trim() || !newReplacement.trim()}>
					{$_('settings.dictionaries.add', { default: 'Add' })}
				</button>
			</div>
		</div>
		<form
			method="dialog"
			class="modal-backdrop"
			onclick={() => {
				showAddModal = false;
				error = null;
			}}
		>
			<button type="button">close</button>
		</form>
	</dialog>
{/if}
