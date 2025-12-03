/**
 * Svelte action for detecting clicks outside an element
 */

export function clickOutside(node: HTMLElement, callback?: () => void) {
	const handleClick = (event: MouseEvent) => {
		if (!node.contains(event.target as HTMLElement)) {
			if (callback) {
				callback();
			}
			node.dispatchEvent(new CustomEvent('outclick'));
		}
	};

	document.addEventListener('click', handleClick, true);

	return {
		update(newCallback: () => void) {
			callback = newCallback;
		},
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
