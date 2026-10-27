# CyberLearn AI — Full Application Audit & Detailed Design Plan

**Workspace:** `/home/waji/CyberLearn Ai`  
**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 | Node.js + Express + TypeScript + MongoDB (Mongoose) + Redis (BullMQ) + S3/Local Storage  
**Purpose:**
1. **Part 1:** Inspect and audit the entire existing `CyberLearn Ai` codebase (every folder, package, route, model, service, and UI screen) to establish what is built vs. what remains to be wired.
2. **Part 2:** Provide a complete, detailed UI/UX, component, and architectural **Design Plan** for the entire application so every screen and backend module can be completed seamlessly.

---

# Part 1: Full Audit of the `CyberLearn Ai` Folder

## 1.1 Monorepo & Root Structure Check

The workspace is structured as an **npm workspaces monorepo** (`package.json`) with three workspaces and Docker support:

```text
CyberLearn Ai/
├── package.json                                  # Workspaces: packages/shared, backend, frontend
├── tsconfig.base.json                            # Shared strict TypeScript config
├── docker-compose.yml                            # Full stack: Mongo, Redis, MinIO, API, Worker, Web
├── docker-compose.dev.yml                        # Infra-only: Mongo + Redis + MinIO for local dev
├── .env.example                                  # Environment placeholders
├── Setupimplementation.md                        # Specification + Phase 0–8 progress tracker
├── CyberLearn AI - Implementation Plan and Ideas.md
├── README.md
├── packages/
│   └── shared/                                   # @cyberlearn/shared (Zod schemas & TS types)
├── backend/                                      # @cyberlearn/backend (Express API + BullMQ Worker)
└── frontend/                                     # @cyberlearn/frontend (React + Vite + Tailwind v4)
```

---

## 1.2 Shared Package Audit (`packages/shared/src`) — ✅ 100% Complete

All core domain contracts and Zod validators are implemented and tested (`schemas.test.ts`):

| File | Status | What It Defines |
| :--- | :---: | :--- |
| `preferences.ts` | ✅ Complete | `LanguageSchema` (`en`, `roman-urdu`, `bilingual`), `DifficultySchema`, `VisualModeSchema`, `GenerationPreferencesSchema`, `UserPreferencesSchema`, upload limits (`MAX_UPLOAD_BYTES`, `ALLOWED_UPLOAD_EXTENSIONS`). |
| `analysis.ts` | ✅ Complete | `VisualTypeSchema` (12 visual formats), `PlannedSectionSchema`, `PlannedVisualSchema`, `KeyTermSchema`, `ConceptRelationshipSchema`, `ContentAnalysisSchema` (with cross-field `superRefine` checks). |
| `lesson.ts` | ✅ Complete | `SourceReferenceSchema`, `CodeSnippetSchema`, `GroundingSchema` (`source`, `supplementary`, `mixed`), `LessonSectionSchema`, `GeneratedSectionSchema`. |
| `diagram.ts` | ✅ Complete | `NodeKindSchema` (`source`, `processor`, `storage`, `destination`, `actor`, `decision`, `concept`, `event`), `DiagramNodeSchema`, `DiagramEdgeSchema`, `DiagramSpecSchema` (validates unique IDs, no self-loops, valid edge endpoints). |
| `presentation.ts` | ✅ Complete | `SlideTypeSchema` (10 slide types), `AnimationEventSchema` (`reveal`, `highlight`, `moveAlongPath`, `dim`), `CaptionSchema`, `NarrationSchema`, `SlideSchema`, `PresentationManifestSchema` (validates all animation event `targetId` and `pathId` references). |
| `assessment.ts` | ✅ Complete | Quiz question schemas (`mcq`, `true-false`, `short-answer`, `scenario`, `log-analysis`), `FlashcardSchema`, `PublicQuestion` (strips answer keys before sending to browser). |
| `generation.ts` | ✅ Complete | `GenerationStageSchema`, `GenerationStatusSchema`, `StageResultSchema`. |
| `spacedRepetition.ts` | ✅ Complete | SM-2 spaced repetition interval/ease calculation for flashcards and revision scheduling. |
| `api.ts` | ✅ Complete | Request validation schemas for Auth, Subjects, Learning Paths, Projects, Sources, Generations, Lessons, Reviews, and Exports. |

---

## 1.3 Backend Audit (`backend/src`) — 🟡 Core & AI Engines Built, Worker & Phase 2–8 Routes Need Wiring

### What Is Built & Active in `backend/src`:
1. **Infrastructure & Config (`backend/src/config/`) — ✅ Complete**
   - `env.ts`: Validates environment variables via Zod.
   - `database.ts`: Mongoose connection lifecycle.
   - `redis.ts`: Redis connection factory with automatic in-memory/inline fallback when `REDIS_URL` is unset.
   - `storage.ts`: Unified storage driver supporting both local filesystem storage and S3/MinIO object storage.
2. **Security & Express Middleware (`backend/src/middleware/`) — ✅ Complete**
   - `authenticate.ts` & `authorize.ts` (`findOwned` enforces strict `ownerId` resource isolation).
   - `csrf.ts`, `rateLimit.ts`, `validate.ts` (Zod body/query/ObjectId validation), `errorHandler.ts`.
