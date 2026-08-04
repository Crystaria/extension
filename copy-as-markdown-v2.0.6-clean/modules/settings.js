/**
 * Settings Management Module
 * Mimics SillyTavern's extensionSettings pattern
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

// Module name (unique identifier, like ST's MODULE_NAME)
const MODULE_NAME = 'copy_as_markdown';

/**
 * Default settings (similar to ST's defaultSettings)
 */
const defaultSettings = Object.freeze({
  enabled: true,
  convertLinks: true,      // Convert links to [text](url)
  convertImages: true,     // Convert images to ![alt](url)
  convertHeadings: false,  // Convert headings to # format
  preserveFormatting: true, // Preserve bold/italic
  showNotification: true   // Show copy confirmation
});

/**
 * Settings cache (similar to ST's extensionSettings cache)
 */
let settingsCache = null;

/**
 * Initialize settings from Chrome storage
 * Mimics ST's getSettings() pattern
 */
export async function getSettings() {
  console.log(`[${MODULE_NAME}] Step: getSettings()`);
  
  // Priority 1: Return cached settings if available
  if (settingsCache) {
    console.log(`[${MODULE_NAME}] ✓ Using cached settings`);
    return settingsCache;
  }
  
  // Priority 2: Load from Chrome storage
  try {
    const result = await chrome.storage.sync.get([MODULE_NAME]);
    
    if (result[MODULE_NAME]) {
      console.log(`[${MODULE_NAME}] ✓ Loaded from storage:`, result[MODULE_NAME]);
      
      // Merge with defaults to ensure all fields exist
      settingsCache = { ...defaultSettings, ...result[MODULE_NAME] };
      return settingsCache;
    }
  } catch (error) {
    console.warn(`[${MODULE_NAME}] Failed to load from storage:`, error);
  }
  
  // Priority 3: Use defaults
  console.log(`[${MODULE_NAME}] Initializing settings for first time`);
  settingsCache = { ...defaultSettings };
  return settingsCache;
}

/**
 * Save settings to Chrome storage
 * Mimics ST's saveSettingsDebounced() pattern
 */
export async function saveSettings(settings) {
  console.log(`[${MODULE_NAME}] Step: saveSettings()`);
  
  try {
    // Save to Chrome storage
    await chrome.storage.sync.set({ [MODULE_NAME]: settings });
    
    // Update cache
    settingsCache = settings;
    
    console.log(`[${MODULE_NAME}] ✓ Saved to storage:`, settings);
    
    // Emit settings updated event (similar to ST's SETTINGS_UPDATED)
    eventBus.emit('SETTINGS_UPDATED', settings);
  } catch (error) {
    console.error(`[${MODULE_NAME}] Error saving settings:`, error);
    throw error;
  }
}

/**
 * Reset settings to defaults
 */
export async function resetSettings() {
  console.log(`[${MODULE_NAME}] Step: resetSettings()`);
  
  try {
    await chrome.storage.sync.remove([MODULE_NAME]);
    settingsCache = null;
    console.log(`[${MODULE_NAME}] ✓ Settings reset to defaults`);
    
    return { ...defaultSettings };
  } catch (error) {
    console.error(`[${MODULE_NAME}] Error resetting settings:`, error);
    throw error;
  }
}

/**
 * Get a single setting value
 */
export async function getSetting(key) {
  const settings = await getSettings();
  return settings[key];
}

/**
 * Update a single setting value
 */
export async function updateSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  await saveSettings(settings);
  return settings;
}
