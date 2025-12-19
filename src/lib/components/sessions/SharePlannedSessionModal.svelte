<script lang="ts">
	import ShareSessionContent from '$lib/components/shared/ShareSessionContent.svelte';

	interface Props {
		session: TranscriptionSession;
		onClose: () => void;
	}

	let { session, onClose }: Props = $props();
</script>

<ShareSessionContent
	code={session.session_code || ''}
	password={session.session_password}
	sessionName={session.name}
	scheduledDate={session.scheduled_date}
	{onClose}
/>
