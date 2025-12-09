<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';

	function stopPropagation(e: MouseEvent) {
		e.stopPropagation();
	}

	async function minimize(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		const window = await getCurrentWindow();
		await window.minimize();
	}

	async function maximize(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		const window = await getCurrentWindow();
		const isMaximized = await window.isMaximized();
		if (isMaximized) {
			await window.unmaximize();
		} else {
			await window.maximize();
		}
	}

	async function close(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		const window = await getCurrentWindow();
		await window.close();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex items-center gap-1" onmousedown={stopPropagation}>
	<button
		onclick={minimize}
		class="btn btn-ghost btn-xs btn-circle hover:bg-base-300"
		title="Minimize"
	>
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
		</svg>
	</button>
	<button
		onclick={maximize}
		class="btn btn-ghost btn-xs btn-circle hover:bg-base-300"
		title="Maximize"
	>
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
			/>
		</svg>
	</button>
	<button onclick={close} class="btn btn-ghost btn-xs btn-circle hover:bg-error hover:text-white" title="Close">
		<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
		</svg>
	</button>
</div>
