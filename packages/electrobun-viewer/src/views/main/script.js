/**
 * Main View Script
 * Handles session joining, settings, and overlay control
 */

// RPC bridge for communication with Bun main process
const rpc = window.electrobun?.rpc;

// DOM Elements
const joinSection = document.getElementById('joinSection');
const viewerSection = document.getElementById('viewerSection');
const joinForm = document.getElementById('joinForm');
const sessionCodeInput = document.getElementById('sessionCode');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const currentSessionCode = document.getElementById('currentSessionCode');
const connectionStatus = document.getElementById('connectionStatus');
const overlayToggle = document.getElementById('overlayToggle');
const viewerFrame = document.getElementById('viewerFrame');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const closeSettingsBackdrop = document.getElementById('closeSettingsBackdrop');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const lastSessionHint = document.getElementById('lastSessionHint');
const lastSessionBtn = document.getElementById('lastSessionBtn');

// Settings elements
const yjsServerUrl = document.getElementById('yjsServerUrl');
const webViewerUrl = document.getElementById('webViewerUrl');
const overlayWidth = document.getElementById('overlayWidth');
const overlayHeight = document.getElementById('overlayHeight');
const overlayOpacity = document.getElementById('overlayOpacity');
const overlayOpacityValue = document.getElementById('overlayOpacityValue');
const clickThrough = document.getElementById('clickThrough');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontWeight = document.getElementById('fontWeight');
const textColor = document.getElementById('textColor');
const textColorValue = document.getElementById('textColorValue');
const bgColor = document.getElementById('bgColor');
const bgColorValue = document.getElementById('bgColorValue');
const bgOpacity = document.getElementById('bgOpacity');
const bgOpacityValue = document.getElementById('bgOpacityValue');
const subtitlePreview = document.getElementById('subtitlePreview');

// State
let currentSettings = null;
let isOverlayActive = false;

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

async function init() {
  console.log('[Main View] Initializing...');
  
  // Load settings
  await loadSettings();
  
  // Check for last session
  await checkLastSession();
  
  // Set up event listeners
  setupEventListeners();
  
  // Listen for deep link joins
  if (rpc) {
    rpc.on('deeplink:join', (code) => {
      console.log('[Main View] Deep link join:', code);
      joinSession(code);
    });
  }
  
  console.log('[Main View] Ready');
}

// ═══════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════

async function loadSettings() {
  if (!rpc) {
    console.warn('[Main View] RPC not available, using defaults');
    return;
  }
  
  try {
    currentSettings = await rpc.invoke('settings:getAll');
    applySettingsToUI(currentSettings);
  } catch (error) {
    console.error('[Main View] Failed to load settings:', error);
  }
}

function applySettingsToUI(settings) {
  if (!settings) return;
  
  // Connection
  yjsServerUrl.value = settings.connection.yjsServerUrl;
  webViewerUrl.value = settings.connection.webViewerUrl;
  
  // Overlay
  overlayWidth.value = settings.overlay.size.width;
  overlayHeight.value = settings.overlay.size.height;
  overlayOpacity.value = settings.overlay.opacity;
  overlayOpacityValue.textContent = `${Math.round(settings.overlay.opacity * 100)}%`;
  clickThrough.checked = settings.overlay.clickThrough;
  
  // Position preset
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === settings.overlay.positionPreset);
  });
  
  // Font
  fontFamily.value = settings.font.family;
  fontSize.value = settings.font.size;
  fontWeight.value = settings.font.weight;
  textColor.value = settings.font.color;
  textColorValue.textContent = settings.font.color;
  bgColor.value = settings.font.backgroundColor;
  bgColorValue.textContent = settings.font.backgroundColor;
  bgOpacity.value = settings.font.backgroundOpacity;
  bgOpacityValue.textContent = `${Math.round(settings.font.backgroundOpacity * 100)}%`;
  
  // Update preview
  updatePreview();
}

