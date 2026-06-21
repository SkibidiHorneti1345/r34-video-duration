# Rule34 Video Duration Badge Extension

![JavaScript](https://img.shields.io/badge/JavaScript-87.9%25-%23f1e05a?style=flat-square&logo=javascript&logoColor=black)
![CSS](https://img.shields.io/badge/CSS-8.5%25-%23563d7c?style=flat-square&logo=css3&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.6%25-%233572a5?style=flat-square&logo=python&logoColor=white)

A premium, lightweight Chrome extension that automatically overlay video durations and animated GIF badges directly onto search result thumbnails on `rule34.xxx`. Heavily inspired by YouTube's clean and modern aesthetic.

---

## Features

- **YouTube-style Badges**: Smooth, semi-transparent dark badges showing video duration or `GIF` status.
- **Zero-Fetch URL Guessing**: Instantly predicts the direct video media paths directly from thumbnails to avoid loading server pages, ensuring lighting fast loads.
- **Smart Caching**: Uses `chrome.storage.local` to cache successfully resolved durations, preventing duplicate server queries on pagination or back navigation.
- **Concurrency Queue**: Safely processes loads through a concurrent worker queue (up to 3 parallel requests) to avoid browser stutter or page freezing.
- **Premium Aesthetic**: Subtle animations, glassmorphic hover details, and responsive scaling.

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

## File Architecture

- `manifest.json`: Defines permissions, content scripts, and page matching criteria.
- `content.js`: Main logic handler (DOM mutation observation, queue management, URL guessing, metadata resolution, caching, and badge injection).
- `style.css`: Premium CSS rules for rendering the badges with transitions and orange/red states for debugging.