3. **Mongoose Database Models (`backend/src/models/`) — ✅ Complete**
   - All models exist with indexes: `User.ts`, `Subject.ts` (includes `Subject` & `LearningPath`), `Project.ts`, `Source.ts` (includes `Source` & `SourceChunk`), `Generation.ts`, `Lesson.ts`, `Presentation.ts`, `Asset.ts`, `Revision.ts` (`Flashcard`, `FlashcardReview`, `Quiz`, `QuizAttempt`), and `Progress.ts`.
4. **AI Subsystem & Services (`backend/src/ai/` & `backend/src/services/`) — ✅ Built**
   - `ai/providers/`: Pluggable adapters for `mock.ts`, `openaiCompatible.ts` (OpenCode / OpenAI compatible), `anthropic.ts`, and `placeholder.ts` (SVG fallback illustrations & speech synthesis).
   - `ai/structured.ts`: Structured JSON generation with Zod validation and automatic repair retry.
   - `ai/contentAnalyzer.ts`, `ai/lessonGenerator.ts`, `ai/visualPlanner.ts`, `ai/narrationGenerator.ts`, `ai/assessmentGenerator.ts`, `ai/askNotes.ts`.
   - `services/presentationAssembler.ts`: Builds the validated `PresentationManifest` across all slide types and synchronizes narration captions to animation event timestamps (`syncSlideToNarration`).
   - `jobs/queues.ts` & `jobs/eventBus.ts`: BullMQ + inline job runner and SSE event emitter.
5. **Mounted API Routers (`backend/src/app.ts`) — ✅ Phase 1 Mounted**
   - `/api/v1/health`
   - `/api/v1/auth/*` (`auth.routes.ts`)
   - `/api/v1/subjects/*` & `/api/v1/learning-paths/*` (`subjects.routes.ts`)
   - `/api/v1/projects/*` (`projects.routes.ts`)
   - `/api/v1/projects/:id/sources/text` & `/api/v1/sources/:id` (`sources.routes.ts`)
   - `/api/v1/dashboard` & `/api/v1/progress/*` (`progress.routes.ts`)

### What Is Missing or Unwired in `backend/src`:
1. **`backend/src/worker.ts` is currently empty (0 lines):** Needs the job processor implementation (`generation:run`, `media:regenerate-image`, `media:export`) registered via `registerProcessor()` and invoked by both `worker.ts` and `server.ts` (when running inline without Redis).
2. **File Upload Endpoint (`POST /api/v1/projects/:id/sources/upload`):** Needs `multer` + magic-byte validation + PDF (`pdf-parse`), DOCX (`mammoth`), TXT/MD extraction in `sources.routes.ts` / `sources.service.ts`.
3. **Unmounted / Missing Route Modules:**
   - `generations.routes.ts` (`POST /projects/:id/generations`, `GET /generations`, `GET /generations/:id`, `PATCH /generations/:id/plan`, `POST /generations/:id/continue`, `POST /generations/:id/retry`, `POST /generations/:id/cancel`, `GET /generations/:id/events` SSE).
   - `lessons.routes.ts` (`GET /lessons/:id`, `PATCH /lessons/:id`, section regeneration, AI teacher follow-up questions).
   - `presentations.routes.ts` (`GET /presentations`, `GET /lessons/:id/presentation`, `PATCH /presentations/:id`, `POST /presentations/:id/versions`).
   - `assets.routes.ts` (`GET /assets/:id`, `GET /lessons/:id/assets`, `POST /assets/:id/regenerate`).
   - `revision.routes.ts` (`GET /lessons/:id/flashcards`, `POST /flashcards/:id/review`, `GET /lessons/:id/quizzes`, `POST /quizzes/:id/attempts`, `GET /revision/due`).
   - `exports.routes.ts` (`POST /lessons/:id/exports`, `POST /presentations/:id/exports`, `GET /lessons/:id/exports`, `GET /exports/:id`).
   - `workspace.routes.ts` (`POST /ask` for "Ask My Notes", `GET /knowledge-graph` for cross-lesson concept graph, `GET/PATCH/DELETE /settings` & data backup).

---

## 1.4 Frontend Audit (`frontend/src`) — 🟡 App Shell & Phase 1 Complete, Phases 2–8 Screens Need Creation

### What Is Built & Active in `frontend/src`:
- **Design System & Primitives (`styles.css`, `components/ui/`):**
  - `styles.css`: Tailwind v4 `@theme` tokens, `.prose-cl` Markdown typography, Tiptap styles, React Flow dark theme variables, `prefers-reduced-motion` support.
  - `Card.tsx` (`Card`, `CardTitle`, `PageHeader`, `Stat`), `Button.tsx` (`Button`, `ButtonLink`), `Field.tsx` (`Input`, `Textarea`, `Select`, `Toggle`, `Segmented`), `Feedback.tsx` (`Spinner`, `PageLoader`, `EmptyState`, `ErrorState`, `Alert`, `Badge`, `StatusBadge`, `StageIcon`), `Modal.tsx` (`Modal`, `ConfirmModal`), `Markdown.tsx` (safe Markdown renderer).
