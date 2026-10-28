# CyberLearn AI — Improvement Plan

Source: full-application review (backend, frontend, AI pipeline, planning docs) on 2026-10-27.
Baseline at review time: typecheck clean, 77/77 tests passing, `npm audit --omit=dev` = 27 vulnerabilities (2 high).

Status legend: `[ ]` todo · `[x]` done · `[~]` partially done (see note)

---

## 1. Security and data loss (fix first)

- [x] **1.1 Known default `SESSION_SECRET` in Docker** — `docker-compose.yml:25` ships a fallback secret that passes the production length check; it signs session JWTs and (without `SECRETS_KEY`) encrypts stored API keys.
  Fix: make `SESSION_SECRET` required in compose (`${SESSION_SECRET:?…}`); in production refuse known/default secrets and require `SECRETS_KEY`; warn when `COOKIE_SECURE=false` in production.
- [x] **1.2 SSRF guard bypass for user AI provider URLs** — `backend/src/ai/providers/userProviders.ts`: `fetch` follows redirects, DNS check is separate from the connection (rebinding), IPv6 / IPv4-mapped / reserved ranges incomplete.
  Fix: `redirect: 'error'`; pin the vetted IP at connect time (undici `Agent` with a checked `lookup`); complete private/reserved range list.
- [x] **1.3 Stored API key sent to a changed base URL** — `backend/src/modules/account/account.routes.ts:111`.
  Fix: require the key to be re-entered whenever `baseUrl` changes.
- [x] **1.4 Stuck generations** — a crashed worker leaves runs `queued`/`running` forever, blocking the project and the user's concurrency slot; cancel on `running` only sets an unread flag; `enqueue` failure after `Generation.create` strands the run.
  Fix: heartbeat/`lockedUntil` on Generation, periodic sweeper that fails stale runs (retryable), cancel force-fails stale runs, pipeline honours `cancelRequested`, roll back on enqueue failure.
- [x] **1.5 Double-submit starts two pipelines** — `/continue` and `/retry` check-then-save; job IDs contain `Date.now()`.
  Fix: atomic `findOneAndUpdate` state transitions, deterministic job IDs, atomic `queued → running` claim in `runGeneration`.
- [x] **1.6 Lesson autosave loses edits** — `frontend/src/features/lessons/LessonViewerPage.tsx:482` drops the pending draft on unmount; out-of-order PATCH responses overwrite newer text.
  Fix: flush pending draft on unmount, `beforeunload` guard while unsaved, ignore stale responses via a sequence number.
- [x] **1.7 Vulnerable dependencies** — `image-size` (high, via `pptxgenjs`), TipTap v2 (`mergeAttributes` XSS advisory).
  Fix: npm `overrides` for `image-size@^2.0.4`; upgrade TipTap to v3 and `tiptap-markdown` to 0.9.

## 2. Reliability and performance

- [x] **2.1 Single 2.3 MB frontend bundle** — `frontend/src/app/router.tsx` imports every page eagerly; `lazyPage` exists but is unused; `chunkSizeWarningLimit` raised to hide the warning.
  Fix: lazy-load routes; restore the default warning limit.
- [x] **2.2 AI budget gaps** (`backend/src/services/aiBudget.ts`) — counts characters not tokens; failed (but paid) calls not recorded; check-then-call race; image and speech calls not metered.
  Fix: record `usage` tokens + model; record in `finally` including failures; atomic reservation with conditional `$inc`; meter image/TTS.
- [x] **2.3 Retries multiply AI cost** — repair call × 3 stage attempts × SDK retries × BullMQ attempts; `AiOutputError` treated as retryable.
  Fix: a second invalid output is final (non-retryable).
- [x] **2.4 Generation page stream** — `useGenerationStream.ts` keeps a stale event after retry; no fallback when the SSE connection dies; stream not closed on terminal status.
  Fix: reset state per run, poll while disconnected, close on terminal status.
- [x] **2.5 Presentation player** — resume position ignored if progress loads late; clock survives route changes; `useNarration.ts` leaks an `AudioContext` per manifest change.
  Fix: wait for progress before creating the clock, key the page by lesson id, close the AudioContext in cleanup.
- [x] **2.6 Smaller backend fixes**
  - Deleting a project doesn't stop its running generation.
  - Retrying the "lesson" stage regenerates nothing (sections reused).
  - Failed uploads are treated as duplicates and can never be re-uploaded.
  - Logout doesn't revoke the JWT (bump `sessionVersion`).
  - MinIO console exposed with default credentials.
  - Export responses leak `storageKey`; exports have no specific rate limit.
  - Text indexes not owner-scoped.
  - Account export is unbounded / O(S×C).
  - `Activity` grows without bound (TTL); `GET /lessons` loads every presentation.
  - Raw parser error messages reach users.
  - Container has no init process; worker has no healthcheck.

