import { Schema } from 'prosemirror-model';

/**
 * ProseMirror schema for real-time speech editing
 *
 * Nodes:
 * - doc: Root document node
 * - paragraph: Represents a subtitle segment
 * - text: Text content with marks
 *
 * Marks:
 * - word: Mark each word with timing information
 */

export const speechSchema = new Schema({
	nodes: {
		doc: {
			content: 'paragraph+'
		},
		paragraph: {
			content: 'text*',
			attrs: {
				// Segment metadata
				segmentIndex: { default: null },
				segmentStartTime: { default: null },
				segmentEndTime: { default: null },
				// Speaker attribution
				speakerId: { default: null }
			},
			toDOM(node) {
				return [
					'p',
					{
						'data-segment-index': node.attrs.segmentIndex,
						'data-start': node.attrs.segmentStartTime,
						'data-end': node.attrs.segmentEndTime,
						'data-speaker-id': node.attrs.speakerId
					},
					0
				];
			},
			parseDOM: [
				{
					tag: 'p',
					getAttrs(dom) {
						const el = dom as HTMLElement;
						return {
							segmentIndex: el.getAttribute('data-segment-index')
								? parseInt(el.getAttribute('data-segment-index')!)
								: null,
							segmentStartTime: el.getAttribute('data-start')
								? parseFloat(el.getAttribute('data-start')!)
								: null,
							segmentEndTime: el.getAttribute('data-end')
								? parseFloat(el.getAttribute('data-end')!)
								: null,
							speakerId: el.getAttribute('data-speaker-id') || null
						};
					}
				}
			]
		},
		text: {
			group: 'inline'
		}
	},
	marks: {
		word: {
			attrs: {
				id: {},
				start: { default: 0 },
				end: { default: 0 }
			},
			toDOM(mark) {
				return [
					'span',
					{
						class: 'word',
						'data-word-id': mark.attrs.id,
						'data-start': mark.attrs.start,
						'data-end': mark.attrs.end
					},
					0
				];
			},
			parseDOM: [
				{
					tag: 'span[data-word-id]',
					getAttrs(dom) {
						const el = dom as HTMLElement;
						return {
							id: el.getAttribute('data-word-id'),
							start: parseFloat(el.getAttribute('data-start') || '0'),
							end: parseFloat(el.getAttribute('data-end') || '0')
						};
					}
				}
			]
		}
	}
});
