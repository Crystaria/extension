/**
 * Copy as Markdown - content script（按需注入）
 *
 * 这个文件会被 chrome.scripting.executeScript 反复注入到同一个页面。
 * 整个文件包在 IIFE 里：顶层不再有 const/let，重复注入不会抛
 * “Identifier 'XXX' has already been declared”。
 *
 * 相比原版的改进：
 *  - 段落、列表、<br>、代码块、引用、表格都能正确输出
 *  - 保留嵌套格式：<a><b>x</b></a> -> [**x**](url)
 *  - 文本节点做最小化 Markdown 转义
 *  - 剪贴板 fallback 会检查 execCommand 的返回值，不再“假成功”
 *  - 递归有深度上限，深层 DOM 退化为纯文本而不是 RangeError
 *  - 代码块围栏按内容动态加长，内容里出现 ``` 也不会被截断
 */
(() => {
  const CAM_DEFAULTS = Object.freeze({
    enabled: true,
    convertLinks: true,
    convertImages: true,
    convertHeadings: false,
    preserveFormatting: true,
    showNotification: true
  });

  /** 递归深度上限：实测 6000 层可用、10000 层栈溢出，这里留足安全余量 */
  const MAX_NODE_DEPTH = 120;

  /** 超深节点直接退化成文本，避免爆栈 */
  const MAX_TEXT_PER_NODE = 200000;

  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title',
    'svg', 'canvas', 'video', 'audio', 'iframe', 'object', 'embed',
    'input', 'textarea', 'select', 'option', 'button'
  ]);

  const BLOCK_TAGS = new Set([
    'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
    'figure', 'figcaption', 'dl', 'dt', 'dd', 'address', 'form', 'fieldset',
    'details', 'summary', 'center'
  ]);

  // Markdown 特殊字符：用查表代替正则，避免字符类里 [ ] \ 转义踩坑
  const MD_SPECIAL = {
    '\\': true,
    '`': true,
    '*': true,
    '_': true,
    '[': true,
    ']': true
  };

  /* ---------------------------------------------------------------- */
  /* 小工具                                                            */
  /* ---------------------------------------------------------------- */

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\n\r\f]+/g, ' ');
  }

  function escapeText(value) {
    const text = String(value || '');
    // 先扫一遍，纯文本直接返回，避免大段内容无谓拼接
    let hit = false;
    for (let i = text.length - 1; i >= 0; i--) {
      if (MD_SPECIAL[text[i]]) {
        hit = true;
        break;
      }
    }
    if (!hit) return text;

    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += MD_SPECIAL[ch] ? `\\${ch}` : ch;
    }
    return out;
  }

  /** 把 ** 之类标记套在内容外侧，空格留在标记外面 */
  function wrapInline(marker, inner) {
    if (!inner) return '';
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    if (!match || !match[2]) return inner;
    return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
  }

  function wrapCode(value) {
    const code = String(value || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!code) return '';
    const fence = code.includes('`') ? '``' : '`';
    const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
    return `${fence}${pad}${code}${pad}${fence}`;
  }

  function escapeUrl(url) {
    return String(url || '')
      .trim()
      .replace(/ /g, '%20')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
  }

  /** 内容里出现连续反引号时，围栏要比它更长 */
  function fenceFor(text) {
    const runs = String(text || '').match(/`{3,}/g);
    if (!runs) return '```';
    const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
    return '`'.repeat(longest + 1);
  }

  function closestTag(node, tagName) {
    let element = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (element && element.tagName) {
      if (element.tagName.toLowerCase() === tagName) return element;
      element = element.parentElement;
    }
    return null;
  }

  /** 折叠多余空白，但保留换行与反斜杠硬换行 */
  function tidyInline(value) {
    return String(value || '')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /** 超深 / 超大节点的兜底：直接取文本 */
  function flattenText(el) {
    const text = normalizeText(el && el.textContent);
    return escapeText(text.slice(0, MAX_TEXT_PER_NODE));
  }

  /* ---------------------------------------------------------------- */
  /* DOM -> Markdown                                                   */
  /* ---------------------------------------------------------------- */

  function serializeChildren(nodes, ctx, depth) {
    let out = '';
    for (const node of nodes) out += serializeNode(node, ctx, depth);
    return out;
  }

  function serializeNode(node, ctx, depth) {
    if (!node) return '';

    if (node.nodeType === 3) {
      return escapeText(normalizeText(node.nodeValue));
    }
    if (node.nodeType !== 1) return '';

    const el = node;
    const tag = el.tagName.toLowerCase();

    if (SKIP_TAGS.has(tag)) return '';
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return '';

    // 深度护栏：极端嵌套的页面退化成纯文本，不让递归爆栈
    if (depth > MAX_NODE_DEPTH) return flattenText(el);

    switch (tag) {
      case 'br':
        return '\\\n';

      case 'hr':
        return '\n\n---\n\n';

      case 'img': {
        if (!ctx.convertImages) return '';
        const src = el.currentSrc || el.getAttribute('src') || '';
        if (!src || /^data:/i.test(src)) {
          // data: URI 动辄上万字符，粘出去没意义
          const altOnly = (el.getAttribute('alt') || '').trim();
          return altOnly ? escapeText(altOnly) : '';
        }
        const alt = (el.getAttribute('alt') || '').trim().replace(/[[\]]/g, '');
        return `![${alt}](${escapeUrl(src)})`;
      }

      case 'a':
        return serializeLink(el, ctx, depth);

      case 'strong':
      case 'b': {
        const inner = serializeChildren(el.childNodes, ctx, depth + 1);
        return ctx.preserveFormatting ? wrapInline('**', inner) : inner;
      }

      case 'em':
      case 'i': {
        const inner = serializeChildren(el.childNodes, ctx, depth + 1);
        return ctx.preserveFormatting ? wrapInline('*', inner) : inner;
      }

      case 'del':
      case 's':
      case 'strike': {
        const inner = serializeChildren(el.childNodes, ctx, depth + 1);
        return ctx.preserveFormatting ? wrapInline('~~', inner) : inner;
      }

      case 'code':
        return wrapCode(el.textContent);

      case 'pre':
        return serializePre(el, ctx);

      case 'blockquote':
        return serializeBlockquote(el, ctx, depth);

      case 'ul':
      case 'ol':
        return serializeList(el, ctx, depth);

      case 'table':
        return serializeTable(el, ctx, depth);

      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return serializeHeading(el, ctx, depth);

      default:
        break;
    }

    const inner = serializeChildren(el.childNodes, ctx, depth + 1);
    if (BLOCK_TAGS.has(tag)) return `\n\n${inner}\n\n`;
    return inner;
  }

  function serializeLink(el, ctx, depth) {
    const inner = serializeChildren(el.childNodes, ctx, depth + 1).trim();
    const href = (el.getAttribute('href') || '').trim();

    if (!ctx.convertLinks) return inner;
    if (!href || /^(javascript|mailto|tel|data):/i.test(href)) return inner;

    let url = href;
    try {
      url = new URL(href, document.baseURI).href;
    } catch {
      /* 保留原始 href */
    }

    if (!inner || inner === url || inner === href) return `<${escapeUrl(url)}>`;
    return `[${inner}](${escapeUrl(url)})`;
  }

  function serializeHeading(el, ctx, depth) {
    const level = Number(el.tagName[1]) || 1;
    const inner = serializeChildren(el.childNodes, ctx, depth + 1).trim();
    if (!inner) return '';

    if (ctx.convertHeadings) {
      return `\n\n${'#'.repeat(Math.min(level, 6))} ${inner}\n\n`;
    }
    return `\n\n${ctx.preserveFormatting ? wrapInline('**', inner) : inner}\n\n`;
  }

  /**
   * 代码块：先占位成 token 存进 ctx.codeBlocks，
   * 收尾整理时原样还原，避免空白被 tidy 动到。
   */
  function serializePre(el, ctx) {
    const codeEl = el.querySelector('code') || el;
    const text = String(codeEl.textContent || '').replace(/^\n+|\n+$/g, '');
    if (!text) return '';

    const classes = `${codeEl.getAttribute('class') || ''} ${el.getAttribute('class') || ''}`;
    const langMatch = /(?:language-|lang-)([\w+#.-]+)/.exec(classes);
    const lang = langMatch ? langMatch[1] : '';

    const fence = fenceFor(text);
    const block = `${fence}${lang}\n${text}\n${fence}`;
    const token = `\u0000CODE${ctx.codeBlocks.length}\u0000`;
    ctx.codeBlocks.push(block);

    return `\n\n${token}\n\n`;
  }

  function serializeBlockquote(el, ctx, depth) {
    const inner = tidyInline(serializeChildren(el.childNodes, ctx, depth + 1));
    if (!inner) return '';
    const quoted = inner
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
    return `\n\n${quoted}\n\n`;
  }


  function serializeList(el, ctx, depth) {
    const ordered = el.tagName === 'OL';
    let index = parseInt(el.getAttribute('start') || '1', 10);
    if (!Number.isFinite(index) || index < 0) index = 1;

    const items = Array.from(el.children).filter((child) => child.tagName === 'LI');
    if (!items.length) {
      const fallback = tidyInline(serializeChildren(el.childNodes, ctx, depth + 1));
      return fallback ? `\n\n${fallback}\n\n` : '';
    }

    const bullet = depth % 2 === 0 ? '- ' : '* ';
    const lines = [];

    for (const li of items) {
      const marker = ordered ? `${index++}. ` : bullet;
      const pad = ' '.repeat(marker.length);
      const { own, nested } = splitListItem(li, ctx, depth);

      const ownLines = tidyInline(own).split('\n');
      lines.push(marker + (ownLines.shift() || ''));
      for (const line of ownLines) lines.push(line ? pad + line : '');

      for (const block of nested) {
        for (const line of block.split('\n')) {
          lines.push(line ? pad + line : '');
        }
      }
    }

    return `\n\n${lines.join('\n')}\n\n`;
  }

  /** 把 <li> 自身内容与嵌套列表拆开 */
  function splitListItem(li, ctx, depth) {
    let own = '';
    const nested = [];

    for (const child of li.childNodes) {
      if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          nested.push(serializeList(child, ctx, depth + 1).trim());
          continue;
        }
        if (BLOCK_TAGS.has(tag)) {
          const blockText = tidyInline(serializeChildren(child.childNodes, ctx, depth + 2));
          if (blockText) own += (own ? ' ' : '') + blockText;
          continue;
        }
      }
      own += serializeNode(child, ctx, depth + 1);
    }

    return { own, nested };
  }

  /** 单元格内容：Markdown 表格塞不下嵌套表格，这里退化成本行文本 */
  function serializeTableCell(cell, ctx, depth) {
    const hasNestedTable = !!cell.querySelector('table');
    let raw = '';

    if (hasNestedTable) {
      for (const child of cell.childNodes) {
        if (
          child.nodeType === 1 &&
          (child.tagName === 'TABLE' || (child.querySelector && child.querySelector('table')))
        ) {
          raw += ` ${normalizeText(child.textContent)} `;
        } else {
          raw += serializeNode(child, ctx, depth + 2);
        }
      }
    } else {
      raw = serializeChildren(cell.childNodes, ctx, depth + 2);
    }

    return tidyInline(raw).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  }

  function serializeTable(el, ctx, depth) {
    // 只取本表格的行，避免把嵌套表格的行拍到外层
    const rows = Array.from(
      el.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')
    );
    if (!rows.length) return '';

    const grid = rows
      .map((tr) =>
        Array.from(tr.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
          serializeTableCell(cell, ctx, depth)
        )
      )
      .filter((row) => row.length > 0);

    if (!grid.length) return '';

    const columns = Math.max(...grid.map((row) => row.length));
    const normalized = grid.map((row) => {
      const copy = row.slice();
      while (copy.length < columns) copy.push('');
      return copy;
    });

    const header = normalized.shift();
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...normalized.map((row) => `| ${row.join(' | ')} |`)
    ];

    return `\n\n${lines.join('\n')}\n\n`;
  }

  /* ---------------------------------------------------------------- */
  /* 收尾整理                                                          */
  /* ---------------------------------------------------------------- */

  /** 代码块已换成 token，这里只整理普通文本，再把代码块原样放回 */
  function tidy(markdown, codeBlocks) {
    const text = String(markdown || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/(\n\n+)[ \t]+/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');

    return text
      .replace(/\u0000CODE(\d+)\u0000/g, (_all, index) => codeBlocks[Number(index)] || '')
      .trim();
  }

  /**
   * 把当前选区转成 Markdown
   * @param {Selection} selection
   * @param {object} settings
   * @returns {string}
   */
  function convertToMarkdown(selection, settings) {
    if (!selection || selection.rangeCount === 0) return '';

    const ctx = { ...CAM_DEFAULTS, ...(settings || {}), codeBlocks: [] };
    const range = selection.getRangeAt(0);

    // 选区整段落在 <pre> 里：外层结构被 range 截断，直接整体包代码块
    const pre = closestTag(range.startContainer, 'pre');
    if (pre && pre.contains(range.endContainer)) {
      const text = String(selection.toString() || pre.textContent || '').replace(/\n+$/, '');
      if (!text) return '';
      const fence = fenceFor(text);
      return `${fence}\n${text}\n${fence}`;
    }

    const fragment = range.cloneContents();
    return tidy(serializeChildren(fragment.childNodes, ctx, 0), ctx.codeBlocks);
  }


  /* ---------------------------------------------------------------- */
  /* 剪贴板                                                            */
  /* ---------------------------------------------------------------- */

  async function copyToClipboard(text) {
    // 1) 现代 API（需要安全上下文 + 页面聚焦）
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* 继续走 fallback */
    }

    // 2) execCommand fallback（http 页面、页面未聚焦时）
    let textarea = null;
    const savedRanges = [];
    const selection = window.getSelection();

    try {
      if (selection) {
        for (let i = 0; i < selection.rangeCount; i++) {
          savedRanges.push(selection.getRangeAt(i).cloneRange());
        }
      }

      textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      (document.body || document.documentElement).appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      // 关键修复：原版忽略了这个返回值，导致“提示成功但其实没复制”
      return document.execCommand('copy') === true;
    } catch {
      return false;
    } finally {
      if (textarea && textarea.parentNode) textarea.remove();
      if (selection && savedRanges.length) {
        try {
          selection.removeAllRanges();
          savedRanges.forEach((range) => selection.addRange(range));
        } catch {
          /* 选区已失效，忽略 */
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 页面提示                                                          */
  /* ---------------------------------------------------------------- */

  function ensureToastStyle() {
    if (document.getElementById('copy-as-markdown-style')) return;

    const style = document.createElement('style');
    style.id = 'copy-as-markdown-style';
    style.textContent = `
      @keyframes cam-slide-in {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes cam-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showNotification(message, detail) {
    try {
      ensureToastStyle();

      const toast = document.createElement('div');
      toast.setAttribute('data-copy-as-markdown-toast', '');
      toast.style.cssText = [
        'position:fixed',
        'top:20px',
        'right:20px',
        'z-index:2147483647',
        'max-width:320px',
        'padding:10px 14px',
        'border-radius:8px',
        'background:#2e7d32',
        'color:#fff',
        'font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'box-shadow:0 4px 16px rgba(0,0,0,.24)',
        'animation:cam-slide-in .18s ease'
      ].join(';');

      const title = document.createElement('div');
      title.textContent = message;
      toast.appendChild(title);

      if (detail) {
        const sub = document.createElement('div');
        sub.textContent = detail;
        sub.style.cssText = 'margin-top:2px;font-size:11px;opacity:.85;';
        toast.appendChild(sub);
      }

      (document.body || document.documentElement).appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'cam-fade-out .2s ease forwards';
        setTimeout(() => toast.remove(), 220);
      }, 1600);
    } catch {
      /* 提示失败不影响复制本身 */
    }
  }

  /* ---------------------------------------------------------------- */
  /* 消息处理                                                          */
  /* ---------------------------------------------------------------- */

  async function handleCopySelection(settings) {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return { success: false, error: 'NO_SELECTION' };
    }

    let markdown = '';
    try {
      markdown = convertToMarkdown(selection, settings);
    } catch (error) {
      return { success: false, error: `CONVERT_FAILED: ${error && error.name}` };
    }

    if (!markdown) {
      return { success: false, error: 'EMPTY_RESULT' };
    }

    let copied = false;
    try {
      copied = await copyToClipboard(markdown);
    } catch {
      copied = false;
    }

    if (!copied) {
      return { success: false, error: 'CLIPBOARD_FAILED' };
    }

    if (!settings || settings.showNotification !== false) {
      showNotification('已复制为 Markdown', `${markdown.length} 个字符`);
    }

    return { success: true, markdown, chars: markdown.length };
  }

  // 监听器只注册一次（本文件可能被反复注入）
  if (!globalThis.__copyAsMarkdownListenerRegistered) {
    globalThis.__copyAsMarkdownListenerRegistered = true;

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (!request || request.action !== 'COPY_SELECTION') return false;

      handleCopySelection(request.settings)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, error: String(error && error.message) }));

      return true;
    });
  }

  // 供调试 / 自动化测试使用（content script 的 isolated world，页面脚本看不到）
  const api = (globalThis.__copyAsMarkdown = globalThis.__copyAsMarkdown || {});
  api.version = '2.0.7';
  api.convertToMarkdown = convertToMarkdown;
})();

