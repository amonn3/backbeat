# Changelog

## Unreleased

- Synchronize soundtrack play, pause and playback position, including late joins and reconnects.
- Restrict playback and track switching to the board host; guest queue permissions default to off.
- Keep volume and mute available locally to every participant.
- Pause music and collapse the player for everyone when the countdown expires, preserving the notification.
- Close the card composer on outside clicks, keeping unsent drafts.
- Allow cards and groups to move between columns while preserving same-column grouping.
- Add isolated Socket.IO integration tests for permissions, playback, timer expiration and card movement.
- Hide card content and authors from other participants until the host reveals them; authors still see
  their own cards and the host sees everything. The reveal plays a flip-and-glow effect for everyone, and
  ending the retro reveals any hidden cards so the report is complete.

## 0.2.0 — 2026-10-30

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
