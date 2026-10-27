# CyberLearn AI — Complete Application Audit & Detailed Design Plan

**Workspace:** `/home/waji/CyberLearn Ai`  
**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 | Node.js + Express 5 + TypeScript + MongoDB (Mongoose) + Redis (BullMQ) + S3/Local Storage  
**Live Status:** All 8 Phases (Phases 0–8) are implemented, wired, and running (`http://localhost:5173` frontend, `http://localhost:4000` backend API).

---

# Part 1: Full Inspection & Audit of the `CyberLearn Ai` Folder

## 1.1 Monorepo & Root Architecture

The project is organized as an **npm workspaces monorepo** (`package.json`) with three workspaces (`packages/shared`, `backend`, `frontend`) and Docker orchestration:

```text
CyberLearn Ai/
├── package.json                                  # Workspaces: packages/shared, backend, frontend
├── tsconfig.base.json                            # Strict shared TypeScript configuration
├── docker-compose.yml                            # Full production-like stack (Mongo, Redis, MinIO, API, Worker, Web)
├── docker-compose.dev.yml                        # Infrastructure-only compose (Mongo, Redis, MinIO)
├── .env.example                                  # Environment variable template
├── Setupimplementation.md                        # Specification + Phase 0–8 completion checklist
├── CyberLearn AI - Implementation Plan and Ideas.md
├── CyberLearn_AI_Application_Audit_and_Design_Plan.md
├── packages/
│   └── shared/                                   # @cyberlearn/shared — Canonical Zod schemas & deterministic layout
├── backend/                                      # @cyberlearn/backend — Express 5 API + BullMQ Worker + AI Pipeline
└── frontend/                                     # @cyberlearn/frontend — React 19 + Tailwind CSS v4 + React Flow + Recharts
```

---

## 1.2 Shared Package Audit (`packages/shared/src`) — ✅ 100% Complete (10/10 Tests Passing)

Every data structure exchanged between the AI providers, Express backend, MongoDB, and React frontend is strictly validated in `@cyberlearn/shared`:

| File | Responsibility & Key Schemas |
| :--- | :--- |
| `preferences.ts` | `LanguageSchema` (`en`, `roman-urdu`, `bilingual`), `DifficultySchema` (`beginner`, `intermediate`, `advanced`), `VisualModeSchema` (`diagrams`, `illustrations`, `both`), `GenerationPreferencesSchema`, `UserPreferencesSchema`, upload limits (`MAX_UPLOAD_BYTES = 20MB`, `MAX_PASTED_TEXT_CHARS = 200,000`). |
| `analysis.ts` | `VisualTypeSchema` (12 visual types), `PlannedSectionSchema`, `PlannedVisualSchema`, `KeyTermSchema`, `ConceptRelationshipSchema`, `ContentAnalysisSchema` (validates unique section IDs and valid visual-to-section references). |
| `lesson.ts` | `SourceReferenceSchema` (`sourceId`, `chunkIndex`, `excerpt`), `CodeSnippetSchema`, `GroundingSchema` (`source`, `supplementary`, `mixed`), `LessonSectionSchema`, `GeneratedSectionSchema`. |
| `diagram.ts` | `NodeKindSchema` (`source`, `processor`, `storage`, `destination`, `actor`, `decision`, `concept`, `event`), `DiagramNodeSchema`, `DiagramEdgeSchema`, `DiagramSpecSchema` (enforces unique IDs, no self-loops, valid edge endpoints, and deterministic `layoutDiagram()`). |
| `presentation.ts` | `SlideTypeSchema` (10 slide templates), `AnimationEventSchema` (`reveal`, `highlight`, `moveAlongPath`, `dim`), `CaptionSchema`, `NarrationSchema`, `SlideSchema`, `PresentationManifestSchema` (validates all animation `targetId` and `pathId` references against slide elements). |
| `assessment.ts` | `QuestionSchema` (`mcq`, `true-false`, `short-answer`, `scenario`, `log-analysis`), `PublicQuestionSchema` (strips `correctOptionIndex` and `answer` before sending quizzes to the client), `FlashcardSchema`. |
| `spacedRepetition.ts` | SM-2 spaced repetition algorithm (`reviewFlashcard()`) computing `intervalDays`, `easeFactor`, `repetitions`, `lapses`, and `nextReviewAt`. |
| `generation.ts` | `GENERATION_STAGES` (`extracting`, `analyzing`, `lessons`, `visuals`, `diagrams`, `images`, `narration`, `presentation`, `assessment`, `saving`), `StageResultSchema`, `GenerationStatusSchema`. |
| `api.ts` | Request payload schemas for Auth, Subjects, Learning Paths, Projects, Sources, Generations, Lessons, Presentations, Reviews, and Exports. |

