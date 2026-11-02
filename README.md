<p align="center">
  <img src="docs/assets/backbeat-logo.svg" width="560" alt="Backbeat — team retrospectives with a soundtrack" />
</p>

<p align="center">
  <strong>Create a board. Bring the team. Give your retro a soundtrack.</strong>
</p>

<p align="center">
  <a href="https://github.com/amonn3/backbeat/actions/workflows/deploy.yml"><img src="https://github.com/amonn3/backbeat/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Production deployment" /></a>
  <a href="https://backbeat-delta.vercel.app"><img src="https://img.shields.io/badge/open-Backbeat-8b5cf6?logo=vercel&logoColor=white" alt="Open Backbeat" /></a>
  <img src="https://img.shields.io/badge/React-TypeScript-3178c6?logo=typescript&logoColor=white" alt="React and TypeScript" />
</p>

---

Backbeat is a retrospective tool for technology teams. Create a board, share the link, and let everyone
write what went well, what needs to improve, and what went badly. A shared YouTube soundtrack and a
synchronized timer keep the writing session moving; a Markdown report captures the discussion afterward.

There is no sign-up. Each browser keeps a lightweight identity, and the person who creates the board
hosts the session. The interface follows your browser language, with **English** and **Português**
available from the language selector. Your language and volume preferences are saved locally when
browser storage is available.

## Features

- **Ready in seconds.** Enter your name, optionally name the retro, and create a board. Invite the team by link.
- **Three retrospective columns.** _What went well_, _What needs to improve_, and _What went badly_. Each column scrolls independently on desktop.
- **Cards and groups.** Add topics, move cards or entire groups between columns, and drop a card onto another in the same column to group related topics. Ungroup whenever needed. Clicking outside the composer closes it and keeps the unsent draft.
- **Synchronized soundtrack.** Play, pause, and playback position follow shared server state, including late joins and reconnects. Periodic corrections help listeners recover from drift and buffering.
- **Host-controlled playback.** Only the host can play, pause, or switch songs. Guest permission to add and remove queued songs is off by default and can be changed by the host. Only the host can remove the current song.
- **Personal volume.** Every participant can adjust volume or mute their own player without changing anyone else's audio.
- **Shared countdown.** Choose 30 seconds, 1, 3, or 5 minutes, or a custom duration up to 60 minutes. The host starts, pauses, resumes, and resets the timer.
- **Discussion transition.** When time runs out, everyone receives the notification, the soundtrack pauses, and the player collapses. Expand it again whenever needed.
- **Host tools and reports.** Clear columns, end the retro to lock cards, reopen it, or download a Markdown report with contributions, groups, and the soundtrack. Card authors and the host can delete their cards.
- **English and Portuguese.** Each participant chooses their own language for the interface, errors, and downloaded report.

## Try it now

