/**
 * Markdown Formatting Module
 * Core logic for converting selected content to Markdown
 * 
 * @author Copy as Markdown Team
 * @version 1.0.0
 */

/**
 * Convert selected text and links to Markdown format
 */
export function convertToMarkdown(text, selection, settings) {
  console.log('[Markdown] Step: convertToMarkdown()');
  
  let result = text;
  
  // Convert links to [text](url) format
  if (settings.convertLinks && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const links = range.cloneContents().querySelectorAll('a[href]');
    
    links.forEach(link => {
      const linkText = link.textContent.trim();
      const linkUrl = link.href;
      
      // Only convert if link text is different from URL
      if (linkText && linkText !== linkUrl) {
        const markdown = `[${linkText}](${linkUrl})`;
        result = result.replace(linkText, markdown);
      }
    });
  }
  
  // Convert images to ![alt](url) format
  if (settings.convertImages) {
    // Match img tags and extract src/alt attributes
    const imgRegex = /<img\s+([^>]*?)>/gi;
    let match;
    
    while ((match = imgRegex.exec(result)) !== null) {
      const fullMatch = match[0];
      const attrs = match[1];
      
      // Extract src and alt from attributes
      const srcMatch = attrs.match(/src="([^"]+)"/);
      const altMatch = attrs.match(/alt="([^"]*)"/);
      
      if (srcMatch && srcMatch[1]) {
        const imgUrl = srcMatch[1];
        const imgAlt = altMatch && altMatch[1] ? altMatch[1] : 'image';
        const markdown = `![${imgAlt}](${imgUrl})`;
        result = result.replace(fullMatch, markdown);
      }
    }
  }
  
  // Convert headings to # format
  if (settings.convertHeadings) {
    result = result.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    result = result.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    result = result.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
  }
  
  // Preserve bold/italic formatting
  if (settings.preserveFormatting) {
    result = result.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    result = result.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    result = result.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    result = result.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  }
  
  // Clean up HTML tags
  result = result.replace(/<[^>]+>/g, '');
  
  // Normalize whitespace
  result = result.replace(/\n\s*\n/g, '\n\n');
  result = result.trim();
  
  console.log('[Markdown] ✓ Conversion complete');
  return result;
}

/**
 * Get selected content with metadata
 */
export function getSelectionData(selection) {
  if (!selection || selection.isCollapsed) {
    return null;
  }
  
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  const html = range.cloneContents();
  
  // Get page information
  const pageTitle = document.title;
  const pageUrl = window.location.href;
  
  return {
    text,
    html,
    pageTitle,
    pageUrl,
    timestamp: Date.now()
  };
}