---

## 1.3 Backend Audit (`backend/src`) — ✅ 100% Complete (50/50 Integration Tests Passing)

### 1. Mounted API Modules (`backend/src/app.ts`)
All 12 REST + SSE route modules are mounted under `/api/v1` with `helmet`, `cors`, `cookieParser`, `apiLimiter`, `csrfProtection`, `authenticate`, and `findOwned` ownership enforcement:

| Module | File | Endpoints & Capabilities |
| :--- | :--- | :--- |
| **Health** | `app.ts` | `GET /api/v1/health` — Reports MongoDB connection state and job queue driver health. |
| **Auth** | `modules/auth/auth.routes.ts` | `POST /auth/register`, `/login`, `/logout`, `/forgot-password`, `/reset-password`, `/change-password`, `GET /auth/me`. Uses HTTP-only session cookies + CSRF token header. |
| **Subjects & Paths** | `modules/subjects/subjects.routes.ts` | CRUD for dynamic `Subjects` (`/subjects`) and ordered `LearningPaths` (`/learning-paths`), plus automatic seeding of default subjects (*SOC & Blue Team*, *Penetration Testing*, *Cloud Security*, *AI Security*, *University & Other Studies*). |
| **Projects** | `modules/projects/projects.routes.ts` | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/duplicate`, `GET /projects/:id/activity`. Supports search, subject/status/tag/favorite filters, and pagination. |
| **Sources** | `modules/sources/sources.routes.ts` | `POST /projects/:id/sources/text` (paste notes), `POST /projects/:id/sources/upload` (PDF, DOCX, TXT, MD with magic-byte validation & worker-thread extraction), `GET /sources/:id`, `GET /sources/:id/original`, `DELETE /sources/:id`. |
| **Generations** | `modules/generations/generations.routes.ts` | `POST /projects/:id/generations`, `GET /generations`, `GET /generations/:id`, `POST /generations/:id/continue` (plan approval), `POST /generations/:id/retry` (per-stage or full retry), `POST /generations/:id/cancel`, `GET /generations/:id/events` (live SSE stream). |
| **Lessons** | `modules/lessons/lessons.routes.ts` | `GET /lessons`, `GET/PATCH /lessons/:id` (autosave with version history), `GET /lessons/:id/versions`, `POST /lessons/:id/versions/:version/restore`, `POST /lessons/:id/sections/:sectionId/regenerate`, `POST /lessons/:id/sections/:sectionId/examples`, `PATCH /lessons/:id/diagrams/:diagramId`, `GET/PATCH /lessons/:id/progress`. |
| **Presentations** | `modules/presentations/presentations.routes.ts` | `GET /presentations`, `GET /lessons/:id/presentation`, `PATCH /presentations/:id` (slide & playback settings editor), `GET/POST /presentations/:id/versions`, `POST /presentations/:id/versions/:version/restore`. |
| **Assets & Gallery** | `modules/assets/assets.routes.ts` | `GET /lessons/:id/assets`, `GET /assets/:id` (streams image/audio/export files with ownership check), `POST /assets/:id/regenerate`, `PUT /assets/:id/file` (custom image replacement). |
| **Revision & Quizzes** | `modules/revision/revision.routes.ts` | `GET /lessons/:id/flashcards`, `GET /flashcards`, `POST /flashcards/:id/review` (SM-2 grading), `GET /lessons/:id/quizzes`, `GET /quizzes`, `GET /quizzes/:id`, `POST /quizzes/:id/attempts` (server-side grading & rubric evaluation), `GET /revision/due`, `GET /revision/review-questions`. |
| **Exports** | `modules/exports/exports.routes.ts` | `GET /lessons/:id/exports`, `POST /lessons/:id/exports`, `POST /presentations/:id/exports`, `GET /exports/:id` (generates PDF study notes via `pdfkit`, editable PPTX slides with speaker notes via `pptxgenjs`, and Markdown). |
| **Ask My Notes** | `modules/ask/ask.routes.ts` | `POST /ask` & `POST /lessons/:id/ask` (grounded Q&A with chunk citations and quick actions: *Explain again*, *Give an example*, *Go deeper*). |
| **Knowledge Graph** | `modules/knowledge/knowledge.routes.ts` | `GET /knowledge-graph` (aggregates concepts, definitions, subject colors, and stated/co-occurring edges across all lessons). |
| **Account & Settings** | `modules/account/account.routes.ts` | `GET /account/overview` (AI usage, storage breakdown, active providers), `PATCH /account/profile`, `POST /account/logout-all`, `GET /account/export` (full JSON backup), `DELETE /account`. |

### 2. Background Job & AI Pipeline (`backend/src/services/generationPipeline.ts`)
- Coordinates all 10 stages (`extracting → analyzing → lessons → visuals → diagrams → images → narration → presentation → assessment → saving`).
- Supports `awaiting_review` pause after `analyzing` so the user can edit the title, toggle sections on/off, or adjust preferences before expensive media generation runs.
- Isolates optional media failures (`partially_completed`) and reuses already-completed sections/assets on retry.

---

## 1.4 Frontend Audit (`frontend/src`) — ✅ All 14 Screens Implemented & Wired

All routes in `frontend/src/app/router.tsx` are implemented and connected to the backend API:

| Route | Component | Spec Screen | Status |
| :--- | :--- | :--- | :---: |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | `features/auth/AuthPages.tsx` | Authentication | ✅ Complete |
| `/` | `features/dashboard/DashboardPage.tsx` | **Screen 1: Dashboard** | ✅ Complete |
| `/create` | `features/projects/CreateLessonPage.tsx` | **Screen 2: Create New Lesson** | ✅ Complete |
| `/projects/:id` | `features/projects/ProjectPage.tsx` | **Project Detail & Source Viewer** | ✅ Complete |
| `/generations/:id` | `features/generation/GenerationPage.tsx` + `AnalysisPreview.tsx` | **Screens 3 & 4: Analysis Preview & SSE Generation Workspace** | ✅ Complete |
| `/lessons/:id` | `features/lessons/LessonViewerPage.tsx` + `SectionEditor.tsx` + `AskPanel.tsx` | **Screen 5: 3-Panel Lesson Viewer & AI Teacher** | ✅ Complete |
| `/lessons/:id/present` & `/presentations` | `features/presentations/PlayerPage.tsx` + `SlideStage.tsx` + `SlideEditor.tsx` | **Screen 6: Animated 16:9 Presentation Player** | ✅ Complete |
| `/lessons/:id/diagrams/:diagramId?` | `features/diagrams/DiagramExplorerPage.tsx` + `DiagramView.tsx` | **Screen 7: Interactive Diagram Explorer** | ✅ Complete |
| `/lessons/:id/gallery` | `features/media/GalleryPage.tsx` | **Screen 8: AI Image Gallery** | ✅ Complete |
| `/revision` | `features/revision/RevisionCenterPage.tsx` + `QuizRunner.tsx` | **Screen 9: Revision Center (Flashcards, Quizzes, Mistakes)** | ✅ Complete |
| `/library` | `features/projects/LibraryPage.tsx` | **Screen 10: My Library** | ✅ Complete |
| `/progress` | `features/progress/ProgressPage.tsx` | **Screen 11: Learning Progress (Recharts Analytics)** | ✅ Complete |
| `/settings` | `features/settings/SettingsPage.tsx` | **Screen 12: Settings, Providers, Usage & Backup** | ✅ Complete |
| `/subjects` | `features/subjects/SubjectsPage.tsx` | **Dynamic Subjects & Learning Paths** | ✅ Complete |
| `/ask` | `features/ask/AskPage.tsx` | **Ask My Notes (Global Grounded Search)** | ✅ Complete |
| `/knowledge-graph` | `features/knowledge/KnowledgeGraphPage.tsx` | **Knowledge Graph ("Connect My Knowledge")** | ✅ Complete |

### Minor Housekeeping Finding During Folder Check
- Inside `frontend/src/features/presentations/`, there are two stray VS Code MongoDB extension scratch files: `playground-1.mongodb.js` and `playground-2.mongodb.js`. They are not imported by any TypeScript code, so they do not affect the build, but they can be safely removed or ignored in `.gitignore` (`*.mongodb.js`).

---

# Part 2: Detailed Design Plan of CyberLearn AI

This section documents the complete **Visual Design System, Information Architecture, Screen-by-Screen UI/UX Design Blueprint, and Next-Generation Design Enhancements** for CyberLearn AI.

---

## 2.1 Visual Design System & Theme Architecture

### 1. Color System & Semantic Tokens (`frontend/src/styles.css`)
CyberLearn AI is designed around a **Dark SOC Operations & Technical Studio** palette that maximizes readability for long technical explanations, terminal blocks, and node graphs:

```text
+-----------------------------------------------------------------------+
| BACKGROUND & SURFACE LAYERS                                           |
| --color-bg        #0B1020   Main application canvas                   |
| --color-sidebar   #10182A   Collapsible left navigation & minimap     |
| --color-surface   #121B30   Primary cards, panels, modals             |
| --color-surface-2 #18233B   Hover states, active pills, code chips    |
| --color-border    #263449   1px structural borders & table dividers   |
+-----------------------------------------------------------------------+
| ACCENT & SEMANTIC TOKENS                                              |
| --color-primary   #38BDF8   Sky Cyan (Primary CTA, focus, active flow)|
| --color-secondary #8B5CF6   Cyber Violet (AI context, timeline nodes) |
| --color-text      #F1F5F9   Primary text (>13:1 contrast on #0B1020)  |
| --color-muted     #94A3B8   Secondary metadata, timestamps, hints     |
| --color-success   #34D399   Source-grounded, completed, understood    |
| --color-warning   #FBBF24   Partial status, bookmarks, supplementary  |
| --color-error     #F87171   Failed jobs, mistakes, danger actions     |
+-----------------------------------------------------------------------+
```

### 2. Diagram Node Semantic Color Coding (`KIND_COLORS` in `@cyberlearn/shared`)
Every technical diagram in the Lesson Viewer, Diagram Explorer, and Presentation Player uses deterministic semantic colors by node role:
- **`source`** (`#38BDF8` Sky Cyan) — Log sources, endpoints, user requests, network packets.
- **`processor`** (`#8B5CF6` Violet) — Logstash, SIEM correlation engines, parsers, API gateways.
- **`storage`** (`#34D399` Emerald) — Elasticsearch indices, databases, SIEM data lakes, S3 buckets.
- **`destination`** (`#FBBF24` Amber) — SOC analyst dashboards, SIEM alerts, incident tickets.
- **`decision`** (`#F472B6` Rose) — Triage branching points, firewall rules, auth checks.
- **`actor`** (`#22D3EE` Cyan) — Analyst, attacker, user, service account.
- **`event`** (`#F87171` Red) — Security alert, failed logon, intrusion event.
- **`concept`** (`#94A3B8` Slate) — Theoretical or abstract concept nodes.