## 3. AI quality

- [x] **3.1 Ask My Notes retrieval** — in-lesson Ask takes the first 16 chunks in document order (`ask.routes.ts:33`); library Ask is keyword-only `$text`; the question sits inside the untrusted `<source_material>` wrapper.
  Fix: rank chunks against the question (BM25), optional embeddings (`AI_EMBEDDING_*`) with hybrid rank fusion, question moved outside the untrusted wrapper.
- [x] **3.2 Native structured output + prompt caching** — schema pasted into the prompt then repaired with an extra call; per-section system prompt defeats caching.
  Fix: Anthropic JSON-schema output (Zod still validates), section title moved to user content, `cache_control` on the stable system block.
- [x] **3.3 Truncated answers** — `max_tokens` stop is a hard failure with a 16k cap.
  Fix: stream with a higher cap; retry once on truncation.
- [x] **3.4 Inflated citations** — an uncited section is credited to all its input chunks (`lessonGenerator.ts:55`).
  Fix: record "no citation"; verify commands / event IDs / queries appear verbatim in cited source.
- [x] **3.5 Small items** — unused `sourceText` in assessment stage; looser sanitising of `<source_material>` delimiter variants; generate sections with limited concurrency; optional AI rubric grading for short answers (cheap model).

## 4. Code health

- [x] **4.1** Delete stray `frontend/src/features/presentations/playground-*.mongodb.js`; ignore `*.mongodb.js`.
- [x] **4.2** Split large components (`LessonViewerPage`, `PlayerPage`, `SlideStage`, `AppLayout`).
- [x] **4.3** Accessibility: Modal (`aria-labelledby`, double `onClose`), Menu (arrow keys, focus in/out), CommandPalette (focus trap/restore, listbox semantics), Player tabs.
- [x] **4.4** Global 401 handling → redirect to login (`app/query-client.ts`).
- [x] **4.5** Memoize diagram / knowledge-graph node + edge building; remove O(E²) edge filter.
- [x] **4.6** Invalidate `['lessons']` when a generation finishes; consolidate duplicate response types; decode CSRF cookie.
- [x] **4.7** Tests: frontend (`frame.ts`, `useGenerationStream`, `lib/api.ts`, autosave, overlay keyboard behaviour); backend (SSRF bypasses, double-submit, stuck-run recovery, delete-while-generating, budget under failure/concurrency, cross-user access).
- [x] **4.8** README test count and docs updated.

## 5. Feature ideas

- [ ] **5.1 SOC Investigation Simulator** — generated log case, evidence board, timeline, hypotheses, hints, rubric-graded report.
- [ ] **5.2 Hands-on labs / CTF-style challenges** — query/flag challenges generated from a lesson, checked against a fixture dataset.
- [ ] **5.3 Adaptive learning paths** — diagnostic + quiz/SM-2 performance drive the next module; send learners back to prerequisites.
- [ ] **5.4 Teach-back mode** — learner explains a concept, AI asks follow-ups and grades against the source.
- [ ] **5.5 Incremental regeneration** — when notes change, regenerate only affected sections; keep manual edits and flashcard history.
- [ ] **5.6 Lesson quality report** — uncited sections, commands not in source, topics with no quiz coverage.

---

## Implementation log

_Updated as work lands._

- **1.7** — TipTap upgraded to v3.32 + `tiptap-markdown` 0.9 (`MarkdownEditor.tsx` storage typing adjusted); root `overrides` pins `image-size@^2.0.4` (pptxgenjs never imports it). `npm audit --omit=dev`: 27 → 0. Added `undici` + `ipaddr.js` to backend for the SSRF fix.

### Wave 1 — fixes (2026-10-27)

Verification after wave 1: `npm run typecheck` clean · tests 10 shared + 86 backend + 39 frontend = 135 passing · `npm run build` OK, no chunk > 500 kB · `npm audit --omit=dev` 0 vulnerabilities · Playwright e2e 5/5.

