import { tick } from 'svelte';

interface AutoScrollOptions {
	/**
	 * Threshold in pixels from bottom to consider "at bottom" for autoscroll
	 * Default: 50
	 */
	threshold?: number;
	/**
	 * Threshold in pixels from bottom to show the scroll-to-bottom button
	 * Default: 200
	 */
	buttonThreshold?: number;
	/**
	 * Whether autoscroll is enabled
	 * Default: true
	 */
	enabled?: boolean;
}

export class AutoScroller {
	#element: HTMLElement | null = null;
	#threshold: number;
	#buttonThreshold: number;
	#enabled: boolean = $state(true);
	#isScrolledUp = $state(false);
	#isUserScrolling: boolean = false;
	#userScrollTimeout: NodeJS.Timeout | null = null;
	#shouldAutoScroll: boolean = true;

	constructor(options: AutoScrollOptions = {}) {
		this.#threshold = options.threshold ?? 50;
		this.#buttonThreshold = options.buttonThreshold ?? 200;
		if (options.enabled !== undefined) {
			this.#enabled = options.enabled;
		}
	}

	get isScrolledUp() {
		return this.#isScrolledUp;
	}

	get enabled() {
		return this.#enabled;
	}

	set enabled(value: boolean) {
		this.#enabled = value;
		if (value && this.#shouldAutoScroll) {
			this.scrollToBottom();
		}
	}

	/**
	 * Action to be used on the scrollable element
	 */
	action = (node: HTMLElement) => {
		this.#element = node;
		
		node.addEventListener('scroll', this.#handleScroll, { passive: true });
		
		// Initial check
		this.#shouldAutoScroll = true;
		
		return {
			destroy: () => {
				node.removeEventListener('scroll', this.#handleScroll);
				if (this.#userScrollTimeout) {
					clearTimeout(this.#userScrollTimeout);
				}
				this.#element = null;
			}
		};
	};

	/**
	 * Call this when content changes to trigger potential autoscroll
	 */
	update() {
		if (!this.#enabled || !this.#element) return;

		// Only autoscroll if:
		// 1. User is not actively scrolling
		// 2. User is near the bottom (or explicitly wants to autoscroll)
		if (!this.#isUserScrolling && this.#shouldAutoScroll) {
			this.scrollToBottom();
		}
	}

	scrollToBottom = () => {
		if (!this.#element) return;

		this.#element.scrollTo({
			top: this.#element.scrollHeight,
			behavior: 'smooth'
		});
		
		// We assume if we programmatically scrolled to bottom, we want to stay there
		this.#shouldAutoScroll = true;
		this.#isScrolledUp = false;
	};

	#isNearBottom(element: HTMLElement): boolean {
		const { scrollTop, scrollHeight, clientHeight } = element;
		return scrollHeight - scrollTop - clientHeight < this.#threshold;
	}

	#isScrolledFarFromBottom(element: HTMLElement): boolean {
		const { scrollTop, scrollHeight, clientHeight } = element;
		return scrollHeight - scrollTop - clientHeight > this.#buttonThreshold;
	}

	#handleScroll = () => {
		if (!this.#element) return;

		// Clear existing timeout
		if (this.#userScrollTimeout) {
			clearTimeout(this.#userScrollTimeout);
		}

		// Mark as user scrolling
		this.#isUserScrolling = true;

		// Check if user scrolled back to bottom (for autoscroll re-enabling)
		if (this.#isNearBottom(this.#element)) {
			this.#shouldAutoScroll = true;
		} else {
			this.#shouldAutoScroll = false;
		}

		// Check if user scrolled far enough to show button
		this.#isScrolledUp = this.#isScrolledFarFromBottom(this.#element);

		// Debounce: consider user done scrolling after 150ms of no scroll events
		this.#userScrollTimeout = setTimeout(() => {
			this.#isUserScrolling = false;
		}, 150);
	};
}
