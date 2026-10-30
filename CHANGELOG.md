# Changelog

## 0.2.0

### Added
- English and Portuguese translations, with a language switcher on every screen. The default follows the
  browser language and the choice is remembered per browser.
- The Markdown report is generated in the language of whoever downloads it.
- Volume slider and mute button in the mini player. The YouTube embed hides its own volume slider at this
  size; each person's volume is kept in their browser and never shared with the room.

### Changed
- Timer presets are now 30s, 1 min, 3 min and 5 min.
- Column titles no longer have emojis.
- Each column scrolls on its own instead of the whole page growing with the cards.
- Server errors are sent as codes and translated on the client.
- README rewritten in English.

## 0.1.0

- First release: real-time retro boards with three columns, drag-to-merge cards, a shared YouTube playlist
  with host-configurable permissions, a synced timer and a Markdown report.
- Deployed on Vercel with Redis-backed state and automatic production deploys from `main`.
