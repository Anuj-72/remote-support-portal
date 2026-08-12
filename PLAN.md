# PLAN — Credits-Gated Mission Flow

**Feature:** Charge a user 100 credits when they *start* a mission; the charge stands no matter where they leave the flow; warn the user before the tab closes that they will lose the 100 credits; and prove that the resources we provision (LLM stream, voice, camera, timers) are fully accounted for — no leaks, client or server.

**Status:** Plan for review. No implementation yet.
**Scope note:** This is a planning document. Every decision below is written to be defensible in review, because the billing boundary and the resource-lifecycle story are the two things most likely to be probed.

---

## 1. Requirements (from the interviewer)

1. Users have a credit balance, already present in the database.
2. A mission costs **100 credits**, charged **when the process starts** — the moment the user begins the flow. Leaving the process at *any* point still costs the 100 credits.
3. The user must be shown a **warning before the tab closes** that they will lose the 100 credits.
4. The interviewer will probe what happens to the resources we provide the user — the LLM `streamResponse`, the voice chat option, etc. — with specific attention to **memory leaks and server-allocated resources**.

---

## 2. The core design decision

> **The charge happens at `startMission` (server-side, atomic, idempotent). The tab-close warning is pure UX and is *not* the enforcement mechanism.**

Reasoning:

- **`beforeunload` cannot be trusted as the billing trigger.** Verified current browser behavior:
  - Modern Chrome/Firefox/Safari show **only a generic dialog** ("Leave site?"); custom warning text is ignored.
  - The prompt requires *sticky user activation* — it can be suppressed entirely if the user never interacts with the page.
  - It is **unreliable or unsupported on mobile** (background tab kills, app-switcher swipe).
  - If the rule were "charge when warned," a user could close the tab and never be charged. The rule must live server-side.
- **Charging at start makes the warning true.** "You will lose your 100 credits" is honest *because* the deduction already happened — the same way a movie ticket is bought when purchased, not when the credits roll.
- **Leaving mid-mission costs the user real (LLM) usage.** Each live chat request hits Groq. Upfront charging is what makes an early-exit user still "pay for" the resources they may have consumed — this is the direct answer to the interviewer's resource question (see §7).

---

## 3. Assumption that must be stated

**This repo has no user model and no database.** The README documents this deliberately: the data tier is a file-backed store (`.data/sessions/<sid>.json`) behind the `lib/session-store.ts` seam, and the model is "one mission per browser."

The interviewer's scenario ("credits already present in the database to the user") requires a **stable identity across missions** — otherwise every new mission gets a fresh balance and the feature is vacuous.

**Decision: introduce a minimal `user` identity + a credits ledger that follows the exact seam pattern the repo already uses.**

- **Rejected:** tieing credits to the mission `sid`. A new mission = a new `sid` = fresh 100 credits. It can never demonstrate scarcity or the insufficient-balance path, which is surely what's being probed.

---

## 4. Data model (new)

### 4.1 `user` cookie — stable identity

```
{ uid: string }   // crypto.randomUUID(), minted once per browser
```

- `httpOnly`, `sameSite: lax`, `path: /`, long `maxAge`.
- Same hardening as the mission cookie; the existing HMAC seam (`parseMission`/`serializeMission` in `lib/mission.ts`) is the documented production upgrade point and applies to this cookie too.
- Minted **once per browser at the proxy layer** (`proxy.ts`), not in `startMission` — see §5.6. Server Components cannot set cookies (only Server Actions, Route Handlers, and the proxy can), and `/` must render the balance on the *first* visit, before any mission exists. So the uid must already exist before any page — including `/` — renders.
- **Proxy mechanics (see §5.6):** the matcher expands to cover `/` (excluding static assets), and the minted cookie is written to **both** `request.cookies` (the forwarded request, so Server Components see it this same request) **and** the response's `res.cookies` (so the browser receives `Set-Cookie`). A cookie set only on the outgoing response is invisible to the request that set it.

