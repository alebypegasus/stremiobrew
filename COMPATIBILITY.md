# StremioBrew - Compatibility & Architecture Guide

A community Stremio client designed specifically for **legacy rooted LG webOS TVs (webOS 4.x / Chromium 53)** where the modern official WebAssembly client cannot run.

---

## Hardware & OS Compatibility

| Platform / OS | Status | Notes |
| :--- | :--- | :--- |
| **LG webOS 4.x (2018-2019)** | **Supported (Primary)** | Chromium 53 engine, 32-bit ARM (armv7). Fully tested with memory virtualization. |
| **LG webOS 3.x (2016-2017)** | *Experimental* | Older browser engine. Requires debrid and standard 1080p/720p streams. |
| **LG webOS 5.0+ (2020+)** | *Not Required* | Please use the official native Stremio app from the LG Content Store. |
| **64-bit ARM (aarch64) TVs** | *Unsupported* | The bundled Node/FFmpeg binaries are 32-bit armv7 only. |

---

## Memory Architecture & Optimizations for Chromium 53

1. **DOM Virtualization**:
   - The app dynamically mounts and unmounts poster image textures for off-screen rows.
   - For distant rows, `src` is swapped with a 1x1 transparent placeholder (`data:image/gif;base64,...`), freeing up to 120MB of VRAM in the GPU compositor.
2. **Resolution Downscaling**:
   - Poster URLs use Metahub's `/small/` or `/medium/` proxies rather than original 4K/2K posters.
3. **Compositor Stability**:
   - Transitions use `transform: translate3d(x, y, 0)` rather than costly layout recalculations or blur shadow rendering.
4. **Multi-Language System (i18n)**:
   - Dynamic localized strings covering Portuguese (BR/PT), Spanish, English, French, German, Italian, Russian, and Turkish.