function updatePreview() {
  subtitlePreview.style.fontFamily = fontFamily.value;
  subtitlePreview.style.fontSize = `${Math.min(fontSize.value, 32)}px`;
  subtitlePreview.style.fontWeight = fontWeight.value;
  subtitlePreview.style.color = textColor.value;
  
  const opacity = parseFloat(bgOpacity.value);
  const rgb = hexToRgb(bgColor.value);
  subtitlePreview.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

async function saveSettings() {
  if (!rpc) return;
  
  try {
    // Save connection settings
    await rpc.invoke('settings:setConnection', {
      yjsServerUrl: yjsServerUrl.value,
      webViewerUrl: webViewerUrl.value,
    });
    
    // Save overlay settings
    const activePreset = document.querySelector('[data-preset].active')?.dataset.preset || 'bottom';
    await rpc.invoke('settings:setOverlay', {
      size: { width: parseInt(overlayWidth.value), height: parseInt(overlayHeight.value) },
      opacity: parseFloat(overlayOpacity.value),
      clickThrough: clickThrough.checked,
      positionPreset: activePreset,
    });
    
    // Save font settings
    await rpc.invoke('settings:setFont', {
      family: fontFamily.value,
      size: parseInt(fontSize.value),
      weight: parseInt(fontWeight.value),
      color: textColor.value,
      backgroundColor: bgColor.value,
      backgroundOpacity: parseFloat(bgOpacity.value),
    });
    
    // Reload settings
    await loadSettings();
    
    // Close modal
    settingsModal.style.display = 'none';
    
    console.log('[Main View] Settings saved');
  } catch (error) {
    console.error('[Main View] Failed to save settings:', error);
  }
}

async function resetSettings() {
  if (!rpc) return;
  
  try {
    currentSettings = await rpc.invoke('settings:reset');
    applySettingsToUI(currentSettings);
    console.log('[Main View] Settings reset');
  } catch (error) {
    console.error('[Main View] Failed to reset settings:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// Session Management
// ═══════════════════════════════════════════════════════════════

async function checkLastSession() {
  if (!rpc) return;
  
  try {
    const lastCode = await rpc.invoke('session:getLastCode');
    if (lastCode) {
      lastSessionHint.style.display = 'flex';
      lastSessionBtn.textContent = lastCode;
    }
  } catch (error) {
    console.error('[Main View] Failed to get last session:', error);
  }
}

async function joinSession(code) {
  const normalizedCode = code.toUpperCase().trim();
  
  if (normalizedCode.length !== 6) {
    console.error('[Main View] Invalid session code');
    return;
  }
  
  console.log('[Main View] Joining session:', normalizedCode);
  
  // Save last session code
  if (rpc) {
    await rpc.invoke('session:setLastCode', normalizedCode);
  }
  
  // Get viewer URL from settings
  const viewerUrl = currentSettings?.connection?.webViewerUrl || 'http://localhost:5174';
  const sessionUrl = `${viewerUrl}/${normalizedCode}`;
  
  // Switch to viewer mode
  joinSection.style.display = 'none';
  viewerSection.style.display = 'flex';
  currentSessionCode.textContent = normalizedCode;
  
  // Load viewer in iframe
  viewerFrame.src = sessionUrl;
  
  // Update connection status when iframe loads
  viewerFrame.onload = () => {
    connectionStatus.textContent = 'Connected';
    connectionStatus.classList.add('connected');
  };
}

function leaveSession() {
  console.log('[Main View] Leaving session');
  
  // Clear iframe
  viewerFrame.src = 'about:blank';
  
  // Switch back to join mode
  viewerSection.style.display = 'none';
  joinSection.style.display = 'flex';
  
  // Clear code input
  sessionCodeInput.value = '';
  sessionCodeInput.focus();
  
  // Reset connection status
  connectionStatus.textContent = 'Connecting...';
  connectionStatus.classList.remove('connected');
}

// ═══════════════════════════════════════════════════════════════
// Overlay Control
// ═══════════════════════════════════════════════════════════════

async function toggleOverlay() {
  if (!rpc) return;
  
  try {
    const state = await rpc.invoke('overlay:toggle');
    isOverlayActive = state.visible;
    overlayToggle.classList.toggle('active', isOverlayActive);
    
    console.log('[Main View] Overlay:', isOverlayActive ? 'shown' : 'hidden');
  } catch (error) {
    console.error('[Main View] Failed to toggle overlay:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// Event Listeners
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Join form
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    joinSession(sessionCodeInput.value);
  });
  
  // Last session button
  lastSessionBtn.addEventListener('click', () => {
    joinSession(lastSessionBtn.textContent);
  });
  
  // Leave button
  leaveBtn.addEventListener('click', leaveSession);
  
  // Overlay toggle
  overlayToggle.addEventListener('click', toggleOverlay);
  
  // Settings modal
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });
  
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
  
  closeSettingsBackdrop.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
  
  saveSettingsBtn.addEventListener('click', saveSettings);
  resetSettingsBtn.addEventListener('click', resetSettings);
  
  // Position preset buttons
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Live preview updates
  overlayOpacity.addEventListener('input', () => {
    overlayOpacityValue.textContent = `${Math.round(overlayOpacity.value * 100)}%`;
  });
  
  bgOpacity.addEventListener('input', () => {
    bgOpacityValue.textContent = `${Math.round(bgOpacity.value * 100)}%`;
    updatePreview();
  });
  
  textColor.addEventListener('input', () => {
    textColorValue.textContent = textColor.value;
    updatePreview();
  });
  
  bgColor.addEventListener('input', () => {
    bgColorValue.textContent = bgColor.value;
    updatePreview();
  });
  
  [fontFamily, fontSize, fontWeight].forEach(el => {
    el.addEventListener('change', updatePreview);
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape to close modal
    if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
      settingsModal.style.display = 'none';
    }
    
    // Cmd/Ctrl + O to toggle overlay
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      toggleOverlay();
    }
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
