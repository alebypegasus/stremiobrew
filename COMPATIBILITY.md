# StremioBrew

A community Stremio client for **old, rooted LG webOS TVs** — the pre-WebAssembly
generation that the official Stremio app doesn't support.

> ⚠️ **Work in progress / still being tested.** It runs well on the one model it was
> built on, but it has **not** been tested widely. Expect rough edges.

---

## Requirements

- A **rooted** LG TV with the **Homebrew Channel** installed.
- **webOS 4.x** (Chromium 53), **32-bit ARM (armv7)** — this is the tested target.
- Internet, a **Stremio account**, and your **own addons** (a **debrid** service is
  strongly recommended — debrid streams are direct links and play reliably).

## What works

- Browse / Discover / Library / Search from your addons, with artwork & metadata
- Debrid playback, external + embedded subtitles, resume, watched sync, scrub previews
- Account sync (library / watched) with your other Stremio devices
- **Multi-language UI** supporting 15+ languages including PT-BR, ES, FR, DE, IT, etc.
- **Optimized for old hardware** with CSS `content-visibility` for smooth scrolling.

## Known limits & caveats (please read)

- **webOS 3.x (2016) — probably won't work.** Untested, older browser; treat as unlikely.
- **64-bit (aarch64) TVs — won't work.** The bundled binaries are 32-bit ARM only.
- **webOS 5+ TVs — use the official Stremio app instead** (no root needed there).
- **Low-RAM models will likely crash.** These TVs have very little free memory. Heavy
  use — fast scrolling, big/high-bitrate 4K files, torrent streams — can exhaust RAM and
  crash the app (the system frees the memory and it reopens). **Debrid + moderate files
  are the smooth path.** This is a hardware limit, not something the app can fully avoid.
- **Trailers are best-effort** (they rely on public services that go up and down) and can
  be turned off in Settings.

## Install

Homebrew Channel → Settings → **Add repository** → paste the repo's `apps.json` URL →
find **StremioBrew** → Install. Reboot the TV first if another Stremio build is installed.

---

## Notes

- **You bring your own addons.** The app ships empty and hosts/indexes nothing — it only
  plays stream links your installed addons return, and syncs with your own Stremio account.
- Bundles open-source **Node.js** and **ffmpeg** (with their licenses) plus the Stremio
  streaming server for torrent addons.
- Not affiliated with or endorsed by Stremio; "Stremio" is used only to describe
  compatibility. Provided as-is, for personal use on hardware you own.
