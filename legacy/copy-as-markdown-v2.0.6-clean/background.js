/**
 * Background Service Worker
 * Main entry point for Copy as Markdown extension
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

// Module name
const MODULE_NAME = 'copy_as_markdown';

// Default settings
const defaultSettings = Object.freeze({
  enabled: true,
  convertLinks: true,
  convertImages: true,
  convertHeadings: false,
  preserveFormatting: true,
  showNotification: true
});

// Settings cache
let settingsCache = null;

/**
 * Get settings from Chrome storage
 */
async function getSettings() {
  if (settingsCache) {
    return settingsCache;
  }
  
  try {
    const result = await chrome.storage.sync.get([MODULE_NAME]);
    
    if (result[MODULE_NAME]) {
      settingsCache = { ...defaultSettings, ...result[MODULE_NAME] };
      return settingsCache;
    }
  } catch (error) {
    console.warn(`[${MODULE_NAME}] Failed to load settings:`, error);
  }
  
  settingsCache = { ...defaultSettings };
  return settingsCache;
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set({ [MODULE_NAME]: settings });
    settingsCache = settings;
    console.log(`[${MODULE_NAME}] ✓ Settings saved`);
  } catch (error) {
    console.error(`[${MODULE_NAME}] Failed to save settings:`, error);
    throw error;
  }
}

/**
 * Initialize extension
 */
async function initialize() {
  const settings = await getSettings();
  
  if (settings.enabled) {
    await createContextMenus();
  }
}

/**
 * Create context menus
 */
async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  
  chrome.contextMenus.create({
    id: 'copy-as-markdown',
    title: 'Copy as Markdown',
    contexts: ['selection']
  });
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'copy-as-markdown') {
    try {
      const settings = await getSettings();
      
      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'COPY_SELECTION',
        settings: settings
      });
      
      if (response && response.success) {
        // Show notification if enabled
        if (settings.showNotification) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'SHOW_NOTIFICATION',
            message: 'Copied as Markdown!'
          });
        }
      } else if (response && response.error) {
        console.error(`[${MODULE_NAME}] Copy failed:`, response.error);
      }
    } catch (error) {
      console.error(`[${MODULE_NAME}] Error:`, error);
    }
  }
});

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set({ [MODULE_NAME]: defaultSettings });
  }
  
  await initialize();
});

// Initialize on startup
initialize();