- **Layout & Navigation (`components/layout/AppLayout.tsx`):**
  - Collapsible desktop sidebar, mobile drawer, top search bar, workspace subject selector, live active-generations notification bell, user profile menu.
- **Completed Screens in `router.tsx`:**
  - `/login`, `/register`, `/forgot-password`, `/reset-password` (`features/auth/AuthPages.tsx`)
  - `/` — **Dashboard** (`features/dashboard/DashboardPage.tsx`)
  - `/create` — **Create New Lesson / Universal Importer** (`features/projects/CreateLessonPage.tsx`)
  - `/library` — **My Library** (`features/projects/LibraryPage.tsx`)
  - `/projects/:id` — **Project Workspace** (`features/projects/ProjectPage.tsx` + `features/exports/ExportPanel.tsx`)
  - `/subjects` — **Subjects & Learning Paths** (`features/subjects/SubjectsPage.tsx`)

### Frontend Screens Linked in Navigation That Need to Be Created & Added to `router.tsx`:
| Route Path | Screen Name | Spec Reference | Current Status |
| :--- | :--- | :--- | :--- |
| `/generations/:id` | **Analysis Preview & Generation Workspace** | Screens 3 & 4 (Spec 4.5, 4.6) | ❌ Missing route & component |
| `/lessons/:id` | **Lesson Viewer + AI Teacher + Diagram Explorer + Image Gallery** | Screens 5, 7, 8 (Spec 4.7, 4.9, 4.10) | ❌ Missing route & component |
| `/lessons/:id/present` | **Animated Presentation Player** | Screen 6 (Spec 4.8) | ❌ Missing route & component |
| `/presentations` | **Presentations Hub** | Sidebar item (Spec 4.2) | ❌ Missing route & component |
| `/revision` | **Revision Center (Flashcards, Quizzes, Mistake Review)** | Screen 9 (Spec 4.11) | ❌ Missing route & component |
| `/progress` | **Learning Progress & Analytics** | Screen 11 (Spec 4.13) | ❌ Missing route & component |
| `/ask` | **Ask My Notes (Grounded Q&A)** | Roman Urdu Spec Section 7 | ❌ Missing route & component |
| `/knowledge-graph` | **Knowledge Graph ("Connect My Knowledge")** | Roman Urdu Spec Section 2.08 | ❌ Missing route & component |
| `/settings` | **Settings, Usage, Backup & Account** | Screen 12 (Spec 4.14) | ❌ Missing route & component |

---

# Part 2: Detailed Design Plan of CyberLearn AI

This section defines the complete visual, interactive, and technical design plan for the entire CyberLearn AI application so every screen and workflow is cohesive.

---

## 2.1 Visual Design System & Theme Specification

### 1. Color Palette & Semantic Tokens (`frontend/src/styles.css`)
CyberLearn AI uses a **Dark Futuristic Cybersecurity Operations** aesthetic designed for long reading and study sessions without eye strain.

| Token | CSS Variable | Hex | Usage |
| :--- | :--- | :--- | :--- |
| `bg` | `--color-bg` | `#0B1020` | Main viewport background |
| `sidebar` | `--color-sidebar` | `#10182A` | Left navigation rail & React Flow minimap |
| `surface` | `--color-surface` | `#121B30` | Primary cards, modals, panels |
| `surface-2` | `--color-surface-2` | `#18233B` | Hover states, nested cards, code chips, table headers |
| `primary` | `--color-primary` | `#38BDF8` | Primary interactive accent (Sky Cyan), active states, focus rings, data-flow pulses |
| `secondary` | `--color-secondary` | `#8B5CF6` | Secondary accent (Cyber Violet), AI Teacher highlights, awaiting-review badges, blockquotes |
| `text` | `--color-text` | `#F1F5F9` | Primary headings and body copy (Slate 100, >13:1 contrast on `bg`) |
| `muted` | `--color-muted` | `#94A3B8` | Secondary labels, timestamps, metadata (Slate 400) |
| `border` | `--color-border` | `#263449` | 1px structural dividers, card borders, diagram grid lines |
| `success` | `--color-success` | `#34D399` | Completed stages, understood sections, source-grounded badge, correct answers |
| `warning` | `--color-warning` | `#FBBF24` | Partial completion, ambiguity warnings, supplementary claim badge, favorites |
| `error` | `--color-error` | `#F87171` | Failed stages, destructive actions, security alerts, quiz mistakes |

### 2. Typography & Readability Hierarchy
- **UI & Long-Form Explanations (`--font-sans`):** `Inter`
  - **Page Title (`h1`):** `text-2xl sm:text-3xl font-bold tracking-tight text-text`
  - **Section Heading (`h2`):** `text-xl font-semibold text-text`
  - **Sub-heading (`h3`):** `text-base font-semibold text-text`
  - **Lesson Body (`.prose-cl`):** `text-base leading-[1.75] text-text/90` (optimal 65–75ch measure inside the center reading column)
  - **Eyebrow / Metadata:** `text-xs uppercase tracking-widest text-primary font-medium`
- **Technical Content, Logs, SIEM Queries & CLI Commands (`--font-mono`):** `JetBrains Mono`
  - Code blocks render on a deep terminal canvas (`#070B16`) with a 1px `--color-border` frame, language badge, and 1-click **Copy** button.

