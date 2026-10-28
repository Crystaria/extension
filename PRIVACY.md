# Privacy Policy - Copy as Markdown

**Last Updated:** October 28, 2026
**Applies to:** version 2.0.7 and later
**Contact:** https://github.com/Crystaria/extension/issues

---

## Data Collection

**Copy as Markdown does NOT collect, store, or transmit any user data.**

The extension operates entirely on your device. It does not:

- collect personal information
- track browsing behaviour
- use analytics or crash-reporting services
- send selections to any server
- display advertisements
- load remote code

There are no network requests at all: no `fetch`, no `XMLHttpRequest`, no external scripts,
no remote fonts.

---

## Permissions

The extension requests exactly four permissions, all for core functionality:

### `contextMenus`

- **Purpose:** add the "Copy as Markdown" item to the right-click menu
- **Scope:** the menu item is only shown when text is selected
- **Data access:** none

### `storage`

- **Purpose:** remember your settings (enable/disable, link/image/heading conversion, notifications)
- **Scope:** stored in `chrome.storage.sync`, so it may sync across your signed-in Chrome profile
- **Data access:** the six booleans listed in the settings panel; no page content is stored

### `activeTab`

- **Purpose:** read the current selection on the tab where you explicitly invoke the extension
- **Scope:** temporary, granted per invocation; it is not a persistent host permission
- **Data access:** the current tab only, and only after you click the menu item

### `scripting`

- **Purpose:** inject the converter into the current tab on demand
- **Scope:** runs only after an explicit invocation, in the extension's isolated world
- **Data access:** only the DOM needed to build the Markdown string of your selection

The extension declares **no** `host_permissions` and registers **no** always-on content script,
so it cannot read pages you never invoke it on.

---

## Data Processing

All processing happens locally in your browser:

1. You select text on a page.
2. The extension injects its converter into that tab.
3. The selection is serialised to Markdown in memory.
4. The result is written to your clipboard.
5. **Nothing leaves your device.**

The extension does not keep a copy of the converted text, your clipboard history, the page title,
the URL, or the time of use.

---

## Third-Party Services

None. No analytics, no advertising networks, no tracking scripts, no external APIs.

---

## Children's Privacy

The extension collects no data from anyone, including children under 13.

---

## Changes to This Policy

Updates will be posted on this page with a new "Last Updated" date and reflected in the
Chrome Web Store listing.

---

## Summary

- ✅ No data collection
- ✅ No tracking, no analytics, no ads
- ✅ No network requests
- ✅ 100% local processing
- ✅ Open source

**Your privacy is our priority.**