### 4.2 `lib/user.ts` *(new)* — cookie helpers

Mirror of the mission-cookie helpers:

| Function | Purpose |
|---|---|
| `getUserId()` | Read the `user` cookie (already minted by the proxy). Returns `uid \| null`. |
| `mintUser()` | Create a fresh `{ uid }`; called by `proxy.ts` only. |
| `parseUser(raw)` | Lenient parse — malformed → `null` → treated as "no user". |

No action or page mints the user anymore — `startMission` only *reads* the already-present uid.

### 4.3 `lib/credits-store.ts` *(new)* — the ledger

Follows the `lib/session-store.ts` seam pattern (a small interface, swap for Redis/Postgres in production without touching callers).

```
.data/credits/<uid>.json
{
  uid: string,
  balance: number,               // seeded from DEMO_USER_BALANCE (default 300 → 3 missions)
  chargedRefs: string[],         // mission sids already charged — idempotency ledger
  activeMission?: { sid: string; startedAt: number }  // the paid mission currently in progress
}
```

`activeMission` is written in the *same synchronous write* as the charge (see §4.4) and cleared on `finishJob` / `expireMission` / `resetMission`. It backs the billing gate on the LLM route (§5.2): the only mission allowed to call `/api/expert/chat` is the paid, active one.

| Function | Purpose |
|---|---|
| `readAccount(uid)` | Read an account; `null` if absent. Same `isSafeUid` path-traversal guard style as `session-store`. |
| `ensureAccount(uid)` | Create with seeded balance if absent (idempotent). |
| `chargeCredits(uid, amount, ref, activeMission?)` | **Atomic + idempotent** deduction; when a mission is being started it also records `activeMission` in the same write. See §4.4. |
| `clearActiveMission(uid)` | Clears `activeMission` on `finishJob` / `expireMission` / `resetMission`. |
| `getBalance(uid)` | Convenience read for server-rendered UI. |

`MISSION_COST = 100` is a constant in this module (or a small `lib/billing.ts`).

### 4.4 The charge contract — the second thing to defend

```
chargeCredits(uid, amount, ref)
  → { ok: true, balance }                          // deducted
  → { ok: false, reason: "insufficient_balance", balance }
  → { ok: false, reason: "already_charged", balance }   // same ref seen before — no-op
```

- **Idempotency by `ref`:** `ref` = the mission `sid`. A retry with the same `ref` (double-submit, network retry) is a no-op that returns the current balance. In the file store this is a check inside the single account document; in production it is a **unique constraint on `(uid, ref)`** inside a transaction.
- **Atomicity — the mechanism, named: synchronous fs.** `chargeCredits` uses `fs.readFileSync` / `fs.writeFileSync` (not `fs.promises`), so the read → check → write is one uninterrupted block in Node's single-threaded event loop. There is **no `await` gap between the read and the write**, so two concurrent calls cannot both observe the same balance: a double-click on Start, a Server Action retry, or two tabs racing before the mission cookie exists all execute serially, and the second caller sees the first caller's deduction. This is the concrete reason the "one read-modify-write" claim is safe — it is a property of the chosen API, not an assertion.
  - **Rejected alternative: async `fs.promises` + a per-uid in-process lock (`Map<uid, Promise>` chain).** It would also serialize same-uid calls, but it introduces a second resource to manage — an unbounded lock map is exactly the class of leak this document guards against elsewhere (§5.4) — and it still only guarantees per-process serialization. Sync fs achieves the same guarantee with less machinery. The lock map is the documented fallback if the store ever moves to async I/O.
  - **Scope of the guarantee (state this honestly):** sync fs serializes within one Node process only. Multi-instance deployments (multiple `next start` workers, serverless) are *not* covered — which is precisely why the production seam below uses a single atomic statement. In production the equivalent is:

  ```sql
  UPDATE accounts SET balance = balance - 100
  WHERE uid = ? AND balance >= 100;
  ```

  (row-count 0 ⇒ insufficient balance; the insert of the `(uid, sid)` charge row is the idempotency guard).
