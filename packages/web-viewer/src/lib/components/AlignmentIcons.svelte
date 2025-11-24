<!-- Alignment Icons - All icons in one file -->
<script lang="ts">
	interface Props {
		type: 'full' | 'left' | 'middle' | 'right';
		class?: string;
	}

	let { type, class: className = '' }: Props = $props();
</script>

{#if type === 'full'}
	<!-- Full width / Edge to edge alignment icon -->
	<svg
		xmlns="http://www.w3.org/2000/svg"
		height="24px"
		viewBox="0 -960 960 960"
		width="24px"
		fill="currentColor"
		class="alignment-icon-svg {className}"
	>
		<path
			d="M280-280 80-480l200-200 56 56-103 104h494L624-624l56-56 200 200-200 200-56-56 103-104H233l103 104-56 56Z"
		/>
	</svg>
{:else if type === 'left'}
	<!-- Left alignment icon -->
	<svg
		xmlns="http://www.w3.org/2000/svg"
		height="24px"
		viewBox="0 -960 960 960"
		width="24px"
		fill="currentColor"
		class="alignment-icon-svg {className}"
	>
		<path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z" />
	</svg>
{:else if type === 'right'}
	<!-- Middle / Centered alignment icon -->
    <svg
        xmlns="http://www.w3.org/2000/svg"
        height="24px" viewBox="0 -960 960 960" 
        width="24px" fill="currentColor" 
        class="alignment-icon-svg {className}"
    >
        <path d="M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z"/>
    </svg>
{:else if type === 'middle'}
	<!-- Right alignment icon -->
	<svg
		xmlns="http://www.w3.org/2000/svg"
		height="24px"
		viewBox="0 -960 960 960"
		width="24px"
		fill="currentColor"
		class="alignment-icon-svg {className}"
	>
		<path
			d="m320-160-56-57 103-103H80v-80h287L264-503l56-57 200 200-200 200Zm320-240L440-600l200-200 56 57-103 103h287v80H593l103 103-56 57Z"
		/>
	</svg>
{/if}
