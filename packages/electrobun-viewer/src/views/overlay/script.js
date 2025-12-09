/**
 * Overlay View Script
 * Handles caption display in the overlay window
 */

console.log('[Overlay] View loaded');

// Caption text element
const captionText = document.getElementById('captionText');

// Update caption text
function updateCaption(text) {
  if (captionText) {
    captionText.textContent = text;
  }
}

// Expose to global scope for IPC
window.updateCaption = updateCaption;