- **1.1** `docker-compose.yml` requires `SESSION_SECRET` and `SECRETS_KEY`; `config/env.ts` rejects known/weak secrets in production, requires `SECRETS_KEY`, warns on `COOKIE_SECURE=false`. Upgrade note in `.env.example`/README: set `SECRETS_KEY` to the old `SESSION_SECRET` to keep saved API keys readable.
- **1.2** `utils/safeFetch.ts`: user-chosen provider URLs connect only to public unicast IPs (checked inside the socket's DNS lookup, so rebinding is caught), redirects refused. Server-configured URLs (e.g. Ollama in `.env`) unchanged.
- **1.3** Changing a custom provider URL requires re-entering the API key.
- **1.4/1.5** Generation `heartbeatAt` + `services/generationSweeper.ts`; atomic continue/retry/cancel and run claim; deterministic job IDs; enqueue failure marks the run failed (503).
- **1.6** `features/lessons/useLessonAutosave.ts`: flush on unmount, `beforeunload` guard, stale responses ignored.
- **2.1** Route-level lazy loading + vendor chunks: initial JS 2.47 MB → ~766 kB; largest chunk 387 kB (Progress/recharts).
- **2.2** Real token usage per call (incl. failed/repair calls), atomic reservation, optional `AI_DAILY_TOKEN_LIMIT`, image/speech metered via `runWithAiOwner`.
- **2.3** Invalid AI output after one repair is final; network/429/5xx still retried.
- **2.4/2.5** Generation stream resets per run, polls while disconnected; player waits for saved progress, keyed per lesson; AudioContext closed.
- **2.6** Project delete cancels its generation; explicit lesson retry regenerates sections; failed uploads can be re-uploaded; logout bumps `sessionVersion` (signs out all devices); MinIO console on 127.0.0.1; `storageKey` hidden; export rate limit; streamed account backup; Activity TTL 400 days (streaks look back 400 days); lean `GET /lessons`; tini + worker healthcheck; owner-scoped text indexes on SourceChunk and Lesson.
- **3.1** `ai/retrieval.ts` BM25 + reciprocal rank fusion; optional embeddings (`AI_EMBEDDING_*`); question moved outside the untrusted wrapper.
- **3.2/3.3** Anthropic: native JSON-schema output, cached stable system prompt, streaming with 32k→64k truncation retry. OpenAI-compatible: `response_format` json_schema with remembered fallback.
- **3.4** Uncited sections get no refs; `unverifiedClaims` flags commands/event IDs not found verbatim in the source (shown in the lesson viewer).
- **3.5** Delimiter sanitising hardened; sections written 3 at a time; optional AI rubric grading (`AI_RUBRIC_GRADING=true`, Haiku 5.5 on Anthropic).
- **4.x** Stray playground files removed; large components split; Modal/Menu/CommandPalette/Player tabs accessibility; global 401 → login; memoized diagram/graph building; shared response types; 5 new frontend test files; e2e scroll-spy test made pointer-independent.

### Follow-up found while testing (2026-10-27)

A real run showed "Unexpected error during this stage" in the diagram stage. Cause: the OpenRouter account had run out of credit (`402`), and the stage error was masked by `safeError`. Fixed:
- `openaiCompatible.ts`: shows the provider's message instead of raw JSON ("AI provider account is out of credits (402): …"); waits and retries on OpenRouter's in-flight-credit 402; parses "can only afford N" and retries with a lower `max_tokens`.
- `generationPipeline.ts`: when every diagram fails at the provider, that provider error is reported (with its retry semantics); other failures say "No diagram could be generated (…)" instead of the generic text.

### Automatic model fallback (2026-10-28)

- New **OpenRouter** preset (`packages/shared/src/aiProviders.ts`) and a per-user **fallback model list** (up to 5, `aiSettings.fallbackModels`).
- `OpenAICompatibleTextProvider` tries the main model, then each fallback in order, on errors another model may survive: 402 out of credits, 429 rate limit, 404/400 unknown model, 408/5xx, timeout, empty reply. A rejected key (401/403) never switches. The working model is remembered; the main model is retried after an hour. Each switch is logged ("AI model unavailable, switching to fallback model"), and token usage records the model that actually answered.
- Settings → AI provider: "Fallback models" box (one per line) and an **Add free models** button that picks `:free` models from the loaded model list. Not available for Claude (Anthropic protocol).
- Tests: `aiQuality.test.ts` (switch order, remembered switch, no switch on 401), `aiSettings.test.ts` (save/return, 5-model cap), `AiProviderCard.test.ts` (helpers).
- Saving **OpenRouter** with an empty fallback list now fills it automatically with up to 5 `:free` models (`PUT /account/ai` returns them; Settings shows "If <model> hits a limit, the app switches automatically to: …").
- Settings model picker: a dropdown of every loaded model with a "Free models only (N free)" switch, replacing the browser suggestion list that filtered down to one model.
- A model whose answer can't be turned into the required JSON (after its repair attempt) now also triggers a switch to the next fallback model; the failed attempts are still billed. Found when `nvidia/nemotron-3.5-content-safety:free` (a safety classifier, not a chat model) was chosen as the main model.
- `isLikelyChatModel` (shared): safety/guard/moderation/embedding/speech models are never auto-selected or auto-added as fallbacks, are listed last in the picker, and are labelled "not a chat model".
- Rate limits (429) on free models: concurrent requests no longer skip fallback models when switching at the same moment; when every model is rate-limited the provider waits (`Retry-After`, else 20 s then 40 s) and cycles through the models again (2 rounds); stage retries after a 429 wait 15 s / 30 s; sections are written one at a time on `:free` models; OpenRouter's generic "Provider returned error" is expanded to the upstream provider's name and message.
