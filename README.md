# Backbeat

**Backbeat is everything a tech team needs to run its retrospective — no paid features, ready to use.**

Create a board, share the link and let the team write what went well, what needs to improve and what went
badly, with a shared YouTube soundtrack playing and a timer everyone sees in sync. When the meeting ends,
download a Markdown report with everything that was discussed.

Created and idealized by **Amon** ([amonn3](https://github.com/amonn3)).

🔗 **Live:** https://backbeat-delta.vercel.app

## Features

- **Ready in seconds** — enter your name, optionally name the retro and create the board. No sign-up.
- **Invite by link** — whoever opens the link picks a name before joining; empty names are blocked.
- **Three classic columns** — _What went well_, _What needs to improve_ and _What went badly_. Each column
  scrolls on its own, so a busy column never pushes the rest of the board away.
- **Cards** — rounded cards with the title and the author in the bottom-left corner. The author or the host
  can remove them.
- **Move and group cards** — drag cards between columns, including empty ones. Drop onto another card in the
  same column to merge them; ungroup anytime. Click outside the card composer to close it; drafts are kept.
- **Shared soundtrack** — a YouTube mini player with synchronized play, pause and playback position,
  including late joins and reconnects. Only the host can play, pause or switch tracks. Guests can add and
  remove queued songs when the host enables that permission (off by default); only the host can remove
  the current song. Volume and mute are personal and available to everyone. If the browser blocks autoplay,
  each listener can click “Enable audio” to follow the shared playback.
- **Synced timer** — the host picks 30s, 1, 3 or 5 minutes (or any value up to 60 min), then starts, pauses
  or resets it. Everyone sees the same countdown and hears a chime at the end. When time runs out,
  the soundtrack pauses and the player collapses for everyone; it can be expanded again.
- **Host tools** — clear a column, end the retro (locks the cards) and reopen it if needed.
- **Markdown report** — overview, per-column summary, groups, contributions and the soundtrack, ready to
  paste into your wiki.
- **English and Portuguese** — the app follows the browser language and anyone can switch at any time.
  Each person sees the board, errors and report in their own language.

## Getting started

Requirements: Node.js 22+.

```bash
npm install
npm run dev        # API on :3101 + web app (Vite) on :5173
```

Run `npm test` for the real-time integration tests, `npm run typecheck` for TypeScript and `npm run lint`
for lint checks. Integration tests use an isolated temporary data directory.

Open http://localhost:5173. To try it with someone else, open the board link in a private window.

Without Redis configured, boards live in memory and are saved to `data/boards.json`, which is all you need
locally.

### Production build without Vercel

```bash
npm run build
npm start          # serves API + web app on http://localhost:3101 (set PORT to change it)
```

## Deploying to Vercel

The web app is served as static files and a single Vercel Function (`api/index.ts`) handles the REST API and
the Socket.IO WebSocket.

1. Create the project and add **Upstash for Redis** from the Vercel Marketplace (the free plan is enough).
   It provides `REDIS_URL`, which switches the app to the Redis store.
2. Deploy with `vercel deploy --prod`, or push to `main`: the GitHub Actions workflow in
   `.github/workflows/deploy.yml` runs typecheck and lint, then deploys to production. It needs the
   `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` repository secrets.

Why Redis: Vercel Function instances don't share memory, so boards are stored in Redis with compare-and-set
writes (no lost updates when many people type at once), rooms are synced across instances with the Socket.IO
Redis adapter, and presence is tracked with client heartbeats. Boards expire after 30 days without changes.
On the Hobby plan WebSocket connections last up to 5 minutes; the client reconnects and rejoins on its own.

## Tech stack

- React 19, Vite, TypeScript, Tailwind CSS v4 and shadcn/ui (Base UI)
- Express and Socket.IO, with Redis (production) or an in-memory/file store (development)
- dnd-kit for drag and drop
- YouTube IFrame API for the player

## Project structure

```
api/       Vercel Function entry point
server/    REST API, Socket.IO events and the store (Redis or file)
shared/    types and rules shared by the client and the server
src/
  i18n/      translations (en, pt) and the language provider
  pages/     home and board pages
  components/
  hooks/     useBoard: connection, state and actions
  lib/       report builder, identity, YouTube helpers
```

## Adding a language

Copy `src/i18n/en.ts`, translate the strings (TypeScript flags anything missing), register it in
`src/i18n/I18nProvider.tsx` and add its code to `LANGS` in `src/i18n/context.ts`.

## Notes

Identities are lightweight: each browser gets an id stored locally, with no login. That's great for a team
that trusts each other, but it isn't real authentication.