### 3. Typography & Reading Ergonomics
- **Sans-Serif (`Inter`):** Used for UI controls, navigation, and `.prose-cl` lesson prose (`line-height: 1.75` for comfortable long-form study).
- **Monospace (`JetBrains Mono`):** Used for pasted study notes, SIEM queries (`KQL`/`SPL`), CLI commands, log snippets, and slide terminal walkthroughs on a `#070B16` terminal surface.

---

## 2.2 Global Layout & Responsive Architecture (`AppLayout.tsx`)

```text
+-----------------------------------------------------------------------------------+
| STICKY TOP BAR (h-16, bg-bg/85 backdrop-blur, border-b border-border)             |
| [≡ Mobile] [ 🔍 Search lessons, tags, subjects… ] [Workspace ▾] [+ New] [🔔] [👤] |
+------------------+----------------------------------------------------------------+
| LEFT SIDEBAR     | MAIN CONTENT SCROLL CONTAINER (max-w-[1600px] mx-auto)         |
| (w-64 expanded / |                                                                |
|  w-[72px] icon)  |  • Responsive padding: px-4 sm:px-6 lg:px-8 py-6               |
|                  |  • Keyboard accessibility: "Skip to content" link, Escape      |
| 1. Dashboard     |    closes modals/popovers, full focus-visible outlines.        |
| 2. My Library    |                                                                |
| 3. Create Lesson |  • Global Workspace Filter: Selecting a Subject in the TopBar  |
| 4. Presentations |    automatically filters My Library and pre-fills Create       |
| 5. Flashcards    |    Lesson without hardcoding any subject.                      |
| 6. Quizzes       |                                                                |
| 7. Progress      |  • Live Job Bell (🔔): Polls active generations and links      |
| 8. Subjects      |    directly to /generations/:id.                               |
| 9. Ask My Notes  |                                                                |
| 10. Knowledge    |                                                                |
| 11. Settings     |                                                                |
+------------------+----------------------------------------------------------------+
```