**[Open Backbeat →](https://backbeat-delta.vercel.app)**

1. Enter your name and, optionally, a name for the retrospective.
2. Decide whether guests may add and remove queued songs, then create the board.
3. Share the board link. Guests enter their names before joining.
4. Add YouTube links to the queue. The host starts playback; each participant sets their own volume.
5. Start the countdown and write cards. Move topics between columns or group related cards in the same column.
6. When the countdown ends, discuss the cards with the music paused and the player collapsed.
7. End the retro and download the Markdown report. The host can reopen the board if needed.

If your browser blocks autoplay, click **Enable audio** to follow the shared playback. To try a guest
session locally, open the board link in a private window or another browser.

The public version follows `main`: updates appear after the production deployment workflow completes.

## How it works

```text
Host and guest browsers
        │
        ├── HTTP ──────► Create or preview a board
        │
        └── Socket.IO ► Validate permissions ──► Persist board ──► Broadcast state
                                                       │                 │
                                             Redis or local file         ▼
                                                               Cards, timer and player

                         Volume and mute stay in each browser
```

React renders the board, dnd-kit handles card dragging, and the YouTube IFrame API plays the soundtrack.
Express and Socket.IO validate actions on the server and broadcast board snapshots with the server time.
Playback uses a shared position and timestamp; the timer uses a shared deadline so clients can follow
the same session clock.

Without Redis, the server keeps boards in memory and saves them to `data/boards.json`. With `REDIS_URL`
or `KV_URL` configured, Redis stores boards, compare-and-set writes handle concurrent changes, and the
Socket.IO Redis adapter distributes room updates between server instances. Presence is refreshed by
client heartbeats. Redis boards expire after 30 days without a persisted change.

## Run locally

You need **Node.js 22+** and npm.

```bash
git clone https://github.com/amonn3/backbeat.git
cd backbeat
npm ci
npm run dev
```

Open **http://localhost:5173**. The development command runs the API on **:3101** and Vite on **:5173**,
with API and WebSocket requests proxied to the backend. Redis and API keys are not required locally.

```bash
npm test              # real-time integration tests with isolated temporary storage
npm run typecheck     # TypeScript validation
npm run lint          # lint checks
npm run build         # production frontend build and TypeScript validation
npm start             # serve the API and built frontend on http://localhost:3101
```

Run `npm run build` before `npm start`. Set `PORT` to change the standalone server port.
For isolated local board storage, set `BACKBEAT_DATA_DIR`; the default is `data/`.

Translations live in [`src/i18n/`](src/i18n). To add a language, copy `en.ts`, translate the messages,
register the dictionary in `I18nProvider.tsx`, and add the language to `context.ts`. TypeScript checks
that both existing languages expose the same messages.

## Deploy to Vercel

The repository includes [`vercel.json`](vercel.json) for the frontend and API entry point, and a
[production workflow](.github/workflows/deploy.yml) triggered by pushes to `main` or a manual run.

1. Create a Vercel project for the repository.
2. Configure Redis through `REDIS_URL` or `KV_URL` so board state can be shared between instances.
3. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to the repository's GitHub Actions secrets.
4. Push or merge to `main`, or run the production workflow manually.

The workflow installs dependencies, runs typecheck and lint, builds the application, and deploys the
production output. Run `npm test` locally before submitting a change; integration tests are not currently
part of that workflow. The real-time backend requires WebSocket support from its hosting environment.

## Known limitations

- **Lightweight identities.** Browser-stored IDs are intended for teams that trust each other. They are not authenticated accounts; using another browser or clearing storage changes your identity.
- **YouTube and browser playback policies.** Soundtrack playback requires access to YouTube and an embeddable video. A browser may require each listener to enable audio before following playback.
- **Synchronization has practical limits.** Shared timestamps and periodic corrections reduce drift, but network latency, buffering, and browser scheduling prevent sample-accurate audio across devices. The host's player advances the queue when a track ends.
- **Local storage is single-process.** The file store is suitable for local development or a standalone server. Multiple backend instances need shared Redis state and the room adapter.
- **Integration coverage has a defined scope.** Automated tests exercise HTTP and Socket.IO behavior for permissions, playback state, card movement, and timer expiration. They do not validate real YouTube audio or browser drag-and-drop interactions.

## Documentation

| Document | Contents |
| --- | --- |
| [Changelog](CHANGELOG.md) | Released changes and the current unreleased work |
| [Shared types](shared/types.ts) | Board model, event contracts, and shared helpers |
| [Real-time server](server/app.ts) | API routes, permission checks, and board events |
| [Persistence](server/store.ts) | Redis and local file stores |
| [Integration tests](tests/realtime.test.ts) | Real-time regression scenarios |
| [Workflow](.github/workflows/deploy.yml) | Validation and production deployment |

## Contributing

[Issues](https://github.com/amonn3/backbeat/issues) and pull requests are welcome. For a bug report,
include the browser, whether you were the host or a guest, the relevant playlist permission, steps to
reproduce, and the expected behavior. Avoid including private retrospective content.

Before submitting a change, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
Changes to shared state or permissions should include a regression case. Update both languages when
adding interface text, and keep unrelated changes in separate, atomic commits so contributions are easy
to review.

## Author

Created and idealized by **Amon ([amonn3](https://github.com/amonn3))**.
