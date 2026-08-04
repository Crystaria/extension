/**
 * Clipboard Operations Module
 * Handles copying content to system clipboard
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  console.log('[Clipboard] Step: copyToClipboard()');
  
  try {
    // Use modern Clipboard API
    await navigator.clipboard.writeText(text);
    console.log('[Clipboard] ✓ Copy successful');
    return true;
  } catch (error) {
    console.error('[Clipboard] Copy failed:', error);
    
    // Fallback: use execCommand (for older browsers)
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      console.log('[Clipboard] ✓ Copy successful (fallback)');
      return true;
    } catch (fallbackError) {
      console.error('[Clipboard] Fallback failed:', fallbackError);
      return false;
    }
  }
}

/**
 * Show notification (optional, like ST's toastr)
 */
export function showNotification(message, type = 'success') {
  console.log(`[Notification] ${type}: ${message}`);
  
  // Dispatch custom event to popup/background
  const event = new CustomEvent('copyAsMarkdown-notification', {
    detail: { message, type }
  });
  
  window.dispatchEvent(event);
}
