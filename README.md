# Remote Field Technician Support Portal

A proof-of-concept **Next.js (App Router)** portal that walks a field technician through a guided mission: configure the job, review safety instructions, then complete a three-step live activity (scoping chat → diagnostic recording → expert QA) against a 10-minute clock, with a remote "expert" on the other end of a simulated connection.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No configuration required — the app runs fully self-contained in **scripted (mock) expert mode**.

Optional live-AI mode:

```bash
cp .env.example .env.local
# add a free key from https://console.groq.com
GROQ_API_KEY=gsk_...
```

With a key present the expert chats are answered by an LLM (streamed); without one — or if the LLM call fails mid-conversation — the app falls back to the scripted expert automatically.

Every new visitor is seeded with **300 credits** (override with `DEMO_USER_BALANCE`). Each mission costs **100 credits**, charged the moment it starts — see [Credits & billing](#credits--billing--the-paid-mission).

> `npm run build && npm start` also works. Note the file-backed session store writes to `.data/` and therefore needs a writable filesystem (see [Persistence](#two-tier-state-where-things-are-saved-and-when)).

## Why no separate backend

The assignment's scope is UI orchestration plus thin persistence — a separate service would add deploy surface without exercising anything the evaluation cares about. Next.js already provides both server tiers this app needs (Server Actions for authorized mutations, Route Handlers for data endpoints). The two seams where a real backend would attach are deliberate interfaces:

- `lib/session-store.ts` — four functions over `.data/sessions/<sid>.json`; swap the implementations for Redis/Postgres and no caller changes.
- `lib/expert/types.ts` (`ExpertConnection`) — the chat UI talks to this interface only; a real WebSocket backend is a third implementation beside the mock and LLM channels.
- `lib/credits-store.ts` — the billing ledger (balance, idempotent charge refs, active mission); synchronous-fs for dev-only per-process atomicity, single-statement `UPDATE ... WHERE balance >= amount` + a `UNIQUE (uid, ref)` charge row in production.

## Server / Client component map

Every page is a Server Component. Client code exists only in leaves that touch browser APIs or interactive state:

| Area | Server | Client (`'use client'`) — why |
|---|---|---|
| Layout / nav | `layout.tsx`, `NavBar` (reads cookie) | `NavLinks` — `usePathname` for active link |
| Phase 1 `/` | `page.tsx` | `SelectionGrid`/`SelectionCard` — selection state, `useFormStatus` |
| Phase 2 `/prep` | `page.tsx`, `SafetyInstructions` (pure render of the equipment×severity map) | `PrepCountdown` — timers; `PermissionGate` — `getUserMedia` |
| Phase 3 `/activity` | `page.tsx` — cookie → `unlockedTab`, store read, env → expert mode | `ActivityShell`, tabs — chat connection, `MediaRecorder`, timers, `sendBeacon` |
| `/analysis` | `page.tsx` — pure summary render | — |

The rule applied throughout: **the server decides, the client animates.** Pages read the cookie/store and pass derived props (`unlockedTab`, `mode`, persisted transcripts) down; client components never read authorization state themselves.

## Server Actions vs Route Handlers — both used, deliberately

| Mutation / endpoint | Mechanism | Why |
|---|---|---|
| `startMission` (Phase 1 submit) | **Server Action** | Form-driven, sets the httpOnly cookie, redirects — one round trip, works without JS (`<form action>`), pending state via `useFormStatus`. |
| `markPrepped`, `completeTab`, `finishJob`, `expireMission` | **Server Action** | *Authorization writes* (cookie stage transitions). `completeTab` also calls `revalidatePath('/activity')` so the same action response carries the refreshed RSC payload — `unlockedTab` updates with no desync window. |
| `GET /api/expert/script` | **Route Handler** | Fetched by the client-side channel *class* (not a component) — it mimics a chat backend endpoint. Swapping mock → real backend swaps a URL, not the React tree. |
| `POST /api/expert/chat` | **Route Handler** | LLM streaming needs ownership of the `Response` object; Actions can't return a stream. |
| `GET`/`PUT /api/session` | **Route Handler** | Fire-and-forget autosave (no UI transition wanted) and the `sendBeacon` target on expiry — a beacon can only hit a URL, never invoke an action. |

## Two-tier state: where things are saved, and when

**Tier 1 — `mission` cookie (authorization).** `{ sid, stage, equipment, severity }`, httpOnly, written *only* by Server Actions. `stage` advances monotonically through `configured → prepped → scoping_done → recording_done → qa_done → finished`. Read by `proxy.ts` and by every server page.

**Tier 2 — file-backed session store (data).** `.data/sessions/<sid>.json` holds chat transcripts, conversation cursors, and the recording flag — the "database" tier. **Local-dev only:** serverless filesystems are read-only; `lib/session-store.ts` is the four-function interface where Redis/Postgres slots in.

**Why not just localStorage?** Route protection must fail *server-side* on a deep link. Proxy/middleware cannot read localStorage — only cookies travel with the request. Client-only storage also dies with the browser profile and can't be trusted for stage authorization. Browser storage's one legitimate job here is UX continuity, and it gets exactly that: the 600s deadline lives in `sessionStorage` so a refresh doesn't reset the clock.

**Save-timing policy** (asked explicitly by the brief):

| What | When | Why |
|---|---|---|
| Chat transcript + cursor | After each message exchange (`PUT /api/session`, fire-and-forget) | An exchange is the smallest meaningful unit. Per-keystroke saves nothing useful (the channel owns pacing, not typing); waiting until tab completion loses the whole conversation on a crash/refresh. |
| Recording flag | On recorder stop | The blob itself never leaves the browser (below) — the flag is the only durable fact. |
| Stage transitions | On "Completed → Next" via Server Action | Stage is authorization; it moves only through the audited write path. |
| Final flush | On 600s expiry via `navigator.sendBeacon` | Survives the imminent navigation. Payload is wrapped in `new Blob([json], { type: "application/json" })` because plain-string beacons post as `text/plain`; the handler additionally parses the raw body leniently regardless of content-type. |

## Route & tab protection

- **`proxy.ts`** (Next 16's middleware) maps `/prep → configured`, `/activity → prepped`, `/analysis → finished` as **minimum** stages, compared ordinally (`STAGE_ORDER.indexOf(stage) >= indexOf(required)`) — never equality, so refreshing `/activity` at a later stage doesn't bounce. Insufficient or malformed cookie → redirect `/` before any page code runs.
- The proxy also **mints the `user` identity cookie** (httpOnly) — unconditionally, *first* in the handler, before the stage lookup (Server Components can't set cookies, and `/` must render a balance on a first visit with no mission). The cookie is written to both the forwarded request and the response, and the same pass-through `NextResponse` is returned on every continue branch so it is never dropped.
- **Pages re-check the cookie** (`redirect('/')`) as defense-in-depth behind the proxy.
- **Tabs are client state, but unlock server-side:** `/activity`'s Server Component derives `unlockedTab` from the cookie and passes it down. `TabBar` renders locked tabs disabled; the only unlock path is the `completeTab` action, whose `revalidatePath` refreshes `unlockedTab` in the same round trip. A user can flip `activeTab` in React DevTools all day — the tabs beyond `unlockedTab` were never given any authorized state.
- **Cookie honesty note:** the cookie is plain JSON, deliberately. httpOnly already blocks script access; the remaining "attack" is a technician hand-editing their own cookie in devtools to skip stages of a demo app — no stakes. In production I would HMAC-sign (or JWT) the value to prevent client-side stage tampering; `lib/mission.ts`'s `parseMission`/`serializeMission` are the single seam where verification slots in.

## Credits & billing — the paid mission

- **Charge at start, never refunded.** `startMission` (the Phase 1 Server Action) deducts 100 credits atomically and idempotently — keyed by the mission `sid` — from `lib/credits-store.ts`. Leaving at any point still costs the mission; there is no refund path, by design.
- **Identity.** A `user` cookie (httpOnly) is minted once per browser by the proxy; the ledger is keyed by `uid`. Every page/action/route reads it; none mints it.
- **One paid mission at a time.** Two guards: the mission cookie (fast UX check) and `account.activeMission` — checked *inside the same synchronous write as the charge*, so two racing starts (double-click, action retry, two tabs) cannot both charge. A stale `activeMission` (an abandoned mission whose cookie has lapsed) self-heals on the next start.
- **The LLM route is a paid resource.** `POST /api/expert/chat` derives identity from cookies only and requires `account.activeMission.sid` to match the mission cookie — curl, devtools, and expired-session calls get 401, so there is no free-inference abuse. The stream also carries `abortSignal: request.signal`, so a client disconnect cancels the provider call immediately.
- **The warning is UX, not enforcement.** `beforeunload` shows only a generic browser dialog and is unreliable on mobile; the real copy lives in the in-app "Leave mission" modal. Either way the charge already happened server-side.

## Resource lifecycle on exit (tab close)

React's effect cleanup does **not** run when a tab is closed — the component is destroyed, never unmounted. `usePageHideCleanup` registers `pagehide` (+ `visibilitychange` where it's safe — e.g. cancelling speech) so every resource is released on teardown: the in-flight LLM fetch is aborted (which also cancels the server-side stream via `request.signal`), `speechSynthesis` is cancelled, and on tab close the recorder is finalized and camera/mic tracks are released. Two resources are deliberately **terminal-only** (real page teardown, not tab-hide): the expert chat — switching tabs must not kill an in-progress conversation — and the video recording — a hidden tab must not silently corrupt a recording mid-capture. This is the deliberate answer to "what happens to the resources you provide the user": each one is owned by a lifecycle that ends on unmount, `pagehide`, or the server request itself — nothing outlives its owner.

## The simulated expert connection

`ExpertConnection` (`connect(cursor)` / `send` / `disconnect` / `on('message' | 'typing' | 'status' | 'done' | 'cursor')`) — an event-driven contract, not a fetch:

- **`MockExpertChannel`** walks a script (`{ greeting, steps: [{ expertMessages, expectsUserReply, simulatedUserLine }] }`, keyed by equipment×severity from `GET /api/expert/script`), emitting `typing` then `message` after randomized 1500–3000ms delays, halting at reply-expecting steps until `send()`. Nothing renders instantly.
- **Resume:** the server page hands the persisted `{ transcript, cursor }` to the chat; the transcript renders immediately, and `connect(cursor)` decides what happens next — `awaiting:'user'` re-asks the pending question ("Are you still there? …"), `awaiting:'expert'` resumes emitting mid-step, `'done'` re-enables completion. Refresh mid-chat and the conversation picks up correctly; the 600s clock (sessionStorage deadline) doesn't reset.
- **StrictMode safety:** every timeout is tracked and cleared in `disconnect()`; `connect()` is idempotent. Dev double-mount produces zero duplicate messages.
- **`LiveExpertChannel`** implements the same interface with `POST /api/expert/chat` (Vercel AI SDK + Groq, streamed). Mode is computed server-side from env-key presence and passed as a prop — the key never reaches the client; the panel badge shows "Scripted" vs "Live AI". Any fetch/stream failure hot-swaps the remainder of the conversation to the mock channel at the equivalent cursor, with a system notice in the transcript. On resume, the LLM history is rebuilt from the persisted transcript.

## Video recording — client-side by design

The recording never uploads: `getUserMedia` → `MediaRecorder` (mimeType negotiated webm/vp9 → webm → mp4 for Safari) → `Blob` → object URL preview (revoked on re-record/unmount). Only the `recorded` flag persists, so the blob does **not** survive a refresh — a scoped tradeoff, not a gap: a POC gains nothing from moving megabytes, and the production path is chunked upload to object storage (S3 multipart or similar) behind the same `onstop` hook where the flag is set today.

Permission failure is a first-class path: `/prep` probes access on explicit click (`PermissionGate`), denial shows an inline explanation + retry, and proceeding without a camera is a warned, explicit override — never a hard brick. The recording tab repeats the same courtesy with its own error states.

## Loading & code-splitting inventory

- `loading.tsx` for `/prep`, `/activity`, `/analysis` (skeleton layouts).
- `<Suspense>` around the session-store read in `/activity` — static shell paints while the store loads.
- All three tabs are `next/dynamic` chunks (`ssr: false` on `RecordingTab`; MediaRecorder has no server story) with `TabSkeleton` fallbacks — no monolithic tab file, no dead code for tabs you can't reach yet.
- `TypingIndicator` during expert delays; every mutating button is pending-disabled (`useFormStatus` / `useTransition`); a processing skeleton bridges record-stop → preview.

## Bonus features

- **Voice:** expert messages spoken via `speechSynthesis` (opt-in mute toggle, cancelled on unmount).
- **Simulate speech:** one click feeds the script's pre-canned technician line through the exact same `send()` path as typed input.
- **Live-AI mode** with graceful degradation, as above.

## Limitations (known, scoped)

- `.data/` store is local-dev only (read-only fs on serverless) — interface swap documented above.
- Video blob not persisted across refresh — flag only, by design.
- `getUserMedia` requires localhost or HTTPS.
- One paid mission at a time per user (account-scoped); no multi-user accounts — out of scope.
- The plain-JSON `mission` and `user` cookies are tamperable by their owner; production hardening is a one-line HMAC away at the documented seam (`parseMission`/`serializeMission`, `parseUser`/`serializeUser`).
- The credits ledger is file-backed (dev-only) with per-process atomicity via synchronous fs; the production swap is a single-statement DB transaction (see Credits & billing).