---

## 2.3 Screen-by-Screen Design Blueprint

### 1. Dashboard (`/` — `DashboardPage.tsx`)
- **Purpose:** Honest, real-time command center of the user's learning activity.
- **Layout:**
  - **Row 1 (5 Stat Cards):** `Lessons created`, `Presentations`, `Completed lessons`, `Quiz performance`, `Study streak`.
  - **Row 2 (2:1 Split):** `Continue learning` card (shows completion progress bar and `Open lesson` / `Play` buttons) + `Recommended revision` card (due + unseen flashcards with `Start revision` CTA).
  - **Row 3 (Conditional):** Live `Generation jobs running` banner with stage badges.
  - **Row 4 (2:1 Split):** `Recent projects` list + stacked `Topics marked as difficult` (from quiz mistakes) and `Recently studied`.

### 2. Create New Lesson (`/create` — `CreateLessonPage.tsx`)
- **Purpose:** Universal study importer supporting one-click generation or customized preferences.
- **Layout (2:1 Desktop Grid):**
  - **Left Column (`xl:col-span-2`):**
    1. **Source Material Card:** Lesson Title input, Subject dropdown (`Detect automatically` or any user subject), Monospace Paste Editor (`min-h-[300px]`, live character counter up to `200,000`), and comma-separated Tags.
    2. **Upload Documents Card:** Drag-and-drop dropzone accepting `.pdf`, `.docx`, `.txt`, `.md` (up to 10 files, 20MB each) with per-file upload status badges.
  - **Right Sticky Card (`xl:sticky xl:top-20`):**
    - `Review the plan first` toggle.
    - Collapsible `Advanced preferences` (`Language`: English / Roman Urdu / Bilingual, `Explanation level`, `Presentation density`, `Visual mode`, `Narration`, `Quiz generation`, `Flashcard generation`).
    - Primary CTA (`Generate Learning Experience`), Secondary CTA (`Save project without generating`), and Security Notice banner.

