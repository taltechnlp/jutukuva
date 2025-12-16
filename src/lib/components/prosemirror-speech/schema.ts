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
	marks: {}
});
