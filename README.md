# Copy as Markdown

A lightweight Chrome extension that turns any selection on a page into clean Markdown with one right-click.

Works great for pasting into Obsidian, Notion, GitHub, Jira, Slack, or an LLM chat window.

## Features

- **Blocks keep their structure** — paragraphs, `<br>` hard breaks, `<hr>`, blockquotes and fenced code blocks (with language tag)
- **Lists** — ordered / unordered / nested, `start` attribute respected
- **Tables** — GitHub-flavored Markdown, `|` escaped inside cells
- **Inline formatting** — bold, italic, strikethrough, inline code, and nesting such as `<a><b>x</b></a>` → `[**x**](url)`
- **Links & images** — resolved to absolute URLs; `data:` images degrade to their alt text
- **Light escaping** — `*`, `_`, `` ` ``, `[`, `]` are escaped so the result renders as written
- **Privacy first** — everything runs locally, no network access, no analytics
- **Cheap** — no build step, no framework, no runtime dependencies

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select **this repository's root folder** (the one containing `manifest.json`)
4. Select some text on any page → right-click → **Copy as Markdown**

Requires Chrome/Edge 102+.

## Usage

- The context-menu item only appears when there is a selection.
- Success shows a green toast and a `✓` badge; failures show `✕`; a disabled extension shows `OFF`.
- `Ctrl/Cmd + Shift + M` opens the settings popup.

### Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Enabled | on | Master switch; also adds/removes the context menu |
| Show copy notification | on | In-page toast after a successful copy |
| Convert links | on | `[text](url)` |
| Convert images | on | `![alt](url)` |
| Convert headings | off | `#` / `##` / `###` (off = bold text instead) |
| Preserve formatting | on | Keep bold / italic / strikethrough |

## Privacy

No data collection, no tracking, no external requests. See [PRIVACY.md](PRIVACY.md).

## Permissions and why

| Permission | Why |
| --- | --- |
| `contextMenus` | Add the right-click item |
| `storage` | Save the settings above |
| `activeTab` | Read the selection **only** on the tab where you invoke the extension |
| `scripting` | Inject the converter on demand (instead of on every page) |

There are no host permissions and no always-on content script, so the extension does not
read pages you never invoke it on.

## Development

```bash
cd tests
npm install
npm test          # 14 tests: converter (jsdom) + service worker (vm sandbox)
```

Packaging (clean zip with only the extension files):

```bash
./scripts/pack.sh   # -> dist/copy-as-markdown-<version>.zip
```

### Layout

```
manifest.json  background.js  content.js  popup.html  popup.js  style.css  icons/
tests/         regression tests (not shipped)
scripts/       packaging
legacy/        original v2.0.6 snapshot, reference only
REPORT.md      full audit report (Chinese): original extension + this rewrite
```

## Known limitations

- Selections inside `<iframe>` are not supported yet (top document only)
- Selections inside Shadow DOM depend on `getSelection()` and may come back empty
- DOM subtrees deeper than 120 levels degrade to plain text instead of failing
- `chrome://` pages, the Chrome Web Store and the built-in PDF viewer cannot be scripted

## License

AGPL-3.0 — see [LICENSE](LICENSE).

---

### 中文速览

选中网页内容 → 右键 → **Copy as Markdown**，即可得到干净的 Markdown。
`chrome://extensions` → 开启开发者模式 →「加载已解压的扩展程序」→ 选择本仓库根目录。
所有处理都在本地完成，不联网、不统计。
