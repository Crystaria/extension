# Copy as Markdown 排查报告

- 仓库：https://github.com/Crystaria/extension
- 克隆位置：`/Users/liaoyoulan/.cline/data/workspaces/chat/copy-as-markdown`
- 扩展代码：`copy-as-markdown-v2.0.6-clean/`（manifest 里写的是 1.0.1）
- 修复版：`copy-as-markdown-fixed/`（新增，原目录未改动）
- 排查日期：2026-10-28
- 测试环境：macOS + Chrome 156.0.8078.48 + Node 24.13

## 结论先说

扩展**能被 Chrome 正常加载**（manifest 合法、图标合法、service worker 零异常），
但它有若干功能性硬伤，表现就是「右键点了没反应」或者「复制出来的东西糊成一团」。
最致命的三条：

1. **仓库根目录没有 `manifest.json`**，直接对仓库根目录「加载已解压的扩展程序」必然报
   `Manifest file is missing or unreadable`，必须手动选进 `copy-as-markdown-v2.0.6-clean/`。
2. **右键菜单只在安装/浏览器启动时创建一次**，设置里的「Enable Extension」开关完全无效；
   关掉再打开之后菜单再也回不来（实测确认）。
3. **老标签页 / 受限页面点击菜单后静默失败**：manifest 没有 `scripting` 权限，没有按需注入兜底，
   错误只 `console.error`，界面上什么提示都没有，所以「看起来就是没反应」。

---

## 实测方法与证据

正式版 Chrome 从 137 起屏蔽了 `--load-extension`，所以改用 CDP 的 `Extensions.loadUnpacked`：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --user-data-dir=/tmp/cam-profile3 \
  --enable-unsafe-extension-debugging --remote-debugging-port=9224 about:blank