### 3. Content Analysis Preview & Generation Workspace (`/generations/:id` — `GenerationPage.tsx` & `AnalysisPreview.tsx`)
- **Phase A — Analysis Preview (`status === 'awaiting_review'`):**
  - Displays editable Lesson Title, detected Subject, Main Topic, Difficulty, and Suggested Slide Count.
  - Highlights any **Ambiguity / Incomplete Source Warnings** in an amber alert box.
  - Interactive checklist of **Planned Sections** (toggle sections on/off before generating) alongside **Proposed Visuals**, **Prerequisites**, and **Key Terms**.
- **Phase B — Live SSE Generation Workspace:**
  - Streams stage updates over Server-Sent Events (`useGenerationStream.ts`) with a `live / reconnecting…` indicator.
  - Shows all 10 pipeline stages with `StageIcon` (`pending`, `running`, `completed`, `failed`, `skipped`), execution details, and per-stage **`Retry`** / **`Redo`** buttons.

### 4. Lesson Viewer & AI Teacher (`/lessons/:id` — `LessonViewerPage.tsx`)
- **Layout (3-Column Studio Grid: `240px` Outline | `1fr` Reading & Editing | `300px` AI Teacher & Context):**
  - **Left Sticky Outline:** Progress bar of understood sections + clickable section list with completion checkmarks (`CheckCircle2`) and bookmark icons (`Bookmark`).
  - **Center Reading / Editing Column:**
    - Learning Objectives card at the top.
    - Per-section cards with **Epistemic Grounding Badges** (`From your notes`, `Notes + supplementary`, `Supplementary explanation`), `Mark understood` button, and `Bookmark` toggle.
    - Structured collapsible blocks: **Definition** (cyan left border callout), **Detailed explanation**, **Why it matters**, **How it works**, **Embedded Interactive Diagram** (with link to Diagram Explorer), **Technical example**, **Code / Command Snippets** (with copy button), **Common mistakes**, **Practical application**, **Supplementary notes** (violet callout), and **Key takeaway**.
    - Section footer actions: `Generate more examples` and `Regenerate section` (saves prior text to Version History first).
    - **Edit Mode (`SectionEditor.tsx`):** Switches sections into Tiptap rich-Markdown editors with 1.5s debounced autosave and a `VersionHistory` modal for 1-click version restore.
  - **Right Sticky Context Rail:**
    - **Key Concepts & Definitions** for the active section.
    - **Related Flashcards** (click to flip inline).
    - **AI Teacher (`AskPanel.tsx`):** Quick buttons (`Explain again`, `Give an example`, `Go deeper`) + custom question input grounded in the lesson's source chunks with clickable citations.
    - **Important Warnings** and **Source References** (Chunk index + verbatim excerpt).

