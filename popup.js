/**
 * Copy as Markdown - popup
 *
 * 只负责读写 chrome.storage.sync 里的设置；
 * background 通过 storage.onChanged 监听变化并同步右键菜单。
 */

const MODULE_NAME = 'copy_as_markdown';

const DEFAULT_SETTINGS = {
  enabled: true,
  convertLinks: true,
  convertImages: true,
  convertHeadings: false,
  preserveFormatting: true,
  showNotification: true
};

function getInputs() {
  return Array.from(document.querySelectorAll('[data-setting]'));
}

function applyToUI(settings) {
  for (const input of getInputs()) {
    const key = input.dataset.setting;
    input.checked = Boolean(settings[key]);
  }
}

function readFromUI() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const input of getInputs()) {
    settings[input.dataset.setting] = input.checked;
  }
  return settings;
}

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(MODULE_NAME);
    const stored = result && result[MODULE_NAME] ? result[MODULE_NAME] : {};
    applyToUI({ ...DEFAULT_SETTINGS, ...stored });
  } catch (error) {
    console.error('[copy_as_markdown] 读取设置失败', error);
    showStatus('读取设置失败', 'error');
  }
}

async function saveSettingsFromUI() {
  try {
    await chrome.storage.sync.set({ [MODULE_NAME]: readFromUI() });
    showStatus('设置已保存', 'success');
  } catch (error) {
    console.error('[copy_as_markdown] 保存设置失败', error);
    showStatus('保存失败', 'error');
  }
}

async function resetSettingsFromUI() {
  try {
    await chrome.storage.sync.set({ [MODULE_NAME]: { ...DEFAULT_SETTINGS } });
    applyToUI(DEFAULT_SETTINGS);
    showStatus('已恢复默认设置', 'success');
  } catch (error) {
    console.error('[copy_as_markdown] 重置设置失败', error);
    showStatus('重置失败', 'error');
  }
}

function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;

  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status-message';
  }, 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  document.getElementById('saveBtn').addEventListener('click', saveSettingsFromUI);
  document.getElementById('resetBtn').addEventListener('click', resetSettingsFromUI);

  // 「启用扩展」开关即时生效，不用再点保存
  document.getElementById('enabled').addEventListener('change', saveSettingsFromUI);
});
