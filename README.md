# Stremio Lite LG

A community Stremio client for **rooted LG webOS TVs (webOS 4.x / Chromium 53)** — the pre-WebAssembly generation that the official Stremio app doesn't support.

> ⚡ **Optimized Edition (v5.0.1):** Built specifically for legacy low-RAM hardware, featuring DOM virtualization, GPU texture recycling, multi-language internationalization (i18n), and Stremio Theater aesthetics.

---

## Features & Highlights

- **Stremio Theater UI & Aesthetics**: Clean top navigation (Search, Home, Discover, Library, Settings), dynamic Hero Banner with IMDb badges (★ rating, year, resolution), metadata and backdrop cross-fade.
- **Ultra-Low RAM Footprint**: Off-screen image virtualization and thumbnail resolution capping prevent OOM crashes on webOS 4 (Chromium 53) TVs with 512MB RAM.
- **Full Multi-Language Support (i18n)**:
  - 🇧🇷 Português (Brasil)
  - 🇵🇹 Português (Portugal)
  - 🇺🇸 English
  - 🇪🇸 Español
  - 🇫🇷 Français
  - 🇩🇪 Deutsch
  - 🇮🇹 Italiano
  - 🇷🇺 Русский
  - 🇹🇷 Türkçe
- **Catalog & Addon Discovery**: Search, Continue Watching with live progress bars, Series episode selection with thumbnails, and high-performance Streams drawer with quality tags (4K, 1080p, HDR, RD+, Torrent).
- **Magic Remote & D-Pad Support**: Smooth focus management with zero input lag.
- **Synchronized Library**: Full two-way sync with your official Stremio account (Library items, Continue Watching, Watched status).

---

## Requirements

- A **rooted** LG TV with the **Homebrew Channel** installed.
- **webOS 4.x** (Chromium 53), **32-bit ARM (armv7)**.
- Internet connection, a **Stremio account**, and your **own addons** (a **debrid** service is strongly recommended for direct, instant playback).

---

## Installation via Homebrew Channel

1. Open the **Homebrew Channel** on your LG TV.
2. Go to **Settings** → **Add repository**.
3. Paste the repository URL:
   ```
   https://stremiobrew.vercel.app/apps.json
   ```
4. Find **Stremio Lite LG** and click **Install**.

---

## Notes & Disclaimer

- **You bring your own addons.** The app ships clean and hosts/indexes nothing — it only plays stream links returned by your installed addons and syncs with your Stremio account.
- Bundles open-source **Node.js** and **ffmpeg** alongside the Stremio streaming server.
- Not affiliated with or endorsed by Stremio; "Stremio" is used solely to describe compatibility.