### 5. Animated Presentation Player (`/lessons/:id/present` — `PlayerPage.tsx` & `SlideStage.tsx`)
- **Architecture:**
  - **16:9 Scaled Stage (`1280×720` coordinate system):** Uses `ResizeObserver` to scale smoothly to any viewport width while keeping typography, diagrams, and percentage-based image annotations pixel-exact.
  - **Single Master Clock (`PresentationClock` in `clock.ts`):** Uses `useSyncExternalStore` so only the `Stage` re-renders at 60fps while the `SidePanel` and `Controls` subscribe to throttled slices (`quarter-second` / `tenth-second`).
  - **10 Visual Slide Layouts (`SlideStage.tsx`):**
    1. `title` (Hero title, objectives, optional cover illustration)
    2. `bullets` (Glowing cyan bullet points revealed sequentially)
    3. `progressive-diagram` (Nodes and edges appear step-by-step)
    4. `data-flow` (Animated tokens travel along SVG edges via `moveAlongPath` events)
    5. `decision-flow` (Branching analyst triage diagram)
    6. `terminal` (macOS-style terminal window typing commands character-by-character and revealing output)
    7. `timeline` (Horizontal chronological incident/process timeline with glowing violet nodes)
    8. `comparison` (2-column Good Practice `#34D399` vs. Common Mistakes `#F87171` cards)
    9. `concept-illustration` (AI illustration with animated HTML/SVG coordinate badge overlays)
    10. `summary` (Key takeaways recap)
  - **Synchronized Narration (`useNarration.ts`):** Plays server-generated TTS audio assets or falls back seamlessly to Web Speech API synthesis synchronized with the presentation clock, plus live captions and clickable transcript seeking.

