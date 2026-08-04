/**
 * Content Script
 * Handles page-level interactions
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

/**
 * Convert selected content to Markdown
 */
function convertToMarkdown(selection, settings) {
  if (!selection || selection.rangeCount === 0) {
    return '';
  }
  
  const range = selection.getRangeAt(0);
  const container = range.cloneContents();
  
  let result = '';
  
  const nodes = container.childNodes;
  nodes.forEach(node => {
    result += processNode(node, settings);
  });
  
  result = result.replace(/\n\s*\n/g, '\n\n');
  result = result.trim();
  
  return result;
}

/**
 * Process a single DOM node and convert to Markdown
 */
function processNode(node, settings) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node;
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'a' && settings.convertLinks) {
      const text = element.textContent.trim();
      const href = element.href;
      if (text && href && text !== href) {
        return `[${text}](${href})`;
      }
      return text;
    }
    
    if (tagName === 'img' && settings.convertImages) {
      const src = element.src;
      const alt = element.alt || 'image';
      if (src) {
        return `![${alt}](${src})`;
      }
      return '';
    }
    
    if (settings.convertHeadings) {
      if (tagName === 'h1') {
        return `# ${element.textContent.trim()}\n`;
      }
      if (tagName === 'h2') {
        return `## ${element.textContent.trim()}\n`;
      }
      if (tagName === 'h3') {
        return `### ${element.textContent.trim()}\n`;
      }
    }
    
    if (settings.preserveFormatting) {
      if (tagName === 'strong' || tagName === 'b') {
        return `**${element.textContent.trim()}**`;
      }
      if (tagName === 'em' || tagName === 'i') {
        return `*${element.textContent.trim()}*`;
      }
    }
    
    let result = '';
    element.childNodes.forEach(child => {
      result += processNode(child, settings);
    });
    
    return result;
  }
  
  return '';
}

/**
 * Get selected content with metadata
 */
function getSelectionData(selection) {
  if (!selection || selection.isCollapsed) {
    return null;
  }
  
  return {
    text: selection.toString().trim(),
    pageTitle: document.title,
    pageUrl: window.location.href,
    timestamp: Date.now()
  };
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (fallbackError) {
      return false;
    }
  }
}

/**
 * Show notification on page
 */
function showNotification(message, duration = 3000) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 999999;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'COPY_SELECTION') {
    handleCopySelection(request.settings)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }
  
  if (request.action === 'SHOW_NOTIFICATION') {
    showNotification(request.message);
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Handle copy selection action
 */
async function handleCopySelection(settings) {
  try {
    const selection = window.getSelection();
    const selectionData = getSelectionData(selection);
    
    if (!selectionData || !selectionData.text) {
      return { success: false, error: 'No text selected' };
    }
    
    const markdown = convertToMarkdown(selection, settings);
    
    if (!markdown) {
      return { success: false, error: 'Conversion failed' };
    }
    
    const copySuccess = await copyToClipboard(markdown);
    
    if (!copySuccess) {
      throw new Error('Failed to copy to clipboard');
    }
    
    return {
      success: true,
      showNotification: settings.showNotification,
      markdown: markdown
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
