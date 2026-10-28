/**
 * background.js 行为回归测试（vm 沙箱模拟 MV3 service worker）
 * 运行：cd tests && npm install && npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULTS = {
  enabled: true,
  convertLinks: true,
  convertImages: true,
  convertHeadings: false,
  preserveFormatting: true,
  showNotification: true
};

function makeWorker({ store = {}, sendMessageImpl, ...opts } = {}) {
  const calls = { removeAll: 0, create: [], sendMessage: 0, executeScript: 0, badge: [] };
  const listeners = {};
  const changeListeners = [];
  const fail = (name) => new Error(`${name} failed`);

  const chrome = {
    storage: {
      sync: {
        get: opts.storageThrows
          ? () => { throw fail('storage.get'); }
          : async (keys) => {
              if (opts.storageRejects) throw fail('storage.get');
              const out = {};
              for (const key of [].concat(keys)) if (key in store) out[key] = store[key];
              return out;
            },
        set: opts.storageThrows
          ? () => { throw fail('storage.set'); }
          : async (value) => { Object.assign(store, value); },
        remove: async () => {}
      },
      onChanged: { addListener: (fn) => changeListeners.push(fn) }
    },
    contextMenus: {
      removeAll: (cb) => {
        calls.removeAll++;
        calls.create = []; // 真实 removeAll 会清掉所有菜单，桩也要同步
        if (opts.menusThrow) throw fail('contextMenus.removeAll');
        if (opts.menusNeverCallback) return;
        if (cb) cb();
      },
      create: (options, cb) => {
        calls.create.push(options);
        if (opts.menusThrow) throw fail('contextMenus.create');
        if (opts.menusNeverCallback) return;
        if (cb) cb();
      },
      onClicked: { addListener: (fn) => { listeners.clicked = fn; } }
    },
    action: {
      setBadgeBackgroundColor: opts.badgeRejects ? () => Promise.reject(fail('badgeBg')) : async () => {},
      setBadgeText: (options) => {
        calls.badge.push(options.text);
        return opts.badgeRejects ? Promise.reject(fail('badgeText')) : Promise.resolve();
      },
      setTitle: () => Promise.resolve()
    },
    scripting: {
      executeScript: async () => {
        calls.executeScript++;
        if (opts.injectRejects) throw fail('executeScript');
        return undefined;
      }
    },
    runtime: {
      onInstalled: { addListener: (fn) => { listeners.installed = fn; } },
      onStartup: { addListener: (fn) => { listeners.startup = fn; } },
      onMessage: { addListener: (fn) => { listeners.message = fn; } },
      lastError: undefined
    },
    tabs: {
      sendMessage: async (...args) => {
        calls.sendMessage++;
        if (sendMessageImpl) return sendMessageImpl(...args);
        if (opts.messageRejects) throw fail('sendMessage');
        return opts.messageFails ? { success: false, error: 'NO_SELECTION' } : { success: true };
      }
    }
  };

  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    Promise,
    URL
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  return {
    calls,
    listeners,
    emitChange(next) {
      changeListeners.forEach((fn) => fn({ copy_as_markdown: { newValue: next } }, 'sync'));
    }
  };
}

test('菜单随 enabled 实时创建 / 移除', async () => {
  const worker = makeWorker();
  await sleep(60);
  assert.deepEqual(worker.calls.create.map((menu) => menu.id), ['copy-as-markdown']);

  worker.emitChange({ ...DEFAULTS, enabled: false });
  await sleep(60);
  assert.equal(worker.calls.create.length, 0, '禁用后不应存在菜单');

  worker.emitChange({ ...DEFAULTS, enabled: true });
  await sleep(60);
  assert.equal(worker.calls.create.length, 1, '重新启用后菜单应恢复');
});

test('正常页面：只发消息，不注入，显示 ✓', async () => {
  const worker = makeWorker();
  await sleep(60);
  await worker.listeners.clicked({ menuItemId: 'copy-as-markdown' }, { id: 1 });
  await sleep(80);

  assert.equal(worker.calls.sendMessage, 1);
  assert.equal(worker.calls.executeScript, 0, '正常页面不该重新注入');
  assert.deepEqual(worker.calls.badge, ['✓']);
});

test('老标签页：首次 sendMessage 失败后自动注入并重试', async () => {
  let attempt = 0;
  const worker = makeWorker({
    sendMessageImpl: () => {
      attempt++;
      if (attempt === 1) {
        return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
      }
      return Promise.resolve({ success: true });
    }
  });
  await sleep(60);
  await worker.listeners.clicked({ menuItemId: 'copy-as-markdown' }, { id: 2 });
  await sleep(100);

  assert.equal(worker.calls.executeScript, 1, '应注入一次 content.js');
  assert.equal(worker.calls.sendMessage, 2, '注入后应重试一次');
  assert.deepEqual(worker.calls.badge, ['✓']);
});

test('受限页面（注入也失败）给出 ✕ 反馈', async () => {
  const worker = makeWorker({ messageRejects: true, injectRejects: true });
  await sleep(60);
  await worker.listeners.clicked({ menuItemId: 'copy-as-markdown' }, { id: 3 });
  await sleep(120);

  assert.equal(worker.calls.executeScript, 1, '应尝试过一次注入');
  assert.deepEqual(worker.calls.badge, ['✕']);
});

test('禁用状态下点击不发消息，只显示 OFF', async () => {
  const worker = makeWorker({ store: { copy_as_markdown: { ...DEFAULTS, enabled: false } } });
  await sleep(60);
  await worker.listeners.clicked({ menuItemId: 'copy-as-markdown' }, { id: 4 });
  await sleep(80);

  assert.equal(worker.calls.sendMessage, 0);
  assert.deepEqual(worker.calls.badge, ['OFF']);
});

test('内容脚本返回失败时显示 ✕', async () => {
  const worker = makeWorker({ messageFails: true });
  await sleep(60);
  await worker.listeners.clicked({ menuItemId: 'copy-as-markdown' }, { id: 5 });
  await sleep(80);

  assert.deepEqual(worker.calls.badge, ['✕']);
});

test('对抗性：storage / contextMenus / badge 全部异常时不产生未捕获拒绝', async () => {
  const unhandled = [];
  const onRejection = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onRejection);

  try {
    const scenarios = [
      { storageThrows: true },
      { storageRejects: true },
      { menusThrow: true },
      { badgeRejects: true },
      { messageRejects: true, injectRejects: true }
    ];

    for (const scenario of scenarios) {
      const worker = makeWorker(scenario);
      await sleep(50);
      worker.emitChange({ ...DEFAULTS, enabled: true });
      await worker.listeners.clicked({ menuItemId: 'copy-as-markdown' }, { id: 6 });
      await sleep(60);
    }

    await sleep(150);
    assert.deepEqual(unhandled, [], '出现了未捕获的 Promise 拒绝');
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});

test('看门狗：contextMenus 永不回调时队列不会永久卡死', async () => {
  const worker = makeWorker({ menusNeverCallback: true });
  await sleep(80);
  assert.equal(worker.calls.create.length, 0, '回调未触发时 create 尚未被调用');

  await sleep(2300);
  assert.equal(worker.calls.create.length, 1, '看门狗应在超时后继续队列');
});

test('GET_SETTINGS 在 storage 不可用时回退默认值', async () => {
  const worker = makeWorker({ storageThrows: true });
  await sleep(60);

  const reply = await new Promise((resolve) => {
    worker.listeners.message({ action: 'GET_SETTINGS' }, {}, resolve);
    setTimeout(() => resolve(null), 300);
  });

  // vm 沙箱里创建的对象原型与本 realm 不同，deepStrictEqual 会因原型不一致失败
  assert.deepEqual(JSON.parse(JSON.stringify(reply)), { settings: DEFAULTS });
});