### 3. Surface, Elevation & Micro-Interaction Rules
- **Cards:** `rounded-xl border border-border bg-surface p-5`. Interactive cards transition border color on hover (`hover:border-primary/40 transition-colors`).
- **Primary CTA Glow:** Primary buttons carry a subtle cyan ambient glow (`shadow-[0_0_20px_-6px_var(--color-primary)]`).
- **Grounding Badges:** Every lesson section and AI answer visibly displays its epistemic grounding:
  - `🟢 Source Grounded` (`grounding === 'source'`) — Directly backed by cited `SourceChunk` excerpts.
  - `🟣 Source + AI Context` (`grounding === 'mixed'`) — Combines source facts with clearly separated AI context.
  - `🟡 Supplementary Explanation` (`grounding === 'supplementary'`) — Added by AI to explain prerequisites or analogies.

---

## 2.2 Global Information Architecture & Navigation Map

```text
+-----------------------------------------------------------------------------------+
| TOP BAR (h-16, sticky, backdrop-blur)                                             |
| [≡] [ 🔍 Search lessons, tags, subjects... ] [Workspace: All Subjects ▾] [+ New] 🔔 👤 |
+------------------+----------------------------------------------------------------+
| LEFT SIDEBAR     | MAIN CONTENT VIEWPORT (max-w-[1600px] mx-auto px-4..8 py-6)    |
| (w-64 / w-[72px])|                                                                |
|                  |  Routes rendered via <Outlet />:                               |
| • Dashboard      |  ├─ /                        (Screen 1: Dashboard)             |
| • My Library     |  ├─ /create                  (Screen 2: Create New Lesson)     |
| • Create Lesson  |  ├─ /library                 (Screen 10: My Library)           |
| • Presentations  |  ├─ /projects/:id            (Project Detail & Sources)        |
| • Flashcards     |  ├─ /generations/:id         (Screens 3 & 4: Plan & Live SSE)  |
| • Quizzes        |  ├─ /lessons/:id             (Screens 5, 7, 8: Lesson Studio)  |
| • Progress       |  ├─ /lessons/:id/present     (Screen 6: 16:9 Slide Player)     |
| • Subjects       |  ├─ /presentations           (Presentations Gallery)           |
| • Ask My Notes   |  ├─ /revision                (Screen 9: Flashcards & Quizzes)  |
| • Knowledge Graph|  ├─ /progress                (Screen 11: Analytics & Streaks)  |
| • Settings       |  ├─ /subjects                (Dynamic Subjects & Paths)        |
|                  |  ├─ /ask                     (Ask My Notes RAG Workspace)      |
| [« Collapse]     |  ├─ /knowledge-graph         (Cross-Lesson Concept Graph)      |
|                  |  └─ /settings                (Screen 12: Account & Preferences)|
+------------------+----------------------------------------------------------------+
```

---

## 2.3 Detailed Screen-by-Screen UI & Component Design Plan

Below is the exact design blueprint for every screen in CyberLearn AI, detailing both the screens already implemented and the screens to be built next.

---

### Screen 1 & 2: Dashboard (`/`) & Create New Lesson (`/create`) — *Implemented*
- **Dashboard (`DashboardPage.tsx`):**
  - Displays 5 top KPI cards (`Lessons created`, `Presentations`, `Completed lessons`, `Quiz performance`, `Study streak`), a `Continue learning` progress card with direct `Open lesson` and `Play` actions, a `Recommended revision` counter, live `Generation jobs running`, `Recent projects`, `Topics marked as difficult`, and `Recently studied`.
- **Create New Lesson (`CreateLessonPage.tsx`):**
  - 2-column asymmetric layout (`xl:grid-cols-3`): Left 2 columns hold the **Source Material** card (Title, Subject selector, Monospace Notes Textarea up to 200k chars, Tags) and **Upload Documents** drag-and-drop zone (PDF, DOCX, TXT, MD up to 20MB each). Right sticky column holds the **Generate** action card with `Review the plan first` toggle, collapsible `Advanced preferences` (`Language`, `Difficulty`, `Density`, `Visual Mode`, `Narration`, `Quizzes`, `Flashcards`), and a security reminder banner.

---

### Screen 3 & 4: Content Analysis Preview & Generation Workspace (`/generations/:id`) — *To Build in `frontend/src/features/generation/GenerationPage.tsx`*

This route dynamically switches between two views based on `generation.status`:

#### Mode A: Content Analysis Preview (`status === 'awaiting_review'`)
When `Review the plan first` is enabled, the worker pauses after running `ContentAnalyzer` and displays the proposed blueprint before expensive lesson/media generation starts.

