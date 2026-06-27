# Rule34 Video Duration Badge Extension


<p align="center" class="lang-badges">
  <img src="https://img.shields.io/badge/JavaScript-95.9%25-%23f1e05a?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/CSS-4.1%25-%23563d7c?style=flat-square&logo=css&logoColor=white" alt="CSS">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" alt="License: MIT"></a>
</p>

A lightweight Chrome extension that overlays video durations and animated GIF badges directly on `rule34.xxx` search result thumbnails.

---

## Features

- **Duration and GIF Badges**: Semi-transparent thumbnail badges for resolved video durations and animated GIF posts.
- **Robust Resolver Chain**: Tries direct media URL guesses first, then falls back to same-site post-page parsing.
- **Duplicate-Safe Rendering**: Annotates every matching thumbnail while resolving each post only once.
- **Smart Caching**: Uses namespaced `chrome.storage.local` entries with short-lived negative/error caching and cache pruning.
- **Debug Mode**: Enables sanitized console diagnostics with `?r34vd_debug=1` or the `r34vd:debug` storage key.

---

## Installation (Developer Mode)

Since this extension is distributed as source code, you can load it directly into Chrome:

1. **Download the Repository**:
   - Clone this repository or download it as a ZIP and extract it to a folder on your computer.

2. **Open Extensions Page**:
   - In Chrome, navigate to `chrome://extensions/` (or click the three dots menu -> **Extensions** -> **Manage Extensions**).

3. **Enable Developer Mode**:
   - In the top-right corner of the Extensions page, toggle the **Developer mode** switch to **ON**.

4. **Load Unpacked**:
   - Click the **Load unpacked** button in the top-left corner.
   - Select the folder containing this extension (the folder with `manifest.json` in it).

5. **Browse Rule34!**:
   - Head over to `rule34.xxx` and start searching. Videos and GIFs will now automatically display their length or a `GIF` indicator!

---

## Development

Run the test suite and syntax checks:

```sh
npm install
npm run check
```

For live debugging, load the folder as an unpacked Chrome extension and open:

```text
https://rule34.xxx/index.php?page=post&s=list&tags=video&r34vd_debug=1
```

The content script exposes `window.__r34vdDebug` with `getState()`, `scanNow()`, and `clearCache()` while the extension is loaded.

---

## File Architecture

- `manifest.json`: Defines permissions, content scripts, and page matching criteria.
- `src/core.js`: Pure helpers for thumbnail detection, media URL extraction, formatting, cache policy, and debug sanitization.
- `content.js`: Runtime handler for DOM mutation observation, queue management, metadata resolution, caching, and badge injection.
- `style.css`: Badge positioning and status-state styling.
- `tests/`: Vitest/jsdom coverage for core parsing and cache behavior.

---

*Project created with **Gemini Antigravity**, with much love. ❤️*