# 然后通过 CDP Extensions.loadUnpacked + Runtime.evaluate 验证
```

原版加载结果：

```
[1] Extensions.loadUnpacked -> {"id":"dfekggbblljjmkflknknpgmockbnnjgm"}   # 加载成功
[2] service worker 未捕获异常数: 0                                          # 启动正常
[4] SW 环境探测 -> {"hasContextMenus":true,"hasScripting":false,...}        # 没有 scripting 权限
```

原版 vs 修复版，同一段网页内容在真实 Chrome DOM 里的转换结果：

````
原版：
## Hello World

first with **bold** and a [link](https://example.com/a).
second with [bold link](https://example.com/b).
onetwonested          <-- 两个 <li> 和嵌套列表粘在一起
const a = 1;          <-- 代码块围栏丢失
KVx1                  <-- 表格拍扁
price 3 * 4           <-- 未转义，可能被当成斜体

修复版：
## Hello World

first with **bold** and a [link](https://example.com/a).

second with [**bold link**](https://example.com/b).

- one
- two
  * nested

```js
const a = 1;
```

| K | V |
| --- | --- |
| x | 1 |

price 3 \* 4
````

---

## 问题清单

### P0：直接导致「用不了」

| # | 问题 | 位置 | 说明 |
| --- | --- | --- | --- |
| 1 | 根目录无 manifest | 仓库结构 | 用户对着仓库根目录加载扩展直接失败；真正的扩展在子目录里 |
| 2 | 右键菜单不随设置变化 | `background.js:68-84` | `initialize()` 只在 onInstalled/启动时跑，`enabled=false` 不 `removeAll` |
| 3 | 关掉再打开，菜单永久消失 | `background.js:120-129` | 只监听 onInstalled，没有 `storage.onChanged`；SW 重启后再也不会重建 |
| 4 | 设置缓存不失效 | `background.js:23-46` | `settingsCache` 常驻 SW，popup 改设置后复制仍用旧值（实测：禁用后仍发消息） |
| 5 | 老标签页静默失败 | `background.js:95` | 安装前就打开的标签页没有 content script，`sendMessage` 抛 `Receiving end does not exist`，被 catch 后只打日志 |
| 6 | 缺少 `scripting` 权限 | `manifest.json:9-13` | 无法兜底注入；PRIVACY.md 却宣称用了 scripting |
| 7 | 复制失败无任何 UI 反馈 | `background.js:108-113` | 用户只看到「右键点了没反应」 |

### P1：复制结果质量

| # | 问题 | 说明 |
| --- | --- | --- |
| 8 | 段落之间没有空行 | `processNode` 只拼接文本，`<p>` 之间不产生分隔 |
| 9 | `<li>` 全部粘连 | `<ul><li>Item one</li><li>Item two</li></ul>` → `Item oneItem two` |
| 10 | `<br>` 直接消失 | `Line one<br>Line two` → `Line oneLine two` |
| 11 | 代码块围栏丢失 | `<pre><code>` 只输出纯文本，缩进和语言标记都没了 |
| 12 | 表格/引用/分割线完全丢失 | 没有对应分支 |
| 13 | 嵌套格式丢失 | `<a><b>x</b></a>` → `[x](url)`，加粗被吃掉 |
| 14 | 不转义 Markdown 特殊字符 | 页面里的 `3 * 4`、`snake_case` 会被 Markdown 渲染吃掉 |
| 15 | 剪贴板假成功 | `content.js:126` 忽略 `document.execCommand('copy')` 的返回值，失败也 return true，然后弹「Copied!」 |
| 16 | `document.head` 为空时整体失效 | `content.js:173` 在注册消息监听器之前就 `document.head.appendChild`，XML/无 head 文档会抛错，导致该标签页永久「收不到消息」 |

### P1：死代码 / 自相矛盾

| # | 问题 | 说明 |
| --- | --- | --- |
| 17 | `modules/` 目录完全没有被引用 | manifest、content.js、popup.js 都不 import 它 |
| 18 | `modules/settings.js` 一调用就崩 | 用了未导入的 `eventBus`：实测 `ReferenceError: eventBus is not defined` |
| 19 | `modules/markdown.js` 输入类型不对 | 它对 HTML 字符串做正则，但 `getSelectionData()` 传给它的是纯文本，图片/标题/加粗分支永远不会命中 |

### P2：发布/合规

| # | 问题 | 说明 |
| --- | --- | --- |
| 20 | 版本号四处不一致 | 文件夹 `v2.0.6`、manifest `1.0.1`、popup `v1.0.0`、README `2.0.4`。上架后想更新版本会被 Web Store 拒 |
| 21 | 链接全是 404 | `homepage_url`、popup 页脚、PRIVACY.md 都指向 `github.com/copy-as-markdown/extension`（实测 404），真实仓库是 `Crystaria/extension` |
| 22 | 图标是纯色占位图 | 三个 png 都只有 1 种颜色 `#3498db`（实测像素统计） |
| 23 | 没有 LICENSE | README 写 AGPL-3.0，仓库里没有 license 文件 |
| 24 | 权限声明与隐私文档不一致 | PRIVACY 写了 `scripting`、`clipboardWrite`，manifest 里都没有；声明的 `activeTab` 又完全没用 |
| 25 | 与「隐私优先」自相矛盾 | `content_scripts` 静态注入 `<all_urls>`，安装时会提示「读取和更改您在所有网站上的所有数据」 |
| 26 | `CLAUDE.md` 泄漏内部信息 | 写着 `/home/admin/.openclaw/workspace/...`、协调人「小爪」等，不该出现在公开仓库 |
| 27 | commit 全是 “Add files via upload” | 网页上传，无历史可追溯 |

### P3：能力边界

| # | 问题 | 说明 |
| --- | --- | --- |
| 28 | iframe 内选区不支持 | 没有 `all_frames`，`window.getSelection()` 只看顶层文档 |
| 29 | Shadow DOM 拿不到内容 | 现代站点（YouTube/Reddit 等）大量使用，`getSelection()` 结果可能为空 → 报 “No text selected” |
| 30 | `minimum_chrome_version: 88` 不准确 | 代码用了 MV3 + Promise 版 API，实际需要 102+ |

---

## 修复版做了什么

`copy-as-markdown-fixed/` 是针对上面 P0/P1 的重写，不改动原目录：

