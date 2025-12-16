/**
 * ProseMirror Speech Editor - Public API
 *
 * A reusable library for real-time speech editing
 */

export { default as SpeechEditor } from './SpeechEditor.svelte';
export { default as ReadOnlyEditorPreview } from './ReadOnlyEditorPreview.svelte';
export { default as Toolbar } from './Toolbar.svelte';
export { default as ShareSessionModal } from './ShareSessionModal.svelte';
export { default as SessionStatus } from './SessionStatus.svelte';
export { default as EndSessionModal } from './EndSessionModal.svelte';

export type {
	StreamingTextEvent,
	EditorConfig
} from './utils/types';

export { speechSchema } from './schema';