```text
+-----------------------------------------------------------------------------------+
| GENERATION PREVIEW                                                                |
| Review Learning Plan                       [Cancel] [Approve & Generate Lesson ->]|
+---------------------------------------------------+-------------------------------+
| LESSON BLUEPRINT (Editable)                       | DETECTED METADATA             |
| [ Lesson Title: SIEM Architecture & Log Pipeline ]| Subject: Cybersecurity / SOC  |
| [ Detected Topic: SIEM Event Collection ]         | Difficulty: Intermediate      |
|                                                   | Suggested Slides: 14          |
| ⚠️ Ambiguity / Source Warnings (if any):          |                               |
| • "Source notes mention Sysmon but omit Event IDs"| PREREQUISITES                 |
|                                                   | • Windows Event Log basics    |
| PLANNED SECTIONS (Toggle √ to include / reorder)  | • Network ports & syslog      |
| +-----------------------------------------------+ |                               |
| | [√] 1. Log Sources & Forwarders     (Chunks 1)| | KEY TERMS DETECTED (12)       |
| |     Concepts: Beats, Syslog, WEF              | | • Normalization               |
| | [√] 2. Parsing & Normalization      (Chunks 2)| | • Aggregation                 |
| |     Concepts: Field extraction, ECS           | | • Correlation Rule            |
| | [√] 3. Detection Rules & Alerting   (Chunks 3)| |                               |
| +-----------------------------------------------+ | PROPOSED VISUALS              |
|                                                   | • [data-flow] Log Pipeline    |
|                                                   | • [timeline] Alert Triage     |
+---------------------------------------------------+-------------------------------+
```

- **Interactive Controls:**
  - Edit `analysis.title` inline.
  - Toggle `section.include` checkbox on any planned section (or remove irrelevant sections).
  - Adjust `GenerationPreferences` before continuing.
  - Primary CTA: **`Approve & Generate Lesson`** (`POST /api/v1/generations/:id/continue`).

#### Mode B: Live Generation Workspace (`status === 'queued' | 'running' | 'completed' | 'partially_completed' | 'failed'`)
Connects to `GET /api/v1/generations/:id/events` via `EventSource` (SSE) with automatic query fallback.

```text
+-----------------------------------------------------------------------------------+
| GENERATION WORKSPACE                                                              |
| Building: SIEM Architecture & Log Pipeline           Status: [RUNNING · lessons]  |
+-----------------------------------------------------------------------------------+
| PIPELINE STAGES (7 of 9 completed)                                                |
| +-------------------------------------------------------------------------------+ |
| | ✅ 1. Extracting source content       3 chunks normalized            (0.4s)   | |
| | ✅ 2. Analyzing concepts              4 sections, 2 diagrams planned (3.1s)   | |
| | ✅ 3. Writing lesson explanations     4 sections grounded in source  (8.2s)   | |
| | ✅ 4. Planning visuals                Selected data-flow & timeline  (1.1s)   | |
| | ✅ 5. Generating technical diagrams   2 validated React Flow specs   (4.0s)   | |
| | 🔄 6. Generating illustrations        Creating conceptual cover...            | |
| | ⏳ 7. Creating narration              Pending                                 | |
| | ⏳ 8. Assembling presentation         Pending                                 | |
| | ⏳ 9. Generating quizzes & flashcards Pending                                 | |
| +-------------------------------------------------------------------------------+ |
| [Retry Failed Stages]  [Cancel Job]        [Open Lesson ->] [Play Presentation ->]|
+-----------------------------------------------------------------------------------+
```

- **Design Rules:**
  - Never show fake percentage bars; show exact completed stage count (`completedStages / totalStages`) and per-stage status (`pending`, `running`, `completed`, `failed`, `skipped`).
  - As soon as `generation.lessonId` exists, enable **`Open Lesson`** even if optional media stages are still running or partially failed.

---

### Screen 5, 7 & 8: Unified Lesson Studio (`/lessons/:id`) — *To Build in `frontend/src/features/lessons/LessonPage.tsx`*

To avoid jarring context switches while studying, `/lessons/:id` serves as a **3-Panel Interactive Learning Studio** with top view-mode tabs:
1. **`📖 Lesson & Notes`** (Screen 5 — 3-Panel Reader + Tiptap Editor)
2. **`🔀 Diagram Explorer`** (Screen 7 — Interactive React Flow Canvas & Step-by-Step Replay)
3. **`🖼️ AI Illustrations`** (Screen 8 — AI Image Gallery with HTML/SVG Overlay Labels & Regeneration)
4. **`🕘 Versions & Exports`** (Version history restore + PDF/PPTX/Markdown export)

