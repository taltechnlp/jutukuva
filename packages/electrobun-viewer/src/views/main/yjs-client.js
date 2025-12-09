/**
 * YJS Client for Electrobun Viewer
 * Handles real-time text synchronization with YJS server
 */

// Import YJS from CDN (will be loaded via script tag)
// This file expects Y and WebsocketProvider to be available globally

class YjsTextSync {
  constructor() {
    this.ydoc = null;
    this.provider = null;
    this.xmlFragmentObserver = null;
    this.speakersObserver = null;
    this.updateHandler = null;
    this.extractInterval = null;
    this.onTextUpdate = null;
    this.onConnectionChange = null;
    this.speakers = new Map();
  }

  /**
   * Connect to a YJS session
   * @param {string} sessionCode - The session code
   * @param {string} serverUrl - WebSocket server URL
   * @param {Object} callbacks - Event callbacks
   */
  connect(sessionCode, serverUrl, callbacks = {}) {
    this.onTextUpdate = callbacks.onTextUpdate || (() => {});
    this.onConnectionChange = callbacks.onConnectionChange || (() => {});

    // Ensure we use the correct YJS server path (/kk not /yjs)
    if (serverUrl.endsWith('/yjs')) {
      serverUrl = serverUrl.replace('/yjs', '/kk');
    }

    console.log('[YJS-CLIENT] Connecting to session:', sessionCode, 'server:', serverUrl);

    // Create Yjs document
    this.ydoc = new Y.Doc();

    // Connect to WebSocket provider
    this.provider = new WebsocketProvider(serverUrl, sessionCode, this.ydoc, {
      connect: true,
      maxBackoffTime: 5000,
      disableBc: true
    });

    // Listen to connection status
    this.provider.on('status', ({ status }) => {
      const connected = status === 'connected';
      console.log('[YJS-CLIENT] Connection status:', status);
      this.onConnectionChange(connected);
    });

    // Listen for connection errors
    this.provider.on('connection-error', (event) => {
      console.error('[YJS-CLIENT] Connection error:', event);
      this.onConnectionChange(false);
    });

    // Set user info in awareness
    this.provider.awareness.setLocalStateField('user', {
      name: 'Viewer',
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      role: 'guest'
    });

    // Get XML fragment and observe it for changes
    const xmlFrag = this.ydoc.getXmlFragment('prosemirror');

    // Observe XML fragment for changes
    const observer = () => {
      console.log('[YJS-CLIENT] XML fragment changed');
      this.updateText();
    };
    xmlFrag.observe(observer);
    this.xmlFragmentObserver = () => xmlFrag.unobserve(observer);

    // Observe speakers map for changes
    const speakersMap = this.ydoc.getMap('speakers');
    const speakersObserverFn = () => {
      console.log('[YJS-CLIENT] Speakers changed');
      this.loadSpeakers();
      this.updateText();
    };
    speakersMap.observe(speakersObserverFn);
    this.speakersObserver = () => speakersMap.unobserve(speakersObserverFn);

    // Initial speakers load
    this.loadSpeakers();

    // Also listen for Yjs document updates as a fallback
    this.updateHandler = (update, origin) => {
      console.log('[YJS-CLIENT] Yjs update event fired', { updateSize: update.length });
      setTimeout(() => this.updateText(), 10);
    };
    this.ydoc.on('update', this.updateHandler);

    // Initial text extraction - try a few times after connection
    let attempts = 0;
    this.extractInterval = setInterval(() => {
      attempts++;
      const text = this.extractText();
      console.log('[YJS-CLIENT] Initial extraction attempt:', attempts, 'text length:', text.length);

      if (text) {
        this.onTextUpdate(text);
        clearInterval(this.extractInterval);
        this.extractInterval = null;
        console.log('[YJS-CLIENT] Initial text extraction successful');
      } else if (attempts >= 20) {
        clearInterval(this.extractInterval);
        this.extractInterval = null;
        console.log('[YJS-CLIENT] Initial extraction complete (will update when content arrives)');
      }
    }, 500);
  }

  /**
   * Load speakers from the Yjs map
   */
  loadSpeakers() {
    if (!this.ydoc) return;

    const speakersMap = this.ydoc.getMap('speakers');
    this.speakers.clear();

    speakersMap.forEach((speaker, id) => {
      this.speakers.set(id, speaker);
    });

    console.log('[YJS-CLIENT] Loaded speakers:', this.speakers.size);
  }

  /**
   * Get speaker name by ID
   * @param {string} speakerId - Speaker ID
   * @returns {string|null} Speaker name or null
   */
  getSpeakerName(speakerId) {
    if (!speakerId) return null;
    const speaker = this.speakers.get(speakerId);
    return speaker?.name || null;
  }

  /**
   * Update text from the Yjs document
   */
  updateText() {
    const text = this.extractText();
    if (text !== undefined) {
      this.onTextUpdate(text);
    }
  }

  /**
   * Extract text from the Yjs XML fragment
   * @returns {string} Extracted text
   */
  extractText() {
    if (!this.ydoc) return '';

    try {
      const xmlFrag = this.ydoc.getXmlFragment('prosemirror');
      const rawText = xmlFrag.toString();

      console.log('[YJS-CLIENT] XML fragment length:', rawText.length);

      // Extract text content with speaker prefixes
      const paragraphs = [];

      // Match each paragraph element with its attributes and content
      const paragraphRegex = /<paragraph([^>]*)>([\s\S]*?)<\/paragraph>/g;
      let match;

      while ((match = paragraphRegex.exec(rawText)) !== null) {
        const attrs = match[1];
        const content = match[2];

        // Extract speakerId from attributes
        const speakerIdMatch = attrs.match(/speakerId="([^"]*)"/);
        const speakerId = speakerIdMatch ? speakerIdMatch[1] : null;

        // Get speaker name
        const speakerName = this.getSpeakerName(speakerId);

        // Strip XML tags from content to get plain text
        const plainText = content
          .replace(/<[^>]*>/g, '')
          .replace(/ +/g, ' ')
          .trim();

        if (plainText) {
          if (speakerName) {
            paragraphs.push(`${speakerName}: ${plainText}`);
          } else {
            paragraphs.push(plainText);
          }
        }
      }

      // If regex didn't match, fall back to simple extraction
      if (paragraphs.length === 0) {
        const textOnly = rawText
          .replace(/<\/paragraph>/g, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/ +/g, ' ')
          .replace(/\n /g, '\n')
          .replace(/ \n/g, '\n')
          .trim();
        return textOnly;
      }

      return paragraphs.join('\n');
    } catch (err) {
      console.error('[YJS-CLIENT] Error extracting text:', err);
      return '';
    }
  }

  /**
   * Disconnect from the session
   */
  disconnect() {
    console.log('[YJS-CLIENT] Disconnecting...');

    if (this.xmlFragmentObserver) {
      this.xmlFragmentObserver();
      this.xmlFragmentObserver = null;
    }

    if (this.speakersObserver) {
      this.speakersObserver();
      this.speakersObserver = null;
    }

    if (this.extractInterval) {
      clearInterval(this.extractInterval);
      this.extractInterval = null;
    }

    if (this.updateHandler && this.ydoc) {
      this.ydoc.off('update', this.updateHandler);
      this.updateHandler = null;
    }

    if (this.provider) {
      this.provider.disconnect();
      this.provider.destroy();
      this.provider = null;
    }

    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }

    this.speakers.clear();
    console.log('[YJS-CLIENT] Disconnected');
  }
}

// Export for use in main script
window.YjsTextSync = YjsTextSync;