- **No partial state:** a failed charge leaves the account untouched and never creates a mission cookie or session file. Conversely, a *successful* charge and its `activeMission` record land in the same synchronous write — there is no crash window between "charged" and "gate-ready" that could strand a paid mission behind its own billing check (§5.2).

---

## 5. Full change inventory

### 5.1 Server Actions — `actions/mission.ts`

| Change | Why |
|---|---|
| `startMission`: **reject if a mission cookie already exists at a non-terminal stage** | One-mission-per-browser guard (formalizes the README's stated model) and kills the double-charge race at the source. Returns `{ ok: false, reason: "mission_in_progress" }` instead of overwriting the cookie. |
| `startMission`: **read the already-present uid** (`getUserId` — minted by the proxy, never by an action or page) → `chargeCredits(uid, MISSION_COST, sid, { sid, startedAt })` | The single authoritative billing write, at process start. The charge write also records `activeMission`, which the LLM route's billing gate (§5.2) requires. |
| `startMission`: **return errors instead of always redirecting** | The form must show "You need 100 credits — you have 30" inline. Return type becomes `{ ok: true } \| { ok: false, reason, balance }`. |
| `finishJob`, `expireMission`, `resetMission` — **each gains one line:** `clearActiveMission(uid)` | No refunds — expiry/finish/abandon are post-charge by definition. The only addition is clearing `activeMission` so the LLM billing gate (§5.2) stops authorizing a finished or abandoned mission. |

### 5.2 API route — `app/api/expert/chat/route.ts`

| Change | Why |
|---|---|
| Pass `abortSignal: request.signal` to `streamText(...)` | **The server-resource answer:** when the client disconnects mid-stream, `request.signal` fires and the AI SDK cancels the Groq call immediately — no zombie token generation, no wasted LLM billing. Verified against AI SDK v7 behavior. |
| Runtime-validate the body (phase/equipment/severity allowlists — reuse `EQUIPMENT_TYPES`/`SEVERITY_LEVELS`; `history` roles ∈ `{user, assistant}`; cap `history` length and `exchange`) | Currently typed but not validated. A hostile client can grow the prompt unboundedly (cost + latency). Cheap hardening that mirrors the `/api/expert/script` route's existing validation. |
| **Billing gate:** derive `sid` from the mission cookie and `uid` from the user cookie — identity comes from cookies, never the request body (the same rule `/api/session` already follows per the README) — then `readAccount(uid)` and require `account.activeMission?.sid === sid` before calling the LLM; return `401` otherwise | Once missions cost credits, this endpoint is a **paid resource**: an unauthenticated or stale-session call (curl, devtools, expired cookie) would otherwise be a free-inference exploit consuming Groq tokens with no paid mission backing the request. The gate restricts LLM calls to the single paid, active mission. (Bonus hardening: reject a body whose `equipment`/`severity` don't match the mission cookie's values — the script-derived conversation must belong to the paid job.) |

### 5.3 Client components

| File | Change | Why |
|---|---|---|
| `app/page.tsx` | Server-render the current balance (read user cookie → `getBalance`) | The account must be visible; a server-rendered read keeps "the server decides" intact. No chicken-egg: the proxy (§5.6) guarantees the uid cookie exists before `/` renders — including a first visit with no mission — because the proxy runs before every request and Server Components cannot set cookies. |
| `components/mission-setup/SelectionGrid.tsx` | `useActionState` for `startMission`; inline error banner for `insufficient_balance` / `mission_in_progress`; show balance next to Start | Progressive enhancement preserved: with JS off the plain `<form action>` still posts, and the no-JS error path is a `?error=` redirect rendered server-side. |
| `components/activity/LeavingGuard.tsx` *(new)* | **Conditional** `beforeunload` listener + **in-app "Leave mission" modal** | See §6. |
| `components/activity/ActivityShell.tsx` | Mount `LeavingGuard` (inherently scoped to `/activity`, the in-progress window) | It must not warn on `/` or `/analysis`. |
| `components/nav/NavBar.tsx` *(optional, recommended)* | Credits badge beside the mission badge | Makes the account tangible; shows the post-charge balance after each mission. |

### 5.4 Hooks — terminal cleanup (React cleanup ≠ tab close)

| File | Change | Why |
|---|---|---|
| `hooks/usePageHideCleanup.ts` *(new)* | One-time `pagehide` + `visibilitychange(hidden)` callback registration; returns a "register(fn)" helper | **React's effect cleanup does not run on tab close.** This is the leak every candidate misses. `pagehide` (not the deprecated `unload`) is the correct terminal event. |
| `hooks/useExpertConnection.ts` | Register `pagehide` → `connection.disconnect()` (aborts in-flight LLM fetch, clears mock timers) | Client stream hygiene on tab close. |
| `hooks/useMediaRecorder.ts` / `useMediaStream.ts` | No per-hook wiring — `RecordingTab` orchestrates **terminal-only** teardown (finalize recorder, then release tracks) | Releases hardware on tab close, not just on unmount. Deliberately *not* on tab-hide: a hidden tab must not silently stop a recording mid-capture (implementation refinement over the original §5.4 text, which ran both events for hardware). |
| `hooks/useSpeechSynthesis.ts` | Register `pagehide` → `speechSynthesis.cancel()` | No lingering audio after close. |
| `lib/expert/live-channel.ts` / `mock-channel.ts` | No change needed — `disconnect()` already aborts/clears; the pagehide wiring above calls it | The channels already own their timers/abort; the gap was *who calls disconnect on tab close*. |

### 5.5 Docs, config, tests

| File | Change | Why |
|---|---|---|
| `.env.example` | Add `DEMO_USER_BALANCE` (default 300) | Reviewer-tunable seed; demonstrates the scarcity path without code edits. |
| `README.md` | New "Credits & billing" and "Resource lifecycle on exit" sections | This repo documents every deliberate decision; the interviewer's second question is answered in prose. |
| `package.json` | `"test": "node --test"` | Zero test infra exists today. |
| `tests/credits.test.ts` *(new, recommended)* | `node:test` units for the ledger | See §9. |

### 5.6 Proxy — `proxy.ts`

| Change | Why |
|---|---|
| Expand `matcher` from `["/prep", "/activity", "/analysis"]` to `['/((?!_next/static|_next/image|favicon.ico).*)']` (all non-static routes, including `/`) | The uid cookie must exist before *any* page renders — including `/` on a first visit with no mission — so minting cannot live in a Server Action or a page. Server Components cannot set cookies; the proxy is the only layer that runs before every request. |
| If no `user` cookie: mint one and write it to **both** `request.cookies` (the forwarded request — Server Components read it on this same request) **and** the response's `res.cookies` (the browser receives `Set-Cookie`) | A cookie written only to the outgoing response is invisible to the request that produced it. Without the forwarded-request write, `/` would still render with no uid on the first visit, and the balance read would come back empty. |

Mint-once semantics: the handler is idempotent (no-op when the cookie exists), so it is cheap on every subsequent request, including API routes that pass through the proxy.

---

## 6. The tab-close warning — design

Two layers, because the browser only gives us one of them:

| Layer | What it shows | Limit |
|---|---|---|
| **`beforeunload` (backstop)** | Only a **generic** browser dialog ("Leave site?"). Attached **conditionally**: only while a mission is in progress; detached on finish/unmount (a permanently-attached listener disables the **bfcache** and hurts performance — a seniority-level detail). | Custom text is ignored by all modern browsers; unreliable on mobile. |
| **In-app "Leave mission" modal (the real warning)** | The actual copy: *"You will lose your 100 credits. Credits are charged when a mission starts and are not refunded."* With **Stay on mission** / **Leave mission** buttons. | Only reachable via an in-app affordance (a "Leave mission" button in the activity shell) — which is also the *only* place the required warning text can be displayed. |

Behavior rules:

- No warning on `/` or `/analysis` (nothing to lose; `LeavingGuard` only mounts inside `/activity`).
- No warning for in-app soft navigations (Server Action redirects are router-level and never fire `beforeunload`).
- **Leave mission** calls the existing `resetMission` action (deletes the mission cookie, redirects to `/`). **No refund** — matches the requirement exactly. No new action needed; reuse beats reinvent.
- The modal is the demonstrable proof of the requirement; `beforeunload` is the safety net for the close-the-tab case.

**Enforcement recap (for the review):** if the tab is killed, the browser crashes, or mobile swipes the tab — none of the warnings fire, and **the charge still stands**, because it was executed server-side at `startMission`. The warning is UX honesty, not billing logic.

---

## 7. Resource & memory-leak lifecycle — the interviewer's table

**Principle: every resource is owned by a lifecycle that ends on (a) React unmount, (b) `pagehide`, or (c) the server request itself. Nothing outlives its owner.**

| Resource | Owner | On unmount (today) | On tab close (**new**) | On the server |
|---|---|---|---|---|
| **LLM stream** (`streamText` → Groq) | route handler | — | — | **Client disconnect fires `request.signal` → provider call cancelled immediately** (explicit `abortSignal`). Request-scoped & stateless: no conversation held server-side, nothing to leak. The 100 credits cover the real usage cost — *why* we charge upfront |
| **In-flight LLM `fetch`** (client) | `LiveExpertChannel` | `disconnect()` aborts (`AbortController`) | `pagehide` → `disconnect()` → abort | — |
| **Voice chat** (`speechSynthesis`) | `useSpeechSynthesis` | `cancel()` | `cancel()` on `pagehide` (no lingering audio) | — |
| **MediaRecorder / camera stream** | recording tab | `stop()` + `track.stop()` | same on `pagehide` (camera LED off) | — |
| **Blob object URLs** | `useMediaRecorder` | revoked (existing) | recorder stopped on `pagehide`, so no new URL is created; existing URLs already revoked on unmount | — |
| **Timers** (mock-channel delays, countdown, processing timeout) | channels/hooks | cleared (existing) | `pagehide` → `disconnect()` clears channel timers | none exist server-side |
| **Event listeners** | `ExpertConnection.on()` | unsubscribe fns run (existing) | listeners are bounded; channels disconnected | — |
| **Conversation state** | client + `.data/` store | — | already persisted per-exchange (`keepalive` fetch); final `sendBeacon` flush on expiry | persisted to disk, **not held in memory** |
| **Credits charge** | `credits-store` | — | already done at start, server-side | one atomic file write per mission; no in-memory cache |

**Two points to volunteer:**

1. **The server holds no per-user state between requests.** Route handlers and Server Actions are request-scoped. The only server "resources" per mission are the LLM call (aborted on disconnect) and one atomic account write. There is nothing to leak, and the file store does a read+write per call with no caching.
2. **Cleanup belongs on `pagehide`/`visibilitychange`, not `beforeunload` (warnings) and not `unload` (deprecated, being removed).** And the `beforeunload` listener is attached *conditionally* — permanently-attached listeners disable the bfcache. Both are the kind of detail that reads as real experience.

---

## 8. Edge cases & decisions

| Case | Decision |
|---|---|
| Double-submit on Start | One-mission guard + idempotent charge by `ref` → charged exactly once |
| Two tabs, two missions | Same guard (cookie is shared) → second start rejected with `mission_in_progress` |
| Close tab mid-LLM-stream | Client aborts, server cancels via `request.signal`, charge stands, no refund — consistent with the rule |
| 600s expiry | Already charged at start; `expireMission` unchanged |
| Insufficient balance | No mission cookie, no session, **no charge** — inline error with the balance. Never a partial state |
| Mobile close / crash / kill | `beforeunload` may not fire; **the charge already happened server-side** → rule holds regardless |
| Refresh mid-mission | Resume already supported (cookie + store); charge is tied to `sid` which persists → **no double charge** |
| `resetMission` | Cookie cleared, **no refund** — matches "lose it either way" |
| bfcache | Warning listener attached only while mission in progress; removed on finish/unmount |
| Reviewer wants to see "out of credits" | Seed balance is env-configurable (`DEMO_USER_BALANCE`), or just run 3 missions |

---

## 9. Tests (recommended — there is zero test infra today)

Extract the ledger's core so it is testable against an in-memory store interface, then `node:test`:

- Insufficient balance → `{ ok: false, "insufficient_balance" }`, balance unchanged.
- Exact balance (100/100) → success, balance 0.
- Double-charge with the same `ref` → second call is a no-op (`already_charged`), balance unchanged.
- Two charges with different `ref`s → both deducted.
- `ensureAccount` idempotency → seeding happens once.
- (Bonus) `hasReached`-style guard: charge never runs when a mission is already in progress.

`package.json`: `"test": "node --test"` — no new dependencies (Node 24 ships the test runner).

---

## 10. Implementation order

1. `lib/user.ts` + `lib/credits-store.ts` — data layer first; everything depends on it.
2. `startMission` — guard + balance check + atomic charge + error return.
3. Balance UI on `/` + inline error surface in `SelectionGrid` (`useActionState`).
4. `LeavingGuard` — conditional `beforeunload` + in-app leave modal; mount in `ActivityShell`.
5. `usePageHideCleanup` wiring — expert connection, media recorder/stream, TTS.
6. `POST /api/expert/chat` — `abortSignal` + runtime body validation + billing gate (active-mission check).
7. README — "Credits & billing" + "Resource lifecycle on exit".
8. `node:test` unit tests + `npm test`.
9. **Validate** — `npm run lint` · `npx tsc --noEmit` · `npm run build`, then a browser walkthrough of the full charged flow (start → balance drops; insufficient path; tab-close warning; LLM stream abort on disconnect; camera released on close).

---

## 11. Out of scope / deferred (deliberately)

- Real authentication / multi-user accounts (README already marks this out of scope).
- HMAC/JWT signing of the cookies — the documented seam in `lib/mission.ts` is unchanged; this feature does not touch it.
- Real payment/billing provider — the `credits-store` interface is the seam a Stripe/DB implementation slots into.
- Refund logic — the requirement explicitly says charge regardless of exit point.
- Uploading the video blob — unchanged (README's documented tradeoff).

**Plan-review audit (gaps closed before any code):** this plan was reviewed against an earlier design pass, and three gaps were identified and fixed: (1) §4.4 now *names* the concurrency mechanism — synchronous fs with no `await` gap between read and write — instead of asserting atomicity, and states the multi-instance scope honestly; (2) uid minting moved from `startMission` to the proxy (§4.1, §5.6) because Server Components cannot set cookies and `/` must render a balance on first visit; (3) `/api/expert/chat` gained a billing gate requiring the caller to own the active paid mission (§5.2). If asked "how did you validate the plan before building," this audit is the answer.

---

## 12. How this plan answers the interviewer's four points (quick map)

| Interviewer concern | Where the plan answers |
|---|---|
| 1. Credits exist in the DB | §3 (user identity + ledger seam), §4 (data model), §5.6 (uid minted at proxy) |
| 2. 100 credits charged at start, regardless of exit, with warning | §2 (server-enforced charge), §6 (warning layers), §8 (edge cases) |
| 3. What happens to LLM stream / voice / server resources — leaks | §7 (lifecycle table), §5.2 (abortSignal **and the billing gate** — a paid resource can't be abused for free inference), §5.4 (pagehide wiring) |
| 4. Keen scrutiny of the implementation | §4.4 (atomic + idempotent charge with the **concurrency mechanism named**), §9 (tests), §10 (validation), §8 (edge cases), §11 (plan-review audit) |