```text
+-----------------------------------------------------------------------------------+
| My Library / SIEM Architecture                                                    |
| SIEM Architecture & Log Pipeline      [🟢 v2 Saved] [▶ Play Presentation] [Quiz]  |
| [📖 Lesson (4)] [🔀 Diagram Explorer (2)] [🖼️ Illustrations (2)] [🕘 Versions]    |
+------------------+-----------------------------------------+----------------------+
| LEFT PANEL       | CENTER PANEL (Active Section Reader)    | RIGHT PANEL          |
| (w-64, sticky)   |                                         | (w-80, sticky)       |
|                  | SECTION 1 OF 4                          |                      |
| 🔍 [Find in...]  | Log Collection & Forwarding             | 🤖 AI TEACHER        |
|                  | [🟢 Source Grounded] [🔖 Bookmark] [✏️] | Quick Actions:       |
| OUTLINE          |                                         | [Explain Simpler]    |
| ✅ 1. Log Collect| DEFINITION                              | [Give SOC Example]   |
| ○  2. Parsing    | Log collection is the process of...     | [Go Deeper]          |
| ○  3. Detection  |                                         | [Roman Urdu / EN]    |
| ○  4. Triage     | DETAILED EXPLANATION                    |                      |
|                  | Security operations rely on...          | [Ask about this      |
|PROGRESS: 25%     |                                         |  section...       ]  |
| [===---------]   | EMBEDDED DIAGRAM (Interactive Preview)  |                      |
|                  | +-------------------------------------+ | KEY TERMS            |
| PREREQUISITES    | | [Log Sources] --> [SIEM] --> [SOC]  | | • WEF: Windows...    |
| • Syslog basics  | | [Open in Diagram Explorer ↗]        | | • Beats: Light...    |
|                  | +-------------------------------------+ |                      |
|                  |                                         | RELATED FLASHCARDS   |
|                  | TECHNICAL EXAMPLE & COMMANDS            | +------------------+ |
|                  | ```spl                                  | | Q: What port does| |
|                  | index=windows EventCode=4625            | | Syslog TLS use?  | |
|                  | ```                            [Copy]   | | [Flip Card]      | |
|                  |                                         | +------------------+ |
|                  | ⚠️ COMMON MISTAKES & WARNINGS           |                      |
|                  | • Dropping high-volume DNS logs...      | SOURCE CITATIONS     |
|                  |                                         | • Chunk #1 (p. 2)    |
|                  | [✓ Mark Section as Understood]          |   "SIEM ingests..."  |
+------------------+-----------------------------------------+----------------------+
```

#### Key Interactive Details in the Lesson Studio:
- **Section Editing (`Tiptap` + Markdown):** Clicking `✏️ Edit` on a section opens an inline editor with **Autosave** (`PATCH /api/v1/lessons/:id`) and creates a snapshot in `lesson.versions` before overwriting.
- **Diagram Explorer Tab (Screen 7):**
  - Renders `lesson.diagrams` using `@xyflow/react` (**React Flow**) with automatic node positioning (`dagre`-style layered layout along `LR` or `TB` direction).
  - Node colors map to `NodeKind` (`source` = cyan, `processor` = violet, `storage` = emerald, `destination` = amber, `decision` = rose).
  - **Step-by-Step Animation Replay Bar:** Plays `diagram.steps` sequentially, highlighting active nodes and animating edges.
  - **Node Inspector Drawer:** Clicking any node shows its `label`, `kind`, `description`, connected incoming/outgoing edges, and a link to jump to its lesson section.
  - **Download:** Exports clean standalone `.svg` or `.png` of the diagram.
- **AI Image Gallery Tab (Screen 8):**
  - Displays every conceptual image asset associated with the lesson, its prompt, target section, and **editable HTML/SVG coordinate pin annotations** (`annotations: [{ id, label, x, y }]`) so technical terms are always crisp and editable.
  - Includes **`Regenerate`** (`POST /api/v1/assets/:id/regenerate`) and **`Download`** buttons.

---

### Screen 6: Animated Presentation Player (`/lessons/:id/present`) — *To Build in `frontend/src/features/presentations/PresentationPlayerPage.tsx`*

This is CyberLearn AI's signature experience: an interactive 16:9 visual teaching stage synchronized to a single master clock and voice narration.

```text
+-----------------------------------------------------------------------------------+
| [← Back to Lesson]  SIEM Architecture (Slide 3 / 12)   [1.0x ▾] [CC] [🔊] [⛶ Full]|
+------------------------------------------------------------+----------------------+
| 16:9 ANIMATED STAGE CANVAS                                 | SLIDES & TRANSCRIPT  |
| +--------------------------------------------------------+ | [Slides] [Transcript]|
| | DATA FLOW · SECTION 1                                  | |                      |
| | How Security Events Reach the SIEM                     | | 1. Title & Objectives|
| |                                                        | | 2. Log Collection    |
| |   +-------------+      ● (packet)    +-------------+   | | ▶ 3. SIEM Data Flow  |
| |   | Log Sources | ================>  |   Logstash  |   | | 4. Normalization     |
| |   +-------------+   Security events  +-------------+   | | 5. Terminal Commands |
| |         |                                   |          | | 6. Good vs Bad       |
| |         |                            +------v------+   | |                      |
| |         |                            |  SOC Alert  |   | | LIVE TRANSCRIPT      |
| |         |                            +-------------+   | | [00:00] First, log   |
| |                                                        | | sources generate...  |
| |  +--------------------------------------------------+  | | [00:05] ▶ Events     |
| |  | CC: "Events travel from forwarders into Logstash"|  | | travel from...       |
| |  +--------------------------------------------------+  | | [00:11] Finally, the |
| +--------------------------------------------------------+ | alert panel triggers.|
|                                                            |                      |
| [⏮] [▶ Play / ⏸ Pause] [⏭] [↺ Replay]  00:07 / 00:18      | SPEAKER NOTES        |
| [================●---------------------------------------] | Explain how beats... |
|  ▲ reveal(source)      ▲ moveAlongPath(e1)    ▲ reveal(soc)|                      |
+------------------------------------------------------------+----------------------+
```