- **manifest**：去掉静态 `content_scripts`，改为 `activeTab + scripting` 按需注入；
  补齐 `scripting` 权限、版本统一 2.0.7、`homepage_url` 指向真实仓库、`minimum_chrome_version` 提到 102
- **background**：`storage.onChanged` 实时同步设置；菜单随 `enabled` 创建/移除（串行化防并发踩踏）；
  发送失败自动 `executeScript` 注入后重试；成功/失败/禁用用 badge `✓ / ✕ / OFF` 反馈
- **content**：转换器重写为递归序列化，支持段落、`<br>` 硬换行、有序/无序/嵌套列表、
  围栏代码块（带语言）、引用、GitHub 表格、嵌套格式、最小化 Markdown 转义；
  监听器只注册一次；剪贴板 fallback 检查返回值并恢复原选区
- **popup**：版本号修正、链接修正、启用开关即时生效
- **删除** `modules/` 死代码

## 验证结果

1. `node --check` 三个脚本全部通过；manifest JSON 合法且引用文件齐全
2. jsdom 真实 DOM 转换断言 **14/14 通过**（段落空行、列表、嵌套、`start`、
   硬换行、代码围栏、引用、表格、图片、嵌套加粗链接、转义、标题）
3. vm 沙箱模拟 MV3 生命周期：开关联动 / 老标签页兜底注入 / 受限页面 badge / 禁用拦截，全部符合预期
4. 真实 Chrome 156 `Extensions.loadUnpacked` 加载成功，service worker 零未捕获异常，
   真实 DOM 转换输出与 jsdom 一致
5. 真实 Chrome 里打开 `chrome-extension://<id>/popup.html`：版本号 `v2.0.7`、
   6 个开关按默认值渲染、点击保存写入 storage、0 个未捕获异常

## 怎么用

1. 打开 `chrome://extensions` → 打开「开发者模式」
2. 「加载已解压的扩展程序」→ 选择 `copy-as-markdown-fixed/`
3. 刷新网页 → 选中文字 → 右键 → `Copy as Markdown`

## 还差什么（需要作者决定）

- 图标仍是原仓库的纯色占位图，上架需要真图标
- LICENSE 文件缺失（README 声称 AGPL-3.0）
- iframe / Shadow DOM 选区仍未支持


---

# 第二轮验收（工程细节复核）

针对「动态注入与权限降级」「递归边界」「资产与合规」三个问题，逐条过代码并做实测。

## 1. 动态注入与权限降级

**结论：原本不完整，已补齐；现在 9 类异常场景下 0 未捕获拒绝。**

复核时发现的具体缺口与处理：

| 风险点 | 复核前 | 现在 |
| --- | --- | --- |
| `syncContextMenu()` 在 onStartup / storage.onChanged / 顶层三处 fire-and-forget | 若 `doSyncContextMenu` 抛错会产生未捕获拒绝 | 队列末端统一 `.catch()`，SW 里不会出现 unhandled rejection |
| `contextMenus.removeAll/create` 是回调式 API | 回调万一不触发，队列永久卡死 | `withTimeout` 看门狗（2s），超时后继续队列 |
| `handleCopy` 外层 catch | 只 `console.error`，用户无感 | 追加 badge `✕`，异常路径也有可见反馈 |
| `GetSettings` 消息通道 | `sendResponse` 在通道已关闭时会抛 | `.then/.catch` 双分支 + try/catch，回退默认值 |
| `onInstalled` 异步监听器 | 抛错会变成未捕获拒绝 | 整体 try/catch |
| 受限页面（`chrome://`、应用商店、PDF、file://） | 注入失败只写日志 | 注入失败 → badge `✕`；脚本注入成功但消息失败 → 也是 `✕` |
| badge API 本身失败 | 已 try/catch | 不变，且 `setBadgeText` 的 Promise 拒绝也被吞掉 |

**实测（`tests/background.test.mjs`）**：把 storage / contextMenus / badge / sendMessage / executeScript 全部改成同步抛错或 Promise 拒绝，跑 5 组场景 + 并发点击，
`process.on('unhandledRejection')` 计数为 **0**；回调永不触发时看门狗在 2s 后放行队列。

