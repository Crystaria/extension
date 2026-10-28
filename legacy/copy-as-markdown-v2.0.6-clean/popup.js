/**
 * Popup Settings Logic
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

const MODULE_NAME = 'copy_as_markdown';

const defaultSettings = {
  enabled: true,
  convertLinks: true,
  convertImages: true,
  convertHeadings: false,
  preserveFormatting: true,
  showNotification: true
};

/**
 * Load settings into UI
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([MODULE_NAME]);
    const settings = result[MODULE_NAME] || defaultSettings;
    
    // Populate checkboxes
    document.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      if (key in settings) {
        input.checked = settings[key];
      }
    });
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

/**
 * Save settings from UI
 */
async function saveSettingsFromUI() {
  try {
    const settings = {};
    
    document.querySelectorAll('[data-setting]').forEach(input => {
      settings[input.dataset.setting] = input.checked;
    });
    
    await chrome.storage.sync.set({ [MODULE_NAME]: settings });
    
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettingsFromUI() {
  try {
    await chrome.storage.sync.remove([MODULE_NAME]);
    
    // Update UI
    document.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      if (key in defaultSettings) {
        input.checked = defaultSettings[key];
      }
    });
    
    showStatus('Settings reset to defaults', 'success');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatus('Failed to reset settings', 'error');
  }
}

/**
 * Show status message
 */
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status-message';
  }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('saveBtn').addEventListener('click', saveSettingsFromUI);
document.getElementById('resetBtn').addEventListener('click', resetSettingsFromUI);
