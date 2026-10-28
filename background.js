/**
 * Copy as Markdown - background service worker
 *
 * 关键点（都是原版出问题的地方）：
 *  1. 设置只在真正需要时读取（force），不再长期缓存到 service worker 里，
 *     并监听 storage.onChanged，使 popup 里的开关立即生效。
 *  2. 右键菜单随 enabled 变化实时创建/移除，而不是只在安装时创建一次。
 *  3. content script 改成“按需注入”：老标签页、刚安装后没刷新的页面也能用。
 *  4. 失败不再静默：用 action badge 给出 ✓ / ✕ / OFF 反馈。
 */

const MODULE_NAME = 'copy_as_markdown';
const MENU_ID = 'copy-as-markdown';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  convertLinks: true,
  convertImages: true,
  convertHeadings: false,
  preserveFormatting: true,
  showNotification: true
});

/** @type {Record<string, any> | null} */
let settingsCache = null;

function log(...args) {
  console.log(`[${MODULE_NAME}]`, ...args);
}

/**
 * 读取设置。force = true 时绕过缓存，直接读 storage。
 */
async function getSettings({ force = false } = {}) {
  if (!force && settingsCache) return settingsCache;

  let stored = null;
  try {
    const result = await chrome.storage.sync.get(MODULE_NAME);
    stored = result && result[MODULE_NAME] ? result[MODULE_NAME] : null;
  } catch (error) {
    console.warn(`[${MODULE_NAME}] storage.sync 读取失败，使用默认设置`, error);
  }

  settingsCache = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  return settingsCache;
}

/** popup 里保存设置后，storage.onChanged 会走到这里 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes[MODULE_NAME]) return;
  const next = changes[MODULE_NAME].newValue;
  settingsCache = next ? { ...DEFAULT_SETTINGS, ...next } : { ...DEFAULT_SETTINGS };
  log('设置已更新，同步右键菜单');
  syncContextMenu();
});

/* ------------------------------------------------------------------ */
/* 右键菜单                                                            */
/* ------------------------------------------------------------------ */

/**
 * 给回调式 API 加超时兜底：API 万一不回调，菜单队列也不会被永久挂住。
 * 正常完成时会清掉定时器，避免晚到的 setTimeout 打印假的“超时”。
 */
function withTimeout(promise, ms, label) {
  let timer = null;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      log(`${label} 超时，跳过等待`);
      resolve();
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  });
}

function removeAllMenus() {
  const task = new Promise((resolve) => {
    try {
      chrome.contextMenus.removeAll(() => resolve());
    } catch {
      resolve();
    }
  });
  return withTimeout(task, 2000, 'contextMenus.removeAll');
}

function createMenu() {
  const task = new Promise((resolve) => {
    try {
      chrome.contextMenus.create(
        {
          id: MENU_ID,
          title: 'Copy as Markdown',
          contexts: ['selection']
        },
        () => {
          // 重复 id 会设置 lastError，这里主动读掉避免 “Unchecked runtime.lastError”
          void chrome.runtime.lastError;
          resolve();
        }
      );
    } catch {
      resolve();
    }
  });
  return withTimeout(task, 2000, 'contextMenus.create');
}

let menuQueue = Promise.resolve();

async function doSyncContextMenu() {
  const { enabled } = await getSettings({ force: !settingsCache });
  await removeAllMenus();
  if (!enabled) {
    log('扩展已禁用，移除右键菜单');
    return;
  }
  await createMenu();
}

/** 串行化，避免并发初始化时 removeAll/create 互相踩踏 */
function syncContextMenu() {
  menuQueue = menuQueue
    .then(doSyncContextMenu, doSyncContextMenu)
    .catch((error) => {
      // 兜底：菜单同步失败绝不能变成未捕获的 Promise 拒绝
      console.warn(`[${MODULE_NAME}] 同步右键菜单失败:`, (error && error.message) || error);
    });
  return menuQueue;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (details.reason === 'install') {
      const result = await chrome.storage.sync.get(MODULE_NAME);
      if (!result[MODULE_NAME]) {
        await chrome.storage.sync.set({ [MODULE_NAME]: { ...DEFAULT_SETTINGS } });
        log('首次安装，写入默认设置');
      }
      settingsCache = null;
    }
  } catch (error) {
    console.warn(`[${MODULE_NAME}] 初始化设置失败`, (error && error.message) || error);
  }

  // syncContextMenu 内部已捕获异常，这里不会产生未处理的拒绝
  await syncContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  syncContextMenu();
});

// service worker 每次唤醒都会执行，幂等
syncContextMenu();

/* ------------------------------------------------------------------ */
/* 复制流程                                                            */
/* ------------------------------------------------------------------ */

async function flashBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
  } catch {
    /* 某些页面（如 chrome://）无法设置 badge，忽略 */
  }

  setTimeout(async () => {
    try {
      await chrome.action.setBadgeText({ tabId, text: '' });
    } catch {
      /* ignore */
    }
  }, 2500);
}

function sendCopyMessage(tabId, settings) {
  return chrome.tabs.sendMessage(tabId, {
    action: 'COPY_SELECTION',
    settings
  });
}

async function handleCopy(tab) {
  if (!tab || typeof tab.id !== 'number' || tab.id < 0) return;

  const settings = await getSettings({ force: true });

  if (!settings.enabled) {
    await flashBadge(tab.id, 'OFF', '#9e9e9e');
    return;
  }

  let response = null;

  try {
    response = await sendCopyMessage(tab.id, settings);
  } catch {
    // 页面里还没有 content script：老标签页 / 安装后未刷新 / 受限页面
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      response = await sendCopyMessage(tab.id, settings);
    } catch (error) {
      log('该页面无法注入脚本（chrome:// 、应用商店、PDF 阅读器等）:', error?.message || error);
      await flashBadge(tab.id, '✕', '#e53935');
      return;
    }
  }

  if (response && response.success) {
    await flashBadge(tab.id, '✓', '#43a047');
    return;
  }

  log('复制失败:', response && response.error);
  await flashBadge(tab.id, '✕', '#e53935');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  handleCopy(tab).catch((error) => {
    // 兜底：任何未预期异常都要给出可见反馈，而不是只在控制台里
    console.warn(`[${MODULE_NAME}] 复制流程异常:`, (error && error.message) || error);
    if (tab && typeof tab.id === 'number' && tab.id >= 0) {
      flashBadge(tab.id, '✕', '#e53935').catch(() => {});
    }
  });
});

// 供 popup 查询状态（可选，失败也无所谓）
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || request.action !== 'GET_SETTINGS') return false;

  getSettings({ force: true })
    .then((settings) => {
      try {
        sendResponse({ settings });
      } catch {
        /* 通道已关闭，忽略 */
      }
    })
    .catch(() => {
      try {
        sendResponse({ settings: { ...DEFAULT_SETTINGS } });
      } catch {
        /* 通道已关闭，忽略 */
      }
    });

  return true;
});