#### Technical Design of the Master Presentation Clock:
1. **Single Clock Source (`currentTimeMs`):**
   - If an `<audio>` element is active and unmuted for the current slide, `currentTimeMs` syncs to `audio.currentTime * 1000`.
   - Otherwise (or when narration is off / browser speech is used), a `requestAnimationFrame` loop advances `currentTimeMs` by `deltaMs * playbackSpeed`.
2. **Declarative State Derivation (Zero Timer Drift):**
   - At any millisecond `t = currentTimeMs`, the renderer computes:
     - `isRevealed(id)`: `events.some(e => e.type === 'reveal' && e.targetId === id && e.atMs <= t)` (or true if no reveal event targets `id`).
     - `isHighlighted(id)`: `events.some(e => e.type === 'highlight' && e.targetId === id && t >= e.atMs && t <= e.atMs + e.durationMs)`.
     - `activePacketProgress(edgeId)`: For `moveAlongPath` events where `t >= e.atMs && t <= e.atMs + e.durationMs`, progress is `(t - e.atMs) / e.durationMs` (`0..1`), driving an SVG `<circle>` or glowing packet token along the edge path!
     - `activeCaption`: `slide.narration.captions.find(c => t >= c.startMs && t <= c.endMs)`.
3. **10 Supported Slide Renderers (`SlideType`):**
   - `title`, `bullets`, `progressive-diagram`, `data-flow`, `concept-illustration`, `timeline`, `comparison`, `terminal`, `decision-flow`, `summary`.

---

### Screen 9: Revision Center (`/revision`) — *To Build in `frontend/src/features/revision/RevisionPage.tsx`*

Accessible from the sidebar under both **Flashcards** (`/revision?tab=flashcards`) and **Quizzes** (`/revision?tab=quizzes`), plus a **Mistake Review & Weak Topics** tab.

```text
+-----------------------------------------------------------------------------------+
| REVISION CENTER                                                                   |
| Practice & Spaced Repetition      [Filter: All Lessons ▾] [Due Today: 8 Cards]    |
| [🃏 Flashcards (14)]  [📝 Quizzes & Scenarios (3)]  [🎯 Mistake Review (2)]       |
+-----------------------------------------------------------------------------------+
| FLASHCARD DECK (SM-2 Spaced Repetition)                                           |
|                                                                                   |
|           +-----------------------------------------------------------+           |
|           |  CONCEPT: Windows Security Logon Types     [Intermediate] |           |
|           |                                                           |           |
|           |        What is the difference between Windows             |           |
|           |        Event ID 4624 Logon Type 3 and Logon Type 10?      |           |
|           |                                                           |           |
|           |                    [ Click or Space to Flip ]             |           |
|           +-----------------------------------------------------------+           |
|                                                                                   |
|   After flipping, rate your recall to schedule the next review:                   |
|   [ 1 · Again (<1d) ]   [ 3 · Hard (2d) ]   [ 4 · Good (4d) ]   [ 5 · Easy (7d) ] |
+-----------------------------------------------------------------------------------+
```

#### Quiz & Scenario Investigation Runner (`?tab=quizzes`):
- Supports all 5 question types defined in `packages/shared/src/assessment.ts`:
  1. `mcq` (4-option interactive radio cards)
  2. `true-false` (2-button toggle)
  3. `short-answer` (textarea evaluated against rubric keywords)
  4. `log-analysis` & `scenario` (displays a monospace SIEM/Windows/HTTP log block and asks the analyst to identify suspicious indicators and the next investigation step).
- **Security Rule:** Answer keys are never sent by `GET /api/v1/lessons/:id/quizzes`. Only when the user clicks **`Submit Quiz`** (`POST /api/v1/quizzes/:id/attempts`) does the backend score the answers, record `QuizAttempt`, update weak topics, and return detailed explanations + source section links.

---

### Screen 11: Learning Progress (`/progress`) — *To Build in `frontend/src/features/progress/ProgressPage.tsx`*

Visualizes honest, activity-backed study statistics using **Recharts**:
- **Top Summary Row:** Total Study Time (`hours/minutes`), Lessons Completed, Average Quiz Score, Flashcard Retention Accuracy, Current Study Streak.
- **Charts (`recharts`):**
  1. **Quiz Score Trend (`AreaChart` / `LineChart`):** Recent quiz attempt percentages over time.
  2. **Mastery by Subject (`BarChart`):** Section completion and quiz accuracy grouped by dynamic subject.
- **Weak Topics Table:** Lists concepts with recurring quiz mistakes or flashcard lapses, with 1-click links to reopen the exact lesson section or practice flashcards.

---

### Universal Workspace Screens: Ask My Notes (`/ask`) & Knowledge Graph (`/knowledge-graph`)

1. **Ask My Notes (`/ask` — `frontend/src/features/workspace/AskNotesPage.tsx`):**
   - Filterable by **Subject** or **Project** (or across the entire library).
   - User asks a question (e.g., *"How do I detect brute force in Windows Event Logs?"* or *"Maine IDOR kahan parha tha?"*).
   - Backend (`backend/src/ai/askNotes.ts`) retrieves matching `SourceChunk` and `Lesson` sections, answers strictly from the user's saved material, separates **Source Facts** from **Supplementary Context**, and renders clickable citation cards (`Project → Lesson → Chunk #`). If the notes do not contain the answer, it explicitly states so.
