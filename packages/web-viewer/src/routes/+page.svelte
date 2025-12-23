<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { _ } from 'svelte-i18n';

	let sessionCode = $state('');

	function joinSession() {
		if (sessionCode.length === 6) {
			goto(`${base}/${sessionCode.toUpperCase()}`);
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
	<div class="text-center max-w-md w-full">
		<h1 class="text-5xl font-bold mb-4 text-white">Jutukuva</h1>
		<p class="text-xl mb-8 text-gray-300">
			{$_('web_viewer.tagline')}
		</p>

		<div class="bg-gray-800 rounded-lg shadow-xl p-8">
			<h2 class="text-2xl font-semibold mb-6 text-white text-center">
				{$_('web_viewer.join_session')}
			</h2>

			<div class="w-full mb-4">
				<label class="block mb-2" for="session-code-input">
					<span class="text-sm text-gray-400">
						{$_('web_viewer.enter_code')}
					</span>
				</label>
				<input
					id="session-code-input"
					type="text"
					placeholder="ABC123"
					class="w-full text-center font-mono text-2xl uppercase px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					maxlength="6"
					bind:value={sessionCode}
					oninput={(e) => {
						sessionCode = e.currentTarget.value.toUpperCase();
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' && sessionCode.length === 6) {
							joinSession();
						}
					}}
				/>
			</div>

			<div class="flex justify-center mt-6">
				<button
					class="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200"
					disabled={sessionCode.length !== 6}
					onclick={joinSession}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M14 5l7 7m0 0l-7 7m7-7H3"
						/>
					</svg>
					{$_('web_viewer.join')}
				</button>
			</div>
		</div>

		<div class="mt-8 text-sm text-gray-500">
			<p>
				{$_('web_viewer.web_viewer_note')}
			</p>
		</div>
	</div>
</div>
