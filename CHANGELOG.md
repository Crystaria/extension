# Changelog

## 2.0.7 — first maintainable release

Rewritten from the `v2.0.6-clean` snapshot (kept under `legacy/` for reference).

### Fixed — functional blockers

- **Context menu is now driven by settings.** It is created/removed on `storage.onChanged`
  instead of only at install/startup, so the "Enabled" switch works immediately and survives
  service-worker restarts.
- **Settings are no longer stale.** The service worker reads them fresh before each copy and
  invalidates its cache on change.
- **Old tabs work.** If `tabs.sendMessage` fails (tab opened before install, never refreshed),
  the extension injects `content.js` on demand via `chrome.scripting` and retries.
- **Failures are visible.** Badge shows `✓` / `✕` / `OFF`; previously everything failed silently
  in the console.
- **Clipboard fallback no longer lies.** `document.execCommand('copy')`'s return value is checked
  instead of always reporting success.

### Fixed — Markdown output

- Paragraphs are separated by blank lines (previously concatenated).
- `<br>` becomes a hard line break; `<hr>` becomes `---`.
- Ordered / unordered / nested lists keep markers and indentation; `start` is respected.
- `<pre><code>` becomes a fenced block, with the language tag taken from `class="language-…"`.
- Blockquotes become `> …`; tables become GitHub-flavored Markdown with `|` escaped in cells.
- Nested markdown is preserved: `<a><b>x</b></a>` → `[**x**](url)`.
- `*`, `_`, `` ` ``, `[`, `]` in text are escaped so the result renders literally.
- `data:` images degrade to their alt text instead of pasting kilobytes of base64.

### Fixed — robustness

- The whole content script is wrapped in an IIFE: re-injecting it no longer throws
  `SyntaxError: Identifier 'CAM_DEFAULTS' has already been declared`.
- Recursion is capped at 120 levels; deeper subtrees degrade to plain text instead of
  `RangeError: Maximum call stack size exceeded`.
- Code fences grow automatically when the code itself contains ```.
- Nested tables degrade to a single text cell instead of corrupting the outer table.
- `contextMenus` calls have a 2s watchdog, so an API that never calls back cannot stall the queue.
- All background promise chains are terminal-caught: adversarial testing (storage, contextMenus,
  badge, messaging all throwing) produces **zero** unhandled rejections.

### Changed

- Content script is injected on demand (`activeTab` + `scripting`) instead of being declared for
  `<all_urls>`; the extension no longer requests access to every site you visit.
- Dead `modules/` directory removed (it was never imported, and `modules/settings.js` threw
  `ReferenceError: eventBus is not defined` on first use).
- Version unified to `2.0.7` (manifest was `1.0.1`, popup `1.0.0`, README `2.0.4`, folder `2.0.6`).
- Links point to the real repository (`Crystaria/extension`) instead of the 404
  `copy-as-markdown/extension`.
- Added `tests/` (14 regression tests) and `scripts/pack.sh`.

### Known limitations

- No `<iframe>` selection support yet; Shadow DOM support is best-effort.
- `chrome://` pages, the Chrome Web Store and the built-in PDF viewer cannot be scripted.
- Icons are still flat placeholder artwork.

## 2.0.6 and earlier

See `legacy/copy-as-markdown-v2.0.6-clean/` — kept unmodified for comparison.
