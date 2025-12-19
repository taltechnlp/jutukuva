<script lang="ts">
	import ShareSessionContent from '$lib/components/shared/ShareSessionContent.svelte';
	import type { SessionInfo, Participant } from '$lib/collaboration/types';

	let {
		sessionInfo,
		participants = [],
		onClose
	}: {
		sessionInfo: SessionInfo;
		participants: Participant[];
		onClose: () => void;
	} = $props();
</script>

<ShareSessionContent
	code={sessionInfo.code}
	password={sessionInfo.password}
	{participants}
	{onClose}
/>