复核中还发现一个**我自己引入的噪声 bug**：`Promise.race` 赢了之后没有清定时器，
导致每次菜单同步 2 秒后都会打印一条假的「超时」。已改为 `race(...).finally(clearTimeout)`，
实测 SW 控制台干净了。

顺带确认了 Chrome 156 里 `contextMenus` **只支持回调、不返回 Promise**
（实测 `removeAll()` 返回 `undefined`、回调 600ms 内触发），所以现有回调式写法是对的。

## 2. 转换器递归边界

**结论：存在真实的爆栈点，已加护栏；现在最坏情况是"内容退化"而不是"失败"。**

实测数据（真实 Chrome 156，同一段 DOM）：

| 场景 | 复核前 | 现在 |
| --- | --- | --- |
| 200 / 1000 / 3000 / 6000 层嵌套 div | 8 / 7 / 41 / 149 ms，通过 | 8 / 5 / 20 / 42 ms，通过 |
| 10000 层 | **RangeError（1016ms 后失败）** | 通过（900ms） |
| 20000 / 40000 层 | RangeError | 通过（3.1s / 9.0s） |
| 3000×5 表格 | 89ms | 72ms |
| 约 1MB 纯文本选区 | 52ms | 81ms |

处理方式：

1. **深度上限 120**：超过后该节点直接退化为纯文本（`flattenText`），保证任何 DOM 都不会爆栈；
2. 深层耗时的大头其实是浏览器自己的 `range.cloneContents()`（10000 层约 900ms），
   这属于浏览器开销，不再由我们的递归放大；
3. 未做防抖：连续点击是幂等的（重复注入已安全），加防抖反而会吞掉用户的第二次真实意图；
4. 单节点文本上限 20 万字符，防止单个畸形文本节点拖慢整体。

**顺带修掉的三个真实缺陷（都是这轮实测暴露的）**：

- **重复注入抛 `SyntaxError: Identifier 'CAM_DEFAULTS' has already been declared`**
  → 整个文件包进 IIFE，顶层不再有 `const/let`；实测连续执行两次均成功。
  这个在"快速双击右键菜单"或"注入成功但消息失败后重试"时会真实踩到。