2. **Knowledge Graph (`/knowledge-graph` — `frontend/src/features/workspace/KnowledgeGraphPage.tsx`):**
   - Aggregates `lesson.conceptLinks` (`from → to` with `label`) across all lessons and subjects into an interactive **React Flow** graph.
   - Nodes are color-coded by **Subject** (e.g., Cyan for SOC, Violet for Pentesting, Emerald for Cloud Security).
   - Clicking a concept node highlights its prerequisites and downstream concepts and lists every lesson where that concept appears.

---

### Screen 12: Settings (`/settings`) — *To Build in `frontend/src/features/settings/SettingsPage.tsx`*

- **Profile & Default Learning Preferences:** Display name, default language (`English`, `Roman Urdu`, `Bilingual`), default explanation depth, presentation density, visual mode, and narration toggle (`PATCH /api/v1/auth/me`).
- **AI Provider & Infrastructure Status (Read-Only Diagnostics):** Shows active backend provider type (`mock`, `openai-compatible`, `anthropic`), storage driver (`local` vs `s3`), usage counters (total AI calls, characters processed, storage bytes used). API keys are never exposed to the browser.
- **Data Export & Privacy Controls:**
  - **`Download Full Backup (.json)`**: Exports the user's subjects, projects, sources, lessons, flashcards, and progress.
  - **`Delete Account & All Data`**: Permanently deletes the user's MongoDB documents and S3/local storage assets after confirmation.

---

## 2.4 Backend Worker & API Completion Plan

To power all screens above, the remaining backend pieces follow this exact design:

```text
POST /api/v1/projects/:id/generations
        │
        ▼
Creates Generation(status: 'queued') in MongoDB
        │
        ▼
enqueue('generation:run', { generationId })  ───► BullMQ (Redis) or In-Process Runner
                                                          │
                                                          ▼
                                             backend/src/worker.ts
                                                          │
      ┌───────────────────────────────────────────────────┴───────────────────────────────────────────────┐
      ▼                                                                                                   ▼
1. Stage: 'extracting'     -> Verify SourceChunks exist                                          Emits SSE via
2. Stage: 'analyzing'      -> run analyzeContent() -> Save generation.analysis                   jobs/eventBus.ts
   ├─ If autoContinue === false: pause at status = 'awaiting_review'                                      │
   └─ On POST /generations/:id/continue (or autoContinue === true):                                       ▼
3. Stage: 'lessons'        -> run generateLessonSection() per included section                   GET /generations/:id/events
4. Stage: 'visuals'        -> run planVisuals()                                                  streams live JSON updates
5. Stage: 'diagrams'       -> run generateDiagram() -> validate DiagramSpecSchema                to GenerationPage.tsx
6. Stage: 'images'         -> generate conceptual illustrations (isolated: fallback on error)
7. Stage: 'narration'      -> run generateNarration() + TTS audio synthesis
8. Stage: 'presentation'   -> run assemblePresentation() + syncSlideToNarration()
9. Stage: 'assessments'    -> run generateAssessments() -> save Quiz & Flashcards
10. Stage: 'saving'        -> mark Lesson, Presentation, Project & Generation 'completed'
```

---

## 2.5 Ordered Implementation Checklist to Finish the Application

1. **Step 1 — Wire `backend/src/worker.ts` & Document Upload (`sources.routes.ts`):**
   - Implement the `generation:run`, `media:regenerate-image`, and `media:export` processors in `backend/src/worker.ts`.
   - Add PDF/DOCX/TXT/MD file upload with magic-byte checks in `sources.routes.ts`.
2. **Step 2 — Mount Remaining Backend Routes in `backend/src/app.ts`:**
   - Create and mount `generations.routes.ts`, `lessons.routes.ts`, `presentations.routes.ts`, `assets.routes.ts`, `revision.routes.ts`, `exports.routes.ts`, and `workspace.routes.ts` (`/ask`, `/knowledge-graph`, `/settings`).
3. **Step 3 — Build Generation Preview & Live SSE Screen (`/generations/:id`):**
   - Create `GenerationPage.tsx` supporting both Plan Review (`awaiting_review`) and SSE progress tracking with per-stage retry.
4. **Step 4 — Build Unified Lesson Studio (`/lessons/:id`):**
   - Create `LessonPage.tsx` with the 3-panel reader, Tiptap section editor, AI Teacher panel, React Flow Diagram Explorer tab, and AI Image Gallery tab.
5. **Step 5 — Build 16:9 Animated Presentation Player (`/lessons/:id/present` & `/presentations`):**
   - Create `PresentationPlayerPage.tsx` with the master clock engine, 10 slide templates, synchronized narration/captions, and playback controls.
6. **Step 6 — Build Revision Center (`/revision`) & Learning Progress (`/progress`):**
   - Create `RevisionPage.tsx` (SM-2 Flashcards + Quiz/Scenario runner + Mistake review) and `ProgressPage.tsx` (Recharts analytics).
7. **Step 7 — Build Ask My Notes (`/ask`), Knowledge Graph (`/knowledge-graph`), and Settings (`/settings`):**
   - Wire all remaining sidebar routes in `frontend/src/app/router.tsx` and verify with `npm run typecheck`, `npm test`, and `npm run build`.