### 6. Diagram Explorer (`/lessons/:id/diagrams/:diagramId?` — `DiagramExplorerPage.tsx`)
- Interactive **React Flow** + SVG canvas (`560px` height) with zoom, pan, fit-view, and step-by-step **Animation Replay** (`Play`, `Pause`, `Show all`).
- **Right Inspector Rail:** Shows selected node's `kind` color badge, description, clickable incoming/outgoing relationship edges, ordered `Sequence of events`, and link back to the lesson section.
- **Actions:** `Edit labels` modal (rename nodes, change node kinds, edit/remove edges) + client-side `SVG` and high-DPI `PNG` download.

### 7. AI Image Gallery (`/lessons/:id/gallery` — `GalleryPage.tsx`)
- Displays all generated illustrations for the lesson with their prompt, provider metadata, section link, slide usage badges, **Regenerate** action, **Replace with custom image upload**, and **Download**.

### 8. Revision Center (`/revision` — `RevisionCenterPage.tsx` & `QuizRunner.tsx`)
- **4-Tab Interface (`Flashcards`, `Quizzes`, `Mistake review`, `Bookmarked`) + Right Schedule Rail (`Today due count`, `7-day upcoming review bar chart`, `Weak topics`):**
  - **Flashcards:** Interactive flip card with 4 SM-2 grading buttons (`Again`, `Hard`, `Good`, `Easy`).
  - **Quizzes:** Supports `mcq`, `true-false`, `short-answer`, `scenario`, and `log-analysis` questions, question bookmarking, server-side rubric grading, and detailed post-attempt feedback showing missing rubric points and source section links.

### 9. Learning Progress (`/progress` — `ProgressPage.tsx`), Ask My Notes (`/ask`), Knowledge Graph (`/knowledge-graph`), and Settings (`/settings`)
- **Learning Progress:** 8 KPI stat cards, 30-day Study Minutes `BarChart`, Quiz Score Trend `LineChart` (with accessible `<details>` data tables), Per-Lesson progress table, and Repeated Mistakes list.
- **Ask My Notes:** Global search & Q&A across all saved sources with `Answered from your notes` vs. `Not covered by your notes` badges and clickable citations.
- **Knowledge Graph:** Force-directed React Flow graph where concept nodes have multi-color conic-gradient rings representing the subjects they bridge.
- **Settings:** Profile, Default Learning Preferences, Password & Session Security, AI Provider & Storage diagnostics, Generation History, Full JSON Backup export, and Account Deletion.

---

## 2.4 Next-Stage UI/UX & Feature Design Enhancements (Optional Roadmap)

Now that all 8 core phases are built and verified, here are the highest-impact design and UX enhancements you can add next:

1. **Global Command Palette (`Ctrl+K` / `Cmd+K`):**
   - A keyboard-driven modal to jump directly to any Lesson, Subject, Diagram, Flashcard deck, or run *"Ask My Notes"* from anywhere in the app.
2. **Interactive Log & Packet Dissector Component:**
   - A specialized viewer for raw Windows Event Logs, Sysmon events, Zeek logs, and HTTP requests inside the Lesson Viewer that highlights fields (`EventID`, `LogonType`, `CommandLine`) with hover tooltips.
3. **Side-by-Side Source vs. Lesson Split View:**
   - A toggle in `LessonViewerPage` that opens the original `SourceChunk` PDF/text in a split drawer next to the generated section so learners can compare their raw notes with the AI explanation without leaving the page.
4. **Client-Side Log Sanitizer on the Create Lesson Screen:**
   - A 1-click *"Sanitize IPs & Secrets"* button on `CreateLessonPage.tsx` that scrubs API keys, tokens, and private IP addresses before notes are uploaded or sent to an external AI provider.