- **代码块内容里出现 ``` 时围栏被提前闭合**
  → 按内容里最长反引号串动态加长围栏；实测输出 ```` 四反引号。
- **嵌套表格被拍扁并二次转义**
  → 只取 `:scope` 的行/单元格，单元格内的嵌套表格退化为单行文本，外层表格结构不被破坏。

另外修掉一个自己写的低级 bug：转义正则的字符类多了一个 `]`，导致 `*`/`_`/`[]` **完全没被转义**；
现已改为查表实现（并保留"纯文本快速返回"路径），有单测覆盖。

## 3. 资产与合规收尾（工期评估）

工作量评估（按 1 人、熟悉这套代码计）：

| 项目 | 工作量 | 说明 |
| --- | --- | --- |
| 三个尺寸真图标（16/48/128）+ 商店素材 | 0.5–1 人日 | 图标是纯色占位图，Web Store 虽能过，但观感/可信度差 |
| LICENSE 文件 | 0.5 小时 | **需要仓库所有者拍板**：README 声称 AGPL-3.0，但仓库里没有许可证文本；严格说上游"保留所有权利"，fork 分发前需上游授权或改用兼容许可 |
| 修掉 404 链接（homepage_url / popup 页脚 / PRIVACY） | 0.5 小时 | 商店要求隐私政策 URL 可访问 |
| 把 `tests/` 接入 CI（GitHub Actions 跑 `npm test`） | 0.5 人日 | 本轮已把测试放进仓库，只差 CI 配置 |
| iframe 内选区支持 | 0.5–1 人日 | `executeScript({ allFrames: true })` + 逐帧探测选区 + `frameId` 定向发送；跨域 iframe 受 `activeTab` 限制，可能需要升级 `host_permissions`（会触发权限提示+重新审核） |
| Shadow DOM 选区支持 | 1–2 人日 | `getSelection()` 不穿透 shadow root，需要 `getComposedRanges()` + 手动遍历兜底，测试面较大 |

合计：

- **阻塞上架的收尾（图标 + LICENSE + 链接）≈ 1 人日**
- **可上架后再补的功能（iframe + Shadow DOM + CI）≈ 2–3 人日**，建议放到 2.1.0

## 4. 回归测试已入库

```
tests/
├── package.json
├── README.md
├── converter.test.mjs
└── background.test.mjs
```

```bash
cd tests && npm install && npm test
# ✔ 14/14 passing
```

测试放在扩展目录**之外**，不会被打包进扩展。


---

# 最终结论（定稿）

**状态：v2.0.7 代码冻结，已合入 `main`。**

## 仓库结构（生产路径 = 仓库根目录）

合入时把扩展提到根目录，顺手消掉了原报告里的 P0-1「根目录没有 manifest」：

```
manifest.json  background.js  content.js  popup.html  popup.js  style.css  icons/
tests/         回归测试（14 项，不随扩展打包）
scripts/       pack.sh —— 只打包扩展运行文件
legacy/        上游 v2.0.6 原始快照（仅对照用，确认稳定后可删）
REPORT.md / CHANGELOG.md / PRIVACY.md / README.md
```

- 加载方式：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → **选仓库根目录**
- 打包方式：`./scripts/pack.sh` → `dist/copy-as-markdown-2.0.7.zip`（实测 10 个文件 / 38 KB，
  不含 tests、legacy、文档）

## 阻塞项处理状态

| 项 | 决策 | 状态 |
| --- | --- | --- |
| 404 的 `homepage_url` / 隐私政策链接 | 立即修 | ✅ 已修：manifest、popup 页脚、PRIVACY.md、README 全部指向 `Crystaria/extension`；实测三个 URL 全部 **200** |
| 图标为纯色占位图 | 不阻塞今日灰度 | ⏳ 沿用占位图，2.1.0 前替换（打包脚本已把 `icons/` 纳入白名单） |
| LICENSE 缺失 | owner 补标准 AGPL-3.0 丢根目录 | ⏳ 待提交；README 已引用 `LICENSE` |
| CI | 测试已入库 | ⏳ 待接 workflow（`cd tests && npm test`） |
| `CLAUDE.md` 含内部路径 | 未在本次范围 | ⏳ 建议公开前删除或移出仓库 |

## 合入后的最终验证快照

| 验证项 | 结果 |
| --- | --- |
| `node --check` × 3 | OK |
| manifest JSON + 引用文件完整性 | 无缺失，version 2.0.7 |
| `tests/` 全量 | **14 / 14 passing**（converter 5 + background 9） |
| 真实 Chrome 156 从**根目录**加载 | 扩展 id 正常分配，service worker **0 未捕获异常**，默认设置落盘 |
| 真实 Chrome 真实 DOM 转换 | 与 jsdom 断言一致 |
| 真实 Chrome 打开 `popup.html` | `v2.0.7`，6 个开关默认值正确，保存写入 storage，**0 异常** |
| `scripts/pack.sh` | 产出 zip，10 files，仅含运行文件 |
| 外链可达性 | GitHub / PRIVACY.md / Issues 均 200 |

## 灰度期建议观察项（3–5 天）

1. 复杂页面（GitHub issue、Notion、微信公众号、语雀）复制后的 Markdown 观感
2. 超长选区 / 超大表格的耗时（本次基线：1MB 文本 ≈ 80ms，3000×5 表格 ≈ 72ms）
3. 受限页面是否如预期给出 `✕` 而不是静默
4. 关闭再开启「启用扩展」后右键菜单是否即时恢复
5. 若用户报「没反应」，排查入口：`chrome://extensions` → 本扩展「服务工作进程」→ 控制台

## 2.1.0 backlog

- iframe 选区（`allFrames` + `frameId` 定向；跨域可能需要 `host_permissions`，会触发重新审核）
- Shadow DOM 选区（`getComposedRanges()` + 遍历兜底）
- 真图标 + 商店素材
- CI workflow
- 代码块语言识别增强（行号 / 高亮容器 class 变体）

