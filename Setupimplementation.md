# CyberLearn AI

## Complete Application Specification & Technical Architecture

**Project type:** AI-powered interactive learning and revision platform
**Initial specialization:** Cybersecurity, SOC, HTB CDSA
**Frontend:** React + TypeScript + Tailwind CSS
**Backend:** Node.js + Express.js + TypeScript
**Database:** MongoDB + Mongoose
**AI capabilities:** Content understanding, lesson generation, diagrams, image generation, animated presentations, narration, quizzes and revision
**Document version:** 1.0

---

# ✅ Implementation Progress Tracker

Steps are built in order. `[x]` ✅ = completed and verified, `[ ]` = not done yet.
Phase 0 (Docker) was added on top of the spec so the whole application runs locally in containers.

## Phase 0 — Monorepo & Docker (added)

- [x] ✅ 0.1 npm-workspaces monorepo (`packages/shared`, `backend`, `frontend`)
- [x] ✅ 0.2 Shared Zod schemas (analysis, lesson, diagram, presentation manifest, quiz, flashcard)
- [x] ✅ 0.3 `.env.example` with empty placeholders, `.gitignore` excluding `.env`
- [x] ✅ 0.4 Backend Dockerfile (API + worker) and frontend Dockerfile (nginx)
- [x] ✅ 0.5 `docker-compose.yml` running MongoDB, Redis, API, worker, frontend (+ optional MinIO) — build steps and nginx config verified locally; Docker is not installed on the dev machine yet, so run `docker compose up --build` once to confirm
- [x] ✅ 0.6 `docker-compose.dev.yml` for infrastructure-only local development

## Phase 1 — Foundation

- [x] ✅ 1.1 Express API with `/api/v1`, helmet, CORS, rate limits, central error format
- [x] ✅ 1.2 MongoDB connection + Mongoose models (all collections from section 8)
- [x] ✅ 1.3 Authentication (register, login, logout, me, forgot/reset password), HTTP-only cookies + CSRF
- [x] ✅ 1.4 Dynamic Subjects & Learning Paths (Roman Urdu section 3)
- [x] ✅ 1.5 Projects CRUD with ownership checks, search and filters
- [x] ✅ 1.6 Paste-text sources (normalize + chunk)
- [x] ✅ 1.7 React app shell: dark design tokens, collapsible sidebar, top navigation
- [x] ✅ 1.8 Login / Register screens
- [x] ✅ 1.9 Dashboard (real stats, empty states)
- [x] ✅ 1.10 Create Lesson screen (paste input + preferences)
- [x] ✅ 1.11 My Library (search, filter, sort, favorite, duplicate, rename, delete)
- [x] ✅ 1.12 Acceptance: create account → paste material → save project → reopen it

## Phase 2 — AI learning content

- [x] ✅ 2.1 PDF / DOCX / TXT / Markdown upload with magic-byte validation and extraction
- [x] ✅ 2.2 Object storage abstraction (local volume or S3/MinIO)
- [x] ✅ 2.3 AI provider abstraction (mock, OpenAI-compatible / OpenCode, Anthropic) — mock + OpenAI-compatible tested; Anthropic adapter type-checked against the SDK, needs a live key to try
- [x] ✅ 2.4 Background jobs (BullMQ + Redis, inline fallback), retries, cancel, per-user limits
- [x] ✅ 2.5 Content analyzer with schema validation + repair step
- [x] ✅ 2.6 Content Analysis Preview screen (edit title, remove sections)
- [x] ✅ 2.7 Structured lesson generator with source references
- [x] ✅ 2.8 Generation Workspace with live SSE progress and per-stage retry
- [x] ✅ 2.9 Lesson Viewer (outline, sections, key concepts, search, bookmarks, mark understood)
- [x] ✅ 2.10 Lesson editing (Tiptap) with autosave
- [x] ✅ 2.11 Acceptance: pasted content becomes a structured, editable lesson

## Phase 3 — Diagrams and visuals

- [x] ✅ 3.1 Visual planner
- [x] ✅ 3.2 Diagram generator with node/edge validation
- [x] ✅ 3.3 React Flow diagram renderer + Diagram Explorer (zoom, select node, replay, SVG/PNG download)
- [x] ✅ 3.4 Image-generation adapter with fallback illustration
- [x] ✅ 3.5 Asset library + AI Image Gallery (regenerate, download, usage)
- [x] ✅ 3.6 Acceptance: lesson contains validated diagrams and illustrations

## Phase 4 — Animated presentation

- [ ] 4.1 Presentation manifest assembler (7 presentation types)
- [ ] 4.2 Slide layouts on a 16:9 stage
- [ ] 4.3 Presentation clock / timeline engine (reveal, highlight, moveAlongPath)
- [ ] 4.4 Controls: play/pause, prev/next, replay, seek, speed, fullscreen, jump, restart
- [ ] 4.5 Acceptance: play, pause and resume without losing synchronization

## Phase 5 — Narration

- [ ] 5.1 Narration script generation from slide data
- [ ] 5.2 TTS integration (provider audio or browser speech fallback)
- [ ] 5.3 Captions + transcript panel
- [ ] 5.4 Narration-to-animation synchronization
- [ ] 5.5 Acceptance: speech and visuals follow the same lesson plan

## Phase 6 — Revision system

- [ ] 6.1 Flashcards with spaced repetition (SM-2)
- [ ] 6.2 Quizzes: MCQ, true/false, short answer, scenario / log analysis
- [ ] 6.3 Answer explanations and mistake review
- [ ] 6.4 Progress tracking + Learning Progress screen
- [ ] 6.5 Revision Center (due items, weak topics)
- [ ] 6.6 Acceptance: user can test understanding and revisit weak topics

## Phase 7 — Export and polish

- [ ] 7.1 PDF notes export
- [ ] 7.2 PPTX export with speaker notes
- [ ] 7.3 Markdown export / data backup
- [ ] 7.4 Presentation version history
- [ ] 7.5 Settings screen (profile, preferences, usage, storage, data export, account deletion)
- [ ] 7.6 Mobile layout polish, operational logging, security review

## Phase 8 — Universal workspace extras (Roman Urdu sections 7–8)

- [ ] 8.1 Ask My Notes (grounded answers with source references)
- [ ] 8.2 Knowledge Graph across lessons and subjects
- [ ] 8.3 Final end-to-end check against section 21 "Definition of Done"

---

# 1. Project Vision

CyberLearn AI is a personal AI-powered learning platform that converts any study material into an interactive multimedia learning experience.

The user should not need to manually prepare slides, diagrams, summaries, quizzes or flashcards. They should only need to paste their study material or upload a document.

The application will analyze the source material, identify its concepts, determine the relationships between concepts and generate a structured learning experience.

For example, when a user pastes a lesson about SIEM architecture, the application can automatically produce:

* Structured lessons and detailed explanations.
* Presentation slides with relevant illustrations.
* Technical diagrams and animated data flows.
* AI-generated conceptual images.
* Step-by-step explanations of complex concepts.
* Narration synchronized with slide animations.
* Flashcards, MCQs and practical scenarios.
* Revision notes and downloadable PDF or PPTX files.
* A saved course library and progress tracking.

The application should work for other technical subjects too, but its initial templates and example content will focus on SOC analysis, SIEM, log investigation, detection engineering and cybersecurity.

## 1.1 Core principle

**The user provides the learning material; the application creates the learning experience.**

The application must not depend on a predefined list of topics. It should be able to process unfamiliar subjects and select appropriate visual formats based on the material.

For instance:

* A networking lesson may need a packet-flow diagram.
* A SOC investigation may need a timeline and event-correlation view.
* A programming lesson may need annotated code.
* A cloud-security lesson may need an architecture diagram.
* A theoretical lesson may need a concept map or comparison chart.

---

# 2. Technology Stack

| Layer                 | Technology                                   | Purpose                                      |
| --------------------- | -------------------------------------------- | -------------------------------------------- |
| Frontend              | React + TypeScript                           | Interactive application UI                   |
| Build tool            | Vite                                         | Frontend development and bundling            |
| Styling               | Tailwind CSS                                 | Responsive styling                           |
| UI components         | shadcn/ui or a custom component system       | Consistent interface                         |
| Animation             | Framer Motion / Motion                       | Slide transitions and interface animation    |
| Diagram rendering     | React Flow + SVG                             | Interactive technical diagrams               |
| Charts                | Recharts                                     | Timelines, statistics and visual comparisons |
| Presentation playback | Custom React presentation engine             | Slide sequencing and playback                |
| Rich-text editing     | Tiptap                                       | Editing generated lessons                    |
| Backend               | Node.js + Express.js + TypeScript            | REST API and application logic               |
| API validation        | Zod                                          | Request and response validation              |
| Database              | MongoDB + Mongoose                           | Persistent application data                  |
| Background jobs       | BullMQ + Redis                               | AI generation and long-running jobs          |
| File storage          | S3-compatible object storage                 | PDFs, images, audio and exports              |
| AI integration        | Provider abstraction layer                   | Text generation and analysis                 |
| Image generation      | Compatible image-generation API              | Conceptual illustrations                     |
| Text-to-speech        | Compatible TTS provider                      | Spoken lessons                               |
| Authentication        | Secure session or token-based authentication | User access                                  |
| Real-time updates     | Server-Sent Events (SSE)                     | Generation progress                          |
| Testing               | Vitest, React Testing Library, Supertest     | Frontend and backend testing                 |
| Deployment            | Docker + reverse proxy                       | Reproducible deployment                      |

**Important architecture decision:** Redis and object storage are supporting infrastructure, not replacements for MongoDB. MongoDB stores structured application data; object storage holds large binary files.

The application should use provider adapters so AI, image-generation and narration providers can be changed without rewriting the entire system.

---

# 3. Complete Application Workflow

The complete user journey should be:

1. User opens the dashboard.
2. User creates a new learning project.
3. User pastes content, uploads a document or adds source notes.
4. User optionally selects a language and learning preferences.
5. Backend extracts and normalizes the source content.
6. AI analyzes the content and creates a structured learning plan.
7. Backend generates lesson explanations, slide outlines, diagrams, quizzes and flashcards.
8. Image-generation jobs produce relevant conceptual illustrations where needed.
9. Presentation renderer assembles the content into interactive slides.
10. Narration generation creates audio for the lesson.
11. Animation timings and narration segments are synchronized.
12. User watches the generated lesson, pauses it, moves between slides or explores diagrams.
13. User saves, edits, revises or exports the material.
14. The application tracks learning progress and recommends revision.

The workflow must be asynchronous for expensive operations. The user should not have to keep an HTTP request open while images, audio and slides are being generated.

## 3.1 Processing pipeline

```text
PASTE TEXT / UPLOAD FILE
          |
          v
Content Extraction
          |
          v
Normalization & Chunking
          |
          v
AI Content Analysis
          |
          v
Structured Learning Plan
          |
          +------------------+
          |                  |
          v                  v
   Lesson Generation    Quiz & Flashcards
          |
          v
   Visual Planning
          |
          +----------------------+
          |                      |
          v                      v
   Diagram Generation     Image Generation
          |                      |
          +-----------+----------+
                      |
                      v
              Slide Assembly
                      |
                      v
             Narration Generation
                      |
                      v
           Animation Synchronization
                      |
                      v
            Interactive Presentation
                      |
                      v
           Save / Revise / Export
```

Text generation, diagram generation, image generation and narration should be independent jobs coordinated by the backend.

A failure in image generation should not destroy an otherwise usable lesson. The system should display a fallback diagram or placeholder and let the user retry that asset.

---

# 4. Frontend Interface Specification

The frontend should use a dark, modern cybersecurity-inspired interface without sacrificing readability.

## 4.1 Visual design system

**Theme:** Dark futuristic learning environment.

Suggested design tokens:

* Main background: `#0B1020`
* Sidebar background: `#10182A`
* Primary accent: `#38BDF8`
* Secondary accent: `#8B5CF6`
* Main text: `#F1F5F9`
* Secondary text: `#94A3B8`
* Borders: `#263449`
* Success: `#34D399`
* Warning: `#FBBF24`
* Error: `#F87171`

Use these as initial design tokens, not hardcoded colors throughout the application.

Typography should prioritize readable technical content. Use clear headings, sufficient line spacing, visible code blocks and accessible contrast.

The UI must be responsive on desktop, laptop, tablet and mobile.

## 4.2 Main application layout

The desktop layout will contain:

**Left sidebar**

* Dashboard
* My Library
* Create Lesson
* Presentations
* Flashcards
* Quizzes
* Learning Progress
* Settings

**Top navigation**

* Search
* Create new project
* Current workspace
* Notifications
* User profile

**Main content area**

* Context-dependent dashboard, editor, lesson viewer or presentation player.

The sidebar should be collapsible. The interface must also support keyboard navigation.

## 4.3 Screen 1 — Dashboard

Purpose: Give the user a complete overview of their learning.

Components:

* Welcome section.
* Continue Learning card.
* Create New Lesson button.
* Total lessons created.
* Total presentations.
* Completed lessons.
* Quiz performance.
* Recently studied material.
* Recent projects.
* Recommended revision.
* Topics marked as difficult.
* Generation jobs currently running.

Each dashboard card should link to the relevant screen.

The dashboard should not show fabricated statistics. Empty states should explain how to start.

## 4.4 Screen 2 — Create New Lesson

This is the application's most important input screen.

The interface should include:

**Content input**

* Large text editor for pasted material.
* Drag-and-drop upload area.
* PDF, DOCX, TXT and Markdown support.
* Multiple source notes where appropriate.
* Source title and optional tags.
* Clear input-size limits and upload status.

**Generation preferences**

* Language: English, Roman Urdu or bilingual.
* Explanation level: Beginner, Intermediate or Advanced.
* Presentation density: Concise or Detailed.
* Visual mode: Diagrams, Illustrations or Both.
* Narration: Off or On.
* Quiz generation: On or Off.
* Flashcard generation: On or Off.

**Primary action:** `Generate Learning Experience`

Advanced preferences can be hidden in a collapsible panel so the user can generate material with one click.

The application should automatically detect the subject and recommend a suitable lesson structure.

## 4.5 Screen 3 — Content Analysis Preview

After the initial analysis, show a structured preview before expensive media generation starts.

Display:

* Detected subject.
* Main topic.
* Subtopics.
* Important terms.
* Prerequisite concepts.
* Suggested slide count.
* Proposed diagrams.
* Proposed illustrations.
* Estimated generation stages.
* Warnings about incomplete or ambiguous source material.

The user should be able to edit the lesson title and remove irrelevant sections.

The default flow should remain automatic. The preview is a chance to correct the plan, not a requirement to configure every slide manually.

## 4.6 Screen 4 — Generation Workspace

Display live generation progress using SSE.

Example progress stages:

* Extracting source content.
* Analyzing concepts.
* Writing explanations.
* Planning visuals.
* Generating diagrams.
* Generating illustrations.
* Creating narration.
* Assembling presentation.
* Saving learning material.

The UI should show completed, running, failed and pending tasks.

Each task should have its own retry option where possible.

Do not display misleading percentages unless the backend can calculate them meaningfully. Otherwise, show the current stage and completed task count.

## 4.7 Screen 5 — Lesson Viewer

This is the detailed learning environment.

Recommended layout:

**Left panel**

* Lesson outline.
* Topic navigation.
* Section completion indicators.

**Center panel**

* Current explanation.
* Technical terminology.
* Examples.
* Diagrams.
* Code snippets.
* Tables and key takeaways.

**Right panel**

* Key concepts.
* Related flashcards.
* Ask AI about this section.
* Important warnings.
* Source references.

Features:

* Expandable explanations.
* Copyable commands and code.
* Zoomable diagrams.
* Search within the lesson.
* Bookmark important material.
* Mark sections as understood.
* Generate additional examples.
* Ask follow-up questions grounded in the source material.

The AI should distinguish between facts contained in the source, additional explanations and uncertain claims.

## 4.8 Screen 6 — Animated Presentation Player

This is the application's signature feature.

The user should feel as though a knowledgeable instructor is teaching the lesson visually.

**Player layout**

* Main stage: 16:9 slide canvas.
* Bottom timeline: Slide sequence and progress.
* Left or bottom controls: Previous, Play/Pause, Next.
* Right panel: Slide outline or narration transcript.
* Top controls: Fullscreen, playback speed, language and captions.

**Playback controls**

* Play and pause.
* Previous and next slide.
* Replay current slide.
* Playback speeds: 0.75×, 1×, 1.25× and 1.5×.
* Mute and volume.
* Captions.
* Fullscreen.
* Jump to a slide.
* Restart presentation.

### Animation engine

Each slide should be represented as a sequence of timed visual events.

Example:

```json
{
  "slideId": "siem-architecture-01",
  "durationMs": 18000,
  "events": [
    {
      "atMs": 0,
      "type": "reveal",
      "targetId": "log-source"
    },
    {
      "atMs": 3000,
      "type": "highlight",
      "targetId": "event-stream"
    },
    {
      "atMs": 6000,
      "type": "moveAlongPath",
      "targetId": "log-packet",
      "pathId": "source-to-siem"
    },
    {
      "atMs": 11000,
      "type": "reveal",
      "targetId": "alert-panel"
    }
  ]
}
```

This is a conceptual example of the animation data structure. The backend must validate it against a strict schema before the frontend renders it.

The frontend should synchronize events with a presentation clock, rather than starting unrelated timers for each animation. This ensures pause, resume, seek and playback-speed changes remain consistent.

### Narration synchronization

Each slide should contain:

* Narration text.
* Audio asset reference, if generated.
* Word or sentence timing metadata, if supported by the TTS provider.
* Associated visual event timings.
* Captions.
* Fallback timing if precise alignment is unavailable.

If narration is disabled, the presentation should still work with timed visual explanations and on-screen text.

### Presentation types

The system should support different visual teaching patterns:

1. **Progressive diagram:** Components appear one at a time.
2. **Data-flow animation:** Packets, logs or events travel through a system.
3. **Concept illustration:** A generated image appears with annotated labels.
4. **Investigation timeline:** Events are revealed in chronological order.
5. **Comparison slide:** Two techniques or concepts are highlighted side by side.
6. **Terminal walkthrough:** Commands and outputs appear sequentially.
7. **Decision flow:** An analyst follows branching investigation steps.

The AI should choose the appropriate presentation type based on the source content.

## 4.9 Screen 7 — Diagram Explorer

The user should be able to explore technical diagrams outside the presentation.

Features:

* Zoom and pan.
* Select a node.
* View a node explanation.
* Highlight relationships.
* Replay the diagram animation.
* Show the sequence of events.
* Open related lesson sections.
* Download the diagram as SVG or PNG where supported.

Use React Flow for interactive node-based diagrams and SVG for custom technical illustrations.

For SIEM architecture, for example, selecting the Logstash node could show its role, input/output stages and related lesson notes.

## 4.10 Screen 8 — AI Image Gallery

Show every generated illustration associated with a lesson.

Each image should include:

* Image preview.
* Related topic.
* Prompt or generation description.
* Source lesson.
* Regenerate action.
* Replace action.
* Download action.
* Usage within slides.

Images should be selected for educational value rather than decoration.

For factual technical material, labels and exact technical details should preferably be rendered as editable HTML/SVG overlays instead of relying on AI-generated text inside images.

## 4.11 Screen 9 — Revision Center

Automatically generated revision resources should be accessible separately from the presentation.

Features:

* Flashcard mode.
* MCQ mode.
* True/false questions.
* Short-answer questions.
* Scenario-based investigations.
* Mistake review.
* Bookmarked questions.
* Weak-topic identification.
* Spaced-repetition schedule.
* Progress by lesson and topic.

Example:

A failed-login lesson could ask the user to examine sample Windows security events, identify suspicious patterns and explain what additional evidence is needed before concluding that a brute-force attack occurred.

Questions should be grounded in the material, with answer explanations and references to the relevant lesson sections.

## 4.12 Screen 10 — My Library

The library stores all generated learning projects.

Features:

* Search by title or keyword.
* Filter by subject, tags, status and date.
* Sort by recent, oldest or recently studied.
* Favorite lessons.
* Duplicate a lesson.
* Rename or delete a lesson.
* Reopen a presentation.
* View source material.
* Export learning resources.
* View generation history.

A project should have separate states for content generation, media generation and export so that partial progress is never mistaken for a complete project.

## 4.13 Screen 11 — Learning Progress

Track:

* Lessons created.
* Lessons viewed.
* Completion percentage.
* Time spent studying.
* Quiz scores.
* Flashcard accuracy.
* Repeated mistakes.
* Topics requiring revision.
* Learning streaks, if enabled.

Progress metrics must reflect real user activity. Opening a lesson should not automatically count as mastering it.

## 4.14 Screen 12 — Settings

Include:

* Profile and account.
* Preferred language.
* Explanation depth.
* Default presentation style.
* Narration preferences.
* AI provider configuration, where appropriate.
* Usage and generation history.
* Storage usage.
* Data export.
* Account deletion.
* Privacy and security options.

AI provider API keys should be stored server-side as secrets or encrypted credentials. They must never be exposed in frontend source code.

---

# 5. AI Content Generation Architecture

The AI subsystem should be modular.

## 5.1 Content analyzer

Responsibilities:

1. Detect the subject and topic.
2. Extract the source's central claims.
3. Identify terminology.
4. Identify prerequisite concepts.
5. Find relationships between concepts.
6. Identify examples and procedures.
7. Separate source facts from supplemental explanations.
8. Determine which visualizations would help.
9. Detect ambiguous or incomplete material.

The analyzer should return structured JSON, not a large unstructured paragraph.

Example conceptual result:

```json
{
  "title": "SIEM Architecture",
  "subject": "Cybersecurity",
  "difficulty": "intermediate",
  "learningObjectives": [
    "Explain the SIEM data flow",
    "Identify the role of log sources",
    "Describe how alerts are investigated"
  ],
  "sections": [
    {
      "title": "Log Collection",
      "concepts": [
        "Event sources",
        "Log forwarding",
        "Normalization"
      ]
    }
  ],
  "visuals": [
    {
      "type": "data-flow",
      "purpose": "Explain how security events reach the SIEM"
    }
  ]
}
```

All output must be validated against a schema. Invalid output should be retried or sent to a controlled repair step.

## 5.2 Lesson generator

For each section, generate:

* Definition.
* Detailed explanation.
* Why it matters.
* How it works.
* Technical example.
* Common mistakes.
* Practical application.
* Summary.
* Prerequisites.
* Source references.

The level of detail should depend on the source material and user-selected difficulty.

For cybersecurity lessons, commands, event identifiers and query syntax must not be invented merely to fill a template.

## 5.3 Visual planner

The visual planner determines whether a section needs:

* Flowchart.
* Architecture diagram.
* Timeline.
* Entity relationship diagram.
* Comparison.
* Sequence diagram.
* Code walkthrough.
* Conceptual image.
* Chart.
* Annotated screenshot or user-provided figure.

The system should prefer deterministic diagrams when exact technical relationships matter.

For example, a SIEM pipeline should be generated from validated nodes and edges rather than an AI image that may misrepresent component connections.

## 5.4 Diagram generator

Generate diagram definitions as structured JSON.

Example:

```json
{
  "type": "data-flow",
  "nodes": [
    {
      "id": "source",
      "label": "Log Sources",
      "kind": "source"
    },
    {
      "id": "siem",
      "label": "SIEM",
      "kind": "processor"
    },
    {
      "id": "analyst",
      "label": "SOC Analyst",
      "kind": "destination"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "source",
      "target": "siem",
      "label": "Security events"
    },
    {
      "id": "e2",
      "source": "siem",
      "target": "analyst",
      "label": "Alerts"
    }
  ]
}
```

The renderer should validate node IDs, edge references, node types and layout bounds before displaying the diagram.

## 5.5 Image generation

Generate conceptual images only when they improve understanding.

Potential use cases:

* A conceptual representation of a security operations center.
* A visual analogy for network segmentation.
* An illustration explaining authentication.
* A cloud-security architecture background.

Use generated images as illustrations, not authoritative sources for exact technical configurations.

Store the generated asset and its metadata. Do not regenerate the same image unnecessarily when the user revisits a lesson.

## 5.6 Quiz and flashcard generator

Generate questions using the lesson content and learning objectives.

Supported question types:

* Multiple choice.
* True or false.
* Short answer.
* Explain a concept.
* Analyze a log.
* Investigate a scenario.
* Identify the next investigation step.

Each question should include:

* Prompt.
* Question type.
* Answer key.
* Explanation.
* Difficulty.
* Related concept.
* Source section.
* Optional scoring rubric.

For multiple-choice questions, validate that there is a correct answer and that distractors are plausible without being misleading.

## 5.7 Narration generator

The narration generator creates instructor-style explanations for slides.

Responsibilities:

* Convert slide content into natural spoken language.
* Avoid reading every bullet verbatim.
* Explain diagrams in the correct order.
* Create captions.
* Generate audio assets through a TTS provider.
* Preserve technical terminology.
* Support the user's selected language.

Narration should be generated from the same structured slide data that drives the animations.

## 5.8 Presentation assembler

The assembler combines:

* Slide content.
* Diagram definitions.
* Image references.
* Animation events.
* Narration text.
* Audio references.
* Captions.
* Timing metadata.
* Lesson navigation.

The result is a versioned presentation manifest that the React player can render.

The presentation should remain editable even after generation.

---

# 6. Backend Architecture

## 6.1 Backend responsibilities

Node.js and Express.js should handle:

* Authentication.
* User authorization.
* Project and lesson management.
* File uploads.
* Content extraction orchestration.
* AI provider calls.
* Generation-job management.
* Image and audio asset tracking.
* Presentation creation.
* Quiz scoring.
* Revision scheduling.
* Progress tracking.
* Export generation.
* Usage limits.
* Audit and operational logs.

The backend should be organized into modules rather than placing all logic inside Express route handlers.

## 6.2 Recommended architecture

```text
React Frontend
      |
      v
Express API
      |
      +---- Authentication & Authorization
      |
      +---- Projects & Lessons
      |
      +---- Upload & Extraction
      |
      +---- Generation Orchestrator
      |          |
      |          v
      |      Job Queue
      |          |
      |          +---- Content Worker
      |          +---- Diagram Worker
      |          +---- Image Worker
      |          +---- Narration Worker
      |          +---- Export Worker
      |
      +---- Revision & Progress
      |
      v
MongoDB + Object Storage + Redis
```

The application can start as a modular monolith. Separate microservices are unnecessary for the first version.

## 6.3 Backend modules

**Auth module**

* Register.
* Login.
* Logout.
* Session validation.
* Password reset.
* User profile.

**Projects module**

* Create, list, edit and delete projects.
* Search and filter projects.
* Manage project ownership.

**Sources module**

* Accept pasted text and uploaded documents.
* Validate file types and sizes.
* Extract text and metadata.
* Track processing status.

**Lessons module**

* Create lesson structures.
* Update explanations.
* Manage sections and learning objectives.

**Generation module**

* Start and cancel jobs.
* Track stage status.
* Retry failed stages.
* Apply usage limits.
* Handle provider failures.

**Visuals module**

* Generate diagram specifications.
* Store image assets.
* Manage visual-to-slide relationships.

**Presentation module**

* Assemble slide manifests.
* Manage versions.
* Save edits.
* Serve playback data.

**Revision module**

* Create flashcards and quizzes.
* Score answers.
* Schedule revision.
* Track mistakes.

**Exports module**

* Generate PDF notes.
* Generate PPTX presentations.
* Export diagrams and supported media.
* Track export jobs.

---

# 7. REST API Design

Use a versioned prefix: `/api/v1`.

## 7.1 Authentication

| Method | Endpoint                | Purpose                    |
| ------ | ----------------------- | -------------------------- |
| POST   | `/auth/register`        | Create account             |
| POST   | `/auth/login`           | Authenticate               |
| POST   | `/auth/logout`          | End session                |
| GET    | `/auth/me`              | Get current user           |
| POST   | `/auth/forgot-password` | Start password recovery    |
| POST   | `/auth/reset-password`  | Complete password recovery |

Use secure, HTTP-only cookies for browser sessions where appropriate, with CSRF protection for cookie-authenticated state-changing requests.

## 7.2 Projects

| Method | Endpoint                 | Purpose              |
| ------ | ------------------------ | -------------------- |
| POST   | `/projects`              | Create project       |
| GET    | `/projects`              | List user's projects |
| GET    | `/projects/:id`          | Project details      |
| PATCH  | `/projects/:id`          | Update project       |
| DELETE | `/projects/:id`          | Delete project       |
| GET    | `/projects/:id/activity` | Project activity     |

## 7.3 Source material

| Method | Endpoint                       | Purpose            |
| ------ | ------------------------------ | ------------------ |
| POST   | `/projects/:id/sources/text`   | Submit pasted text |
| POST   | `/projects/:id/sources/upload` | Upload a document  |
| GET    | `/projects/:id/sources`        | List sources       |
| GET    | `/sources/:id`                 | Source details     |
| DELETE | `/sources/:id`                 | Remove source      |

## 7.4 Generation jobs

| Method | Endpoint                    | Purpose                    |
| ------ | --------------------------- | -------------------------- |
| POST   | `/projects/:id/generations` | Start generation           |
| GET    | `/generations/:id`          | Check generation status    |
| POST   | `/generations/:id/retry`    | Retry eligible failed work |
| POST   | `/generations/:id/cancel`   | Cancel pending work        |
| GET    | `/generations/:id/events`   | Stream progress using SSE  |

The generation request should include a source reference and preferences. The backend should return a job ID immediately.

## 7.5 Lessons and presentations

| Method | Endpoint                      | Purpose                   |
| ------ | ----------------------------- | ------------------------- |
| GET    | `/lessons/:id`                | Get lesson                |
| PATCH  | `/lessons/:id`                | Edit lesson               |
| GET    | `/lessons/:id/presentation`   | Get presentation manifest |
| PATCH  | `/presentations/:id`          | Save presentation edits   |
| POST   | `/presentations/:id/versions` | Create version            |
| POST   | `/presentations/:id/exports`  | Request export            |
| GET    | `/exports/:id`                | Check export status       |

## 7.6 Revision

| Method | Endpoint                  | Purpose                 |
| ------ | ------------------------- | ----------------------- |
| GET    | `/lessons/:id/flashcards` | Get flashcards          |
| POST   | `/flashcards/:id/review`  | Record flashcard review |
| GET    | `/lessons/:id/quizzes`    | Get quizzes             |
| POST   | `/quizzes/:id/attempts`   | Submit quiz answers     |
| GET    | `/revision/due`           | Get due revision items  |
| GET    | `/progress/summary`       | Get learning statistics |

Every endpoint must enforce authentication where required, resource ownership and request validation.

---

# 8. MongoDB Database Design

Use MongoDB with Mongoose and schema validation.

Collections should store structured data and references to large files. Images, audio files and exported presentations should normally live in object storage rather than inside ordinary MongoDB documents.

## 8.1 Users collection

Example:

```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "passwordHash": "hashed-password",
  "displayName": "Learner",
  "preferences": {
    "language": "en",
    "difficulty": "intermediate",
    "narrationEnabled": true
  },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

The example values are placeholders. Passwords must never be stored in plaintext.

Recommended indexes:

* Unique index on normalized email.

## 8.2 Projects collection

Stores the user's learning projects.

Fields:

* `_id`
* `ownerId`
* `title`
* `description`
* `subject`
* `tags`
* `status`
* `preferences`
* `createdAt`
* `updatedAt`
* `lastStudiedAt`

Indexes:

* `ownerId + updatedAt`
* `ownerId + subject`
* Optional text search index, depending on search requirements.

## 8.3 Sources collection

Stores metadata about pasted text and uploaded material.

Fields:

* `_id`
* `ownerId`
* `projectId`
* `sourceType`
* `originalFilename`
* `storageKey`, if uploaded
* `mimeType`
* `sizeBytes`
* `contentHash`
* `extractionStatus`
* `extractedText` or references to content chunks
* `metadata`
* `createdAt`

Do not store unbounded amounts of extracted text in a single document. Large source material should be split into manageable chunks.

## 8.4 Lessons collection

Stores the structured learning content.

Fields:

* `_id`
* `ownerId`
* `projectId`
* `sourceIds`
* `title`
* `subject`
* `difficulty`
* `learningObjectives`
* `sections`
* `keyTerms`
* `sourceReferences`
* `generationStatus`
* `version`
* `createdAt`
* `updatedAt`

A section can include its explanation, examples, practical steps, warnings, summary and source references.

For very large lessons, sections can be stored in a separate collection rather than growing one document indefinitely.

## 8.5 Generations collection

Tracks asynchronous generation jobs.

Fields:

* `_id`
* `ownerId`
* `projectId`
* `sourceIds`
* `status`
* `currentStage`
* `stageResults`
* `attemptCount`
* `errorCode`
* `errorMessage`
* `startedAt`
* `completedAt`
* `createdAt`

Store safe diagnostic information, not provider secrets or full sensitive source material in operational logs.

## 8.6 Presentations collection

Fields:

* `_id`
* `ownerId`
* `projectId`
* `lessonId`
* `title`
* `version`
* `slides`
* `playbackSettings`
* `status`
* `createdAt`
* `updatedAt`

A slide may reference diagram, image and audio assets by ID. It should also contain validated layout and animation data.

For large presentations, store individual slides or presentation versions in separate documents.

## 8.7 Assets collection

Fields:

* `_id`
* `ownerId`
* `projectId`
* `lessonId`
* `assetType`
* `storageKey`
* `mimeType`
* `sizeBytes`
* `checksum`
* `generationMetadata`
* `status`
* `createdAt`

Asset types include:

* Image.
* Audio.
* Diagram export.
* PDF.
* PPTX.
* Other approved file types.

Use signed, short-lived URLs for private asset access.

## 8.8 Flashcards collection

Fields:

* `_id`
* `ownerId`
* `lessonId`
* `conceptId`
* `front`
* `back`
* `explanation`
* `sourceReferences`
* `difficulty`
* `createdAt`

User-specific review history can be stored separately so the same flashcard content can be reused without mixing learning progress between users.

## 8.9 Quizzes collection

Fields:

* `_id`
* `ownerId`
* `lessonId`
* `title`
* `questions`
* `difficulty`
* `sourceReferences`
* `createdAt`

Question data includes:

* Question type.
* Prompt.
* Options, where applicable.
* Answer key.
* Explanation.
* Related concepts.
* Scoring metadata.

For sensitive quiz designs, do not expose answer keys unnecessarily before submission.

## 8.10 Quiz attempts collection

Fields:

* `_id`
* `ownerId`
* `quizId`
* `lessonId`
* `answers`
* `score`
* `maxScore`
* `startedAt`
* `submittedAt`

Use this collection to calculate progress and identify recurring mistakes.

## 8.11 Progress collection

Fields:

* `_id`
* `ownerId`
* `lessonId`
* `lastSlideViewed`
* `completedSections`
* `timeSpentSeconds`
* `completionStatus`
* `lastStudiedAt`
* `updatedAt`

Use a unique compound index on `ownerId + lessonId` if one progress summary per user and lesson is intended.

## 8.12 Relationships

```text
User
 |
 +---- Projects
         |
         +---- Sources
         |
         +---- Generations
         |
         +---- Lessons
                 |
                 +---- Presentations
                 |       |
                 |       +---- Assets
                 |
                 +---- Flashcards
                 |
                 +---- Quizzes
                 |       |
                 |       +---- Quiz Attempts
                 |
                 +---- Progress
```

All ownership relationships must be checked on the server. Knowing a MongoDB document ID must never be sufficient to access another user's material.

---

# 9. Suggested Frontend Folder Structure

```text
frontend/
├── public/
│   ├── icons/
│   └── fonts/
├── src/
│   ├── app/
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── query-client.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── diagrams/
│   │   ├── media/
│   │   └── presentation/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── sources/
│   │   ├── generation/
│   │   ├── lessons/
│   │   ├── presentations/
│   │   ├── diagrams/
│   │   ├── flashcards/
│   │   ├── quizzes/
│   │   ├── progress/
│   │   └── settings/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── vite.config.ts
```

Use feature-based organization so each major feature owns its components, API functions, types and state logic.

Suggested shared libraries:

* TanStack Query for server state.
* React Hook Form for forms.
* Zod for client-side validation.
* A small UI state store only where cross-component state is genuinely needed.

The presentation player should maintain its playback clock separately from ordinary UI state to avoid unnecessary re-renders.

---

# 10. Suggested Backend Folder Structure

```text
backend/
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── storage.ts
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── validate.ts
│   │   ├── rateLimit.ts
│   │   └── errorHandler.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── projects/
│   │   ├── sources/
│   │   ├── lessons/
│   │   ├── generations/
│   │   ├── diagrams/
│   │   ├── assets/
│   │   ├── presentations/
│   │   ├── flashcards/
│   │   ├── quizzes/
│   │   ├── progress/
│   │   └── exports/
│   ├── ai/
│   │   ├── providers/
│   │   ├── prompts/
│   │   ├── schemas/
│   │   ├── contentAnalyzer.ts
│   │   ├── lessonGenerator.ts
│   │   ├── visualPlanner.ts
│   │   └── narrationGenerator.ts
│   ├── jobs/
│   │   ├── queues/
│   │   └── workers/
│   ├── services/
│   ├── models/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── tests/
├── package.json
└── tsconfig.json
```

The backend should use a centralized error format and typed service interfaces. Business logic belongs in services, not directly in route handlers.

---

# 11. AI Provider Abstraction

Do not couple the application to a single provider's API.

Define interfaces such as:

```ts
interface TextGenerationProvider {
  generateStructured<T>(
    input: {
      instructions: string;
      content: string;
      schema: unknown;
    }
  ): Promise<T>;
}

interface ImageGenerationProvider {
  generateImage(input: {
    prompt: string;
    aspectRatio?: string;
  }): Promise<{
    assetUrl: string;
  }>;
}

interface SpeechProvider {
  synthesize(input: {
    text: string;
    language: string;
  }): Promise<{
    assetUrl: string;
  }>;
}
```

These are illustrative TypeScript contracts. Production implementations must also support timeouts, error handling, usage accounting and provider-specific limitations.

The backend should validate all returned content before saving it.

Never execute AI-generated JavaScript, HTML or arbitrary code to render a lesson. Render only approved component types and validated structured data.

---

# 12. Job Processing and Reliability

AI generation may take seconds or minutes, so background processing is essential.

## Recommended workflow

1. API validates the request.
2. API creates a generation record in MongoDB.
3. API enqueues a job in Redis/BullMQ.
4. Worker claims the job.
5. Worker updates stage status.
6. Worker generates structured content.
7. Worker validates and persists results.
8. Subsequent jobs generate visuals, narration and exports.
9. SSE informs the frontend about progress.
10. Final status becomes completed, partially completed or failed.

Production requirements:

* Idempotent job execution.
* Retry with exponential backoff.
* Provider timeout handling.
* Per-user concurrency limits.
* Cancellation support.
* Duplicate-job prevention.
* Partial-result recovery.
* Dead-letter handling for repeatedly failed jobs.
* Usage and cost tracking.

A retry should reuse already successful assets wherever possible.

---

# 13. File Uploads and Content Extraction

Supported initial formats:

* Plain text.
* Markdown.
* PDF.
* DOCX.

Additional formats such as PPTX and images with OCR can be added later.

Extraction workflow:

1. Validate file extension, MIME type and file signature.
2. Apply upload-size and page-count limits.
3. Store the file in private object storage.
4. Scan uploaded files where suitable tooling is available.
5. Extract text in a sandboxed processing environment.
6. Preserve headings, page numbers and source references where possible.
7. Split large material into chunks.
8. Create the source record.
9. Send the normalized content into the generation pipeline.

Scanned PDFs may require OCR. Password-protected, corrupted or unsupported files should produce a clear error rather than silently generating incomplete lessons.

Never trust a file's extension alone.

---

# 14. Presentation Export

The application should provide three distinct export experiences.

## 14.1 PDF notes

Include:

* Lesson title.
* Table of contents.
* Section explanations.
* Diagrams.
* Key takeaways.
* Flashcards or questions, if selected.
* Source references.

## 14.2 PPTX presentation

Create editable presentation slides where feasible.

Include:

* Titles and bullet content.
* Diagrams and illustrations.
* Speaker notes where supported.
* Consistent slide layouts.

Do not promise that every browser animation will transfer perfectly to PPTX. The export process should use an explicit set of supported animation features.

## 14.3 Animated presentation

The primary animated experience should run inside the application using the React presentation player.

Exporting it as a video can be a later feature. It may require a rendering pipeline, audio synchronization and additional compute resources.

---

# 15. Security Requirements

Security must be built into the first version.

* Use HTTPS in production.
* Hash passwords with a modern password-hashing algorithm.
* Enforce authentication and resource ownership.
* Validate every API request.
* Apply rate limits.
* Use secure session cookies or appropriately managed tokens.
* Keep secrets out of frontend code and Git repositories.
* Use private object storage and expiring signed URLs.
* Limit upload size, type and processing time.
* Sanitize rendered text and prevent stored XSS.
* Never render arbitrary generated HTML or execute generated scripts.
* Protect against CSRF where cookie-based authentication is used.
* Restrict CORS to trusted application origins.
* Redact sensitive information from logs.
* Apply deletion policies to uploaded content and generated assets.
* Track AI provider usage and spending.
* Protect against prompt injection in uploaded learning material.
* Treat source documents as untrusted input, not system instructions.

Because the application is initially intended for cybersecurity study, users may paste logs or security data. Warn them not to upload secrets, credentials or sensitive third-party data unless they are authorized and the processing arrangement is appropriate.

---

# 16. Accuracy and Learning Quality

The application must not simply produce visually impressive slides. It must produce useful, technically correct educational material.

## Required safeguards

**Source grounding**

Generated explanations should link back to the relevant source sections. Additional claims should be labeled as supplementary explanations.

**Technical validation**

Commands, log identifiers, configuration examples and query syntax should be checked against the source or an appropriate reference when possible.

**Visual validation**

Diagram edges should correspond to real relationships. Labels should be editable and readable. The renderer should not invent connections.

**Question validation**

Quiz answers must match the lesson content. Scenario questions should distinguish confirmed evidence from hypotheses.

**Human review**

The user must be able to edit or regenerate any generated section, diagram, slide or question.

**Uncertainty**

When source content is insufficient, the application should flag uncertainty instead of filling gaps with fabricated facts.

---

# 17. Non-Functional Requirements

The initial product should target:

* Responsive desktop-first experience.
* Accessible controls and keyboard navigation.
* Autosave for lesson and presentation edits.
* Reliable recovery after refresh.
* Clear generation status.
* Partial success when one media provider fails.
* Efficient asset reuse.
* Pagination and search for large libraries.
* Secure deletion and data export.
* Monitoring for failed jobs and API errors.

Performance goals should be established through testing rather than assumed. Large source documents and media-heavy presentations must be handled without freezing the browser.

---

# 18. Development Roadmap

## Phase 1 — Foundation

Build:

* React application shell.
* Dashboard and navigation.
* Authentication.
* Express API.
* MongoDB connection.
* Project creation.
* Paste-text input.
* Saved project library.

**Acceptance criterion:** A user can create an account, paste material, save a project and reopen it.

## Phase 2 — AI learning content

Build:

* Source normalization.
* Content analyzer.
* Structured lesson generation.
* Lesson viewer.
* Editing and autosave.
* Generation status.

**Acceptance criterion:** Pasted content becomes a structured, editable lesson.

## Phase 3 — Diagrams and visuals

Build:

* Visual planner.
* React Flow diagram renderer.
* SVG diagram exports.
* Image-generation adapter.
* Asset library.
* Diagram-to-lesson linking.

**Acceptance criterion:** A lesson can contain both validated technical diagrams and relevant generated illustrations.

## Phase 4 — Animated presentation

Build:

* Presentation manifest.
* Slide layouts.
* Timeline engine.
* Reveal and highlight events.
* Moving elements along paths.
* Pause, resume, seek and playback speed.
* Slide navigation.

**Acceptance criterion:** A user can play an animated lesson and pause or resume without losing synchronization.

## Phase 5 — Narration

Build:

* Narration script generation.
* Text-to-speech integration.
* Captions.
* Audio asset storage.
* Narration-to-animation synchronization.

**Acceptance criterion:** The spoken explanation and visual sequence follow the same lesson plan.

## Phase 6 — Revision system

Build:

* Flashcards.
* Quizzes.
* Scenario-based questions.
* Answer explanations.
* Progress tracking.
* Revision scheduling.

**Acceptance criterion:** The user can test understanding and revisit weak topics.

## Phase 7 — Export and polish

Build:

* PDF notes.
* PPTX export.
* Presentation version history.
* Search and filters.
* Improved mobile layout.
* Operational monitoring.
* Security review.

**Acceptance criterion:** Users can save, revise, export and reliably revisit generated learning material.

---

# 19. MVP Scope

Do not build every advanced feature simultaneously.

The first usable release should include:

1. Dashboard.
2. Paste-text input.
3. PDF and DOCX upload.
4. AI-generated structured lesson.
5. Automatic technical diagrams.
6. Relevant generated illustrations.
7. Interactive animated slides.
8. Optional narration.
9. Flashcards and MCQs.
10. MongoDB persistence.
11. Project library.
12. Basic PDF export.

PPTX video export, complex spaced repetition, multiple AI providers and advanced collaboration can come later.

The most important milestone is a complete end-to-end flow: one source document becomes one accurate, animated, revisable lesson.

---

# 20. Suggested Initial Database and Infrastructure Setup

Development environment:

* Node.js LTS.
* React + Vite.
* Express.js.
* MongoDB local instance or managed development database.
* Redis for background jobs.
* Private local or S3-compatible asset storage.
* Environment variables managed outside source control.
* Docker Compose for repeatable local services.

Suggested environment variables:

```dotenv
NODE_ENV=development
PORT=4000

MONGODB_URI=
REDIS_URL=

SESSION_SECRET=

AI_TEXT_PROVIDER=
AI_TEXT_API_KEY=

AI_IMAGE_PROVIDER=
AI_IMAGE_API_KEY=

AI_SPEECH_PROVIDER=
AI_SPEECH_API_KEY=

STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

These variables are configuration placeholders. Actual provider names, URLs and keys should be added only after choosing the services.

Do not commit `.env` files. Provide a `.env.example` containing empty placeholders.

For production, use a secrets manager or deployment platform's secure environment configuration.

---

# 21. Definition of Done

The product should be considered ready for its first real user only when the following flow works reliably:

1. The user pastes a lesson or uploads a document.
2. The application extracts and analyzes its content.
3. The AI creates an editable, structured lesson.
4. The application generates relevant diagrams and illustrations.
5. The slide renderer assembles a presentation.
6. Visual events animate in the correct order.
7. Narration plays when enabled.
8. The user can pause, resume, navigate and revisit slides.
9. Flashcards and quizzes are generated with explanations.
10. The lesson is saved in MongoDB.
11. Generated assets remain available after refreshing the application.
12. The user can export notes and supported presentation formats.
13. Failed generation stages can be retried without losing successful work.
14. User data remains private and access-controlled.
15. Technical claims and diagrams are grounded in the provided material or appropriately verified.

---

# Final Product Direction

CyberLearn AI should evolve into a personal AI teacher, not just an AI slide generator.

Its defining experience is:

**Understand → Explain → Visualize → Animate → Narrate → Practice → Revise.**

React will provide the interactive learning environment, Node.js will coordinate the generation pipeline and background jobs, and MongoDB will store the structured lessons, projects and progress.

The most important engineering decision is to use a structured lesson and presentation format as the central data model. Every feature—diagrams, narration, quizzes, animations and exports—should be generated from or linked to that shared structure. This makes the application easier to maintain, extend and improve without rebuilding the same content independently for every feature.
# CyberLearn AI

## Complete Application Specification & Technical Architecture

**Project type:** AI-powered interactive learning and revision platform
**Initial specialization:** Cybersecurity, SOC, HTB CDSA
**Frontend:** React + TypeScript + Tailwind CSS
**Backend:** Node.js + Express.js + TypeScript
**Database:** MongoDB + Mongoose
**AI capabilities:** Content understanding, lesson generation, diagrams, image generation, animated presentations, narration, quizzes and revision
**Document version:** 1.0

---

# 1. Project Vision

CyberLearn AI is a personal AI-powered learning platform that converts any study material into an interactive multimedia learning experience.

The user should not need to manually prepare slides, diagrams, summaries, quizzes or flashcards. They should only need to paste their study material or upload a document.

The application will analyze the source material, identify its concepts, determine the relationships between concepts and generate a structured learning experience.

For example, when a user pastes a lesson about SIEM architecture, the application can automatically produce:

* Structured lessons and detailed explanations.
* Presentation slides with relevant illustrations.
* Technical diagrams and animated data flows.
* AI-generated conceptual images.
* Step-by-step explanations of complex concepts.
* Narration synchronized with slide animations.
* Flashcards, MCQs and practical scenarios.
* Revision notes and downloadable PDF or PPTX files.
* A saved course library and progress tracking.

The application should work for other technical subjects too, but its initial templates and example content will focus on SOC analysis, SIEM, log investigation, detection engineering and cybersecurity.

## 1.1 Core principle

**The user provides the learning material; the application creates the learning experience.**

The application must not depend on a predefined list of topics. It should be able to process unfamiliar subjects and select appropriate visual formats based on the material.

For instance:

* A networking lesson may need a packet-flow diagram.
* A SOC investigation may need a timeline and event-correlation view.
* A programming lesson may need annotated code.
* A cloud-security lesson may need an architecture diagram.
* A theoretical lesson may need a concept map or comparison chart.

---

# 2. Technology Stack

| Layer                 | Technology                                   | Purpose                                      |
| --------------------- | -------------------------------------------- | -------------------------------------------- |
| Frontend              | React + TypeScript                           | Interactive application UI                   |
| Build tool            | Vite                                         | Frontend development and bundling            |
| Styling               | Tailwind CSS                                 | Responsive styling                           |
| UI components         | shadcn/ui or a custom component system       | Consistent interface                         |
| Animation             | Framer Motion / Motion                       | Slide transitions and interface animation    |
| Diagram rendering     | React Flow + SVG                             | Interactive technical diagrams               |
| Charts                | Recharts                                     | Timelines, statistics and visual comparisons |
| Presentation playback | Custom React presentation engine             | Slide sequencing and playback                |
| Rich-text editing     | Tiptap                                       | Editing generated lessons                    |
| Backend               | Node.js + Express.js + TypeScript            | REST API and application logic               |
| API validation        | Zod                                          | Request and response validation              |
| Database              | MongoDB + Mongoose                           | Persistent application data                  |
| Background jobs       | BullMQ + Redis                               | AI generation and long-running jobs          |
| File storage          | S3-compatible object storage                 | PDFs, images, audio and exports              |
| AI integration        | Provider abstraction layer                   | Text generation and analysis                 |
| Image generation      | Compatible image-generation API              | Conceptual illustrations                     |
| Text-to-speech        | Compatible TTS provider                      | Spoken lessons                               |
| Authentication        | Secure session or token-based authentication | User access                                  |
| Real-time updates     | Server-Sent Events (SSE)                     | Generation progress                          |
| Testing               | Vitest, React Testing Library, Supertest     | Frontend and backend testing                 |
| Deployment            | Docker + reverse proxy                       | Reproducible deployment                      |

**Important architecture decision:** Redis and object storage are supporting infrastructure, not replacements for MongoDB. MongoDB stores structured application data; object storage holds large binary files.

The application should use provider adapters so AI, image-generation and narration providers can be changed without rewriting the entire system.

---

# 3. Complete Application Workflow

The complete user journey should be:

1. User opens the dashboard.
2. User creates a new learning project.
3. User pastes content, uploads a document or adds source notes.
4. User optionally selects a language and learning preferences.
5. Backend extracts and normalizes the source content.
6. AI analyzes the content and creates a structured learning plan.
7. Backend generates lesson explanations, slide outlines, diagrams, quizzes and flashcards.
8. Image-generation jobs produce relevant conceptual illustrations where needed.
9. Presentation renderer assembles the content into interactive slides.
10. Narration generation creates audio for the lesson.
11. Animation timings and narration segments are synchronized.
12. User watches the generated lesson, pauses it, moves between slides or explores diagrams.
13. User saves, edits, revises or exports the material.
14. The application tracks learning progress and recommends revision.

The workflow must be asynchronous for expensive operations. The user should not have to keep an HTTP request open while images, audio and slides are being generated.

## 3.1 Processing pipeline

```text
PASTE TEXT / UPLOAD FILE
          |
          v
Content Extraction
          |
          v
Normalization & Chunking
          |
          v
AI Content Analysis
          |
          v
Structured Learning Plan
          |
          +------------------+
          |                  |
          v                  v
   Lesson Generation    Quiz & Flashcards
          |
          v
   Visual Planning
          |
          +----------------------+
          |                      |
          v                      v
   Diagram Generation     Image Generation
          |                      |
          +-----------+----------+
                      |
                      v
              Slide Assembly
                      |
                      v
             Narration Generation
                      |
                      v
           Animation Synchronization
                      |
                      v
            Interactive Presentation
                      |
                      v
           Save / Revise / Export
```

Text generation, diagram generation, image generation and narration should be independent jobs coordinated by the backend.

A failure in image generation should not destroy an otherwise usable lesson. The system should display a fallback diagram or placeholder and let the user retry that asset.

---

# 4. Frontend Interface Specification

The frontend should use a dark, modern cybersecurity-inspired interface without sacrificing readability.

## 4.1 Visual design system

**Theme:** Dark futuristic learning environment.

Suggested design tokens:

* Main background: `#0B1020`
* Sidebar background: `#10182A`
* Primary accent: `#38BDF8`
* Secondary accent: `#8B5CF6`
* Main text: `#F1F5F9`
* Secondary text: `#94A3B8`
* Borders: `#263449`
* Success: `#34D399`
* Warning: `#FBBF24`
* Error: `#F87171`

Use these as initial design tokens, not hardcoded colors throughout the application.

Typography should prioritize readable technical content. Use clear headings, sufficient line spacing, visible code blocks and accessible contrast.

The UI must be responsive on desktop, laptop, tablet and mobile.

## 4.2 Main application layout

The desktop layout will contain:

**Left sidebar**

* Dashboard
* My Library
* Create Lesson
* Presentations
* Flashcards
* Quizzes
* Learning Progress
* Settings

**Top navigation**

* Search
* Create new project
* Current workspace
* Notifications
* User profile

**Main content area**

* Context-dependent dashboard, editor, lesson viewer or presentation player.

The sidebar should be collapsible. The interface must also support keyboard navigation.

## 4.3 Screen 1 — Dashboard

Purpose: Give the user a complete overview of their learning.

Components:

* Welcome section.
* Continue Learning card.
* Create New Lesson button.
* Total lessons created.
* Total presentations.
* Completed lessons.
* Quiz performance.
* Recently studied material.
* Recent projects.
* Recommended revision.
* Topics marked as difficult.
* Generation jobs currently running.

Each dashboard card should link to the relevant screen.

The dashboard should not show fabricated statistics. Empty states should explain how to start.

## 4.4 Screen 2 — Create New Lesson

This is the application's most important input screen.

The interface should include:

**Content input**

* Large text editor for pasted material.
* Drag-and-drop upload area.
* PDF, DOCX, TXT and Markdown support.
* Multiple source notes where appropriate.
* Source title and optional tags.
* Clear input-size limits and upload status.

**Generation preferences**

* Language: English, Roman Urdu or bilingual.
* Explanation level: Beginner, Intermediate or Advanced.
* Presentation density: Concise or Detailed.
* Visual mode: Diagrams, Illustrations or Both.
* Narration: Off or On.
* Quiz generation: On or Off.
* Flashcard generation: On or Off.

**Primary action:** `Generate Learning Experience`

Advanced preferences can be hidden in a collapsible panel so the user can generate material with one click.

The application should automatically detect the subject and recommend a suitable lesson structure.

## 4.5 Screen 3 — Content Analysis Preview

After the initial analysis, show a structured preview before expensive media generation starts.

Display:

* Detected subject.
* Main topic.
* Subtopics.
* Important terms.
* Prerequisite concepts.
* Suggested slide count.
* Proposed diagrams.
* Proposed illustrations.
* Estimated generation stages.
* Warnings about incomplete or ambiguous source material.

The user should be able to edit the lesson title and remove irrelevant sections.

The default flow should remain automatic. The preview is a chance to correct the plan, not a requirement to configure every slide manually.

## 4.6 Screen 4 — Generation Workspace

Display live generation progress using SSE.

Example progress stages:

* Extracting source content.
* Analyzing concepts.
* Writing explanations.
* Planning visuals.
* Generating diagrams.
* Generating illustrations.
* Creating narration.
* Assembling presentation.
* Saving learning material.

The UI should show completed, running, failed and pending tasks.

Each task should have its own retry option where possible.

Do not display misleading percentages unless the backend can calculate them meaningfully. Otherwise, show the current stage and completed task count.

## 4.7 Screen 5 — Lesson Viewer

This is the detailed learning environment.

Recommended layout:

**Left panel**

* Lesson outline.
* Topic navigation.
* Section completion indicators.

**Center panel**

* Current explanation.
* Technical terminology.
* Examples.
* Diagrams.
* Code snippets.
* Tables and key takeaways.

**Right panel**

* Key concepts.
* Related flashcards.
* Ask AI about this section.
* Important warnings.
* Source references.

Features:

* Expandable explanations.
* Copyable commands and code.
* Zoomable diagrams.
* Search within the lesson.
* Bookmark important material.
* Mark sections as understood.
* Generate additional examples.
* Ask follow-up questions grounded in the source material.

The AI should distinguish between facts contained in the source, additional explanations and uncertain claims.

## 4.8 Screen 6 — Animated Presentation Player

This is the application's signature feature.

The user should feel as though a knowledgeable instructor is teaching the lesson visually.

**Player layout**

* Main stage: 16:9 slide canvas.
* Bottom timeline: Slide sequence and progress.
* Left or bottom controls: Previous, Play/Pause, Next.
* Right panel: Slide outline or narration transcript.
* Top controls: Fullscreen, playback speed, language and captions.

**Playback controls**

* Play and pause.
* Previous and next slide.
* Replay current slide.
* Playback speeds: 0.75×, 1×, 1.25× and 1.5×.
* Mute and volume.
* Captions.
* Fullscreen.
* Jump to a slide.
* Restart presentation.

### Animation engine

Each slide should be represented as a sequence of timed visual events.

Example:

```json
{
  "slideId": "siem-architecture-01",
  "durationMs": 18000,
  "events": [
    {
      "atMs": 0,
      "type": "reveal",
      "targetId": "log-source"
    },
    {
      "atMs": 3000,
      "type": "highlight",
      "targetId": "event-stream"
    },
    {
      "atMs": 6000,
      "type": "moveAlongPath",
      "targetId": "log-packet",
      "pathId": "source-to-siem"
    },
    {
      "atMs": 11000,
      "type": "reveal",
      "targetId": "alert-panel"
    }
  ]
}
```

This is a conceptual example of the animation data structure. The backend must validate it against a strict schema before the frontend renders it.

The frontend should synchronize events with a presentation clock, rather than starting unrelated timers for each animation. This ensures pause, resume, seek and playback-speed changes remain consistent.

### Narration synchronization

Each slide should contain:

* Narration text.
* Audio asset reference, if generated.
* Word or sentence timing metadata, if supported by the TTS provider.
* Associated visual event timings.
* Captions.
* Fallback timing if precise alignment is unavailable.

If narration is disabled, the presentation should still work with timed visual explanations and on-screen text.

### Presentation types

The system should support different visual teaching patterns:

1. **Progressive diagram:** Components appear one at a time.
2. **Data-flow animation:** Packets, logs or events travel through a system.
3. **Concept illustration:** A generated image appears with annotated labels.
4. **Investigation timeline:** Events are revealed in chronological order.
5. **Comparison slide:** Two techniques or concepts are highlighted side by side.
6. **Terminal walkthrough:** Commands and outputs appear sequentially.
7. **Decision flow:** An analyst follows branching investigation steps.

The AI should choose the appropriate presentation type based on the source content.

## 4.9 Screen 7 — Diagram Explorer

The user should be able to explore technical diagrams outside the presentation.

Features:

* Zoom and pan.
* Select a node.
* View a node explanation.
* Highlight relationships.
* Replay the diagram animation.
* Show the sequence of events.
* Open related lesson sections.
* Download the diagram as SVG or PNG where supported.

Use React Flow for interactive node-based diagrams and SVG for custom technical illustrations.

For SIEM architecture, for example, selecting the Logstash node could show its role, input/output stages and related lesson notes.

## 4.10 Screen 8 — AI Image Gallery

Show every generated illustration associated with a lesson.

Each image should include:

* Image preview.
* Related topic.
* Prompt or generation description.
* Source lesson.
* Regenerate action.
* Replace action.
* Download action.
* Usage within slides.

Images should be selected for educational value rather than decoration.

For factual technical material, labels and exact technical details should preferably be rendered as editable HTML/SVG overlays instead of relying on AI-generated text inside images.

## 4.11 Screen 9 — Revision Center

Automatically generated revision resources should be accessible separately from the presentation.

Features:

* Flashcard mode.
* MCQ mode.
* True/false questions.
* Short-answer questions.
* Scenario-based investigations.
* Mistake review.
* Bookmarked questions.
* Weak-topic identification.
* Spaced-repetition schedule.
* Progress by lesson and topic.

Example:

A failed-login lesson could ask the user to examine sample Windows security events, identify suspicious patterns and explain what additional evidence is needed before concluding that a brute-force attack occurred.

Questions should be grounded in the material, with answer explanations and references to the relevant lesson sections.

## 4.12 Screen 10 — My Library

The library stores all generated learning projects.

Features:

* Search by title or keyword.
* Filter by subject, tags, status and date.
* Sort by recent, oldest or recently studied.
* Favorite lessons.
* Duplicate a lesson.
* Rename or delete a lesson.
* Reopen a presentation.
* View source material.
* Export learning resources.
* View generation history.

A project should have separate states for content generation, media generation and export so that partial progress is never mistaken for a complete project.

## 4.13 Screen 11 — Learning Progress

Track:

* Lessons created.
* Lessons viewed.
* Completion percentage.
* Time spent studying.
* Quiz scores.
* Flashcard accuracy.
* Repeated mistakes.
* Topics requiring revision.
* Learning streaks, if enabled.

Progress metrics must reflect real user activity. Opening a lesson should not automatically count as mastering it.

## 4.14 Screen 12 — Settings

Include:

* Profile and account.
* Preferred language.
* Explanation depth.
* Default presentation style.
* Narration preferences.
* AI provider configuration, where appropriate.
* Usage and generation history.
* Storage usage.
* Data export.
* Account deletion.
* Privacy and security options.

AI provider API keys should be stored server-side as secrets or encrypted credentials. They must never be exposed in frontend source code.

---

# 5. AI Content Generation Architecture

The AI subsystem should be modular.

## 5.1 Content analyzer

Responsibilities:

1. Detect the subject and topic.
2. Extract the source's central claims.
3. Identify terminology.
4. Identify prerequisite concepts.
5. Find relationships between concepts.
6. Identify examples and procedures.
7. Separate source facts from supplemental explanations.
8. Determine which visualizations would help.
9. Detect ambiguous or incomplete material.

The analyzer should return structured JSON, not a large unstructured paragraph.

Example conceptual result:

```json
{
  "title": "SIEM Architecture",
  "subject": "Cybersecurity",
  "difficulty": "intermediate",
  "learningObjectives": [
    "Explain the SIEM data flow",
    "Identify the role of log sources",
    "Describe how alerts are investigated"
  ],
  "sections": [
    {
      "title": "Log Collection",
      "concepts": [
        "Event sources",
        "Log forwarding",
        "Normalization"
      ]
    }
  ],
  "visuals": [
    {
      "type": "data-flow",
      "purpose": "Explain how security events reach the SIEM"
    }
  ]
}
```

All output must be validated against a schema. Invalid output should be retried or sent to a controlled repair step.

## 5.2 Lesson generator

For each section, generate:

* Definition.
* Detailed explanation.
* Why it matters.
* How it works.
* Technical example.
* Common mistakes.
* Practical application.
* Summary.
* Prerequisites.
* Source references.

The level of detail should depend on the source material and user-selected difficulty.

For cybersecurity lessons, commands, event identifiers and query syntax must not be invented merely to fill a template.

## 5.3 Visual planner

The visual planner determines whether a section needs:

* Flowchart.
* Architecture diagram.
* Timeline.
* Entity relationship diagram.
* Comparison.
* Sequence diagram.
* Code walkthrough.
* Conceptual image.
* Chart.
* Annotated screenshot or user-provided figure.

The system should prefer deterministic diagrams when exact technical relationships matter.

For example, a SIEM pipeline should be generated from validated nodes and edges rather than an AI image that may misrepresent component connections.

## 5.4 Diagram generator

Generate diagram definitions as structured JSON.

Example:

```json
{
  "type": "data-flow",
  "nodes": [
    {
      "id": "source",
      "label": "Log Sources",
      "kind": "source"
    },
    {
      "id": "siem",
      "label": "SIEM",
      "kind": "processor"
    },
    {
      "id": "analyst",
      "label": "SOC Analyst",
      "kind": "destination"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "source",
      "target": "siem",
      "label": "Security events"
    },
    {
      "id": "e2",
      "source": "siem",
      "target": "analyst",
      "label": "Alerts"
    }
  ]
}
```

The renderer should validate node IDs, edge references, node types and layout bounds before displaying the diagram.

## 5.5 Image generation

Generate conceptual images only when they improve understanding.

Potential use cases:

* A conceptual representation of a security operations center.
* A visual analogy for network segmentation.
* An illustration explaining authentication.
* A cloud-security architecture background.

Use generated images as illustrations, not authoritative sources for exact technical configurations.

Store the generated asset and its metadata. Do not regenerate the same image unnecessarily when the user revisits a lesson.

## 5.6 Quiz and flashcard generator

Generate questions using the lesson content and learning objectives.

Supported question types:

* Multiple choice.
* True or false.
* Short answer.
* Explain a concept.
* Analyze a log.
* Investigate a scenario.
* Identify the next investigation step.

Each question should include:

* Prompt.
* Question type.
* Answer key.
* Explanation.
* Difficulty.
* Related concept.
* Source section.
* Optional scoring rubric.

For multiple-choice questions, validate that there is a correct answer and that distractors are plausible without being misleading.

## 5.7 Narration generator

The narration generator creates instructor-style explanations for slides.

Responsibilities:

* Convert slide content into natural spoken language.
* Avoid reading every bullet verbatim.
* Explain diagrams in the correct order.
* Create captions.
* Generate audio assets through a TTS provider.
* Preserve technical terminology.
* Support the user's selected language.

Narration should be generated from the same structured slide data that drives the animations.

## 5.8 Presentation assembler

The assembler combines:

* Slide content.
* Diagram definitions.
* Image references.
* Animation events.
* Narration text.
* Audio references.
* Captions.
* Timing metadata.
* Lesson navigation.

The result is a versioned presentation manifest that the React player can render.

The presentation should remain editable even after generation.

---

# 6. Backend Architecture

## 6.1 Backend responsibilities

Node.js and Express.js should handle:

* Authentication.
* User authorization.
* Project and lesson management.
* File uploads.
* Content extraction orchestration.
* AI provider calls.
* Generation-job management.
* Image and audio asset tracking.
* Presentation creation.
* Quiz scoring.
* Revision scheduling.
* Progress tracking.
* Export generation.
* Usage limits.
* Audit and operational logs.

The backend should be organized into modules rather than placing all logic inside Express route handlers.

## 6.2 Recommended architecture

```text
React Frontend
      |
      v
Express API
      |
      +---- Authentication & Authorization
      |
      +---- Projects & Lessons
      |
      +---- Upload & Extraction
      |
      +---- Generation Orchestrator
      |          |
      |          v
      |      Job Queue
      |          |
      |          +---- Content Worker
      |          +---- Diagram Worker
      |          +---- Image Worker
      |          +---- Narration Worker
      |          +---- Export Worker
      |
      +---- Revision & Progress
      |
      v
MongoDB + Object Storage + Redis
```

The application can start as a modular monolith. Separate microservices are unnecessary for the first version.

## 6.3 Backend modules

**Auth module**

* Register.
* Login.
* Logout.
* Session validation.
* Password reset.
* User profile.

**Projects module**

* Create, list, edit and delete projects.
* Search and filter projects.
* Manage project ownership.

**Sources module**

* Accept pasted text and uploaded documents.
* Validate file types and sizes.
* Extract text and metadata.
* Track processing status.

**Lessons module**

* Create lesson structures.
* Update explanations.
* Manage sections and learning objectives.

**Generation module**

* Start and cancel jobs.
* Track stage status.
* Retry failed stages.
* Apply usage limits.
* Handle provider failures.

**Visuals module**

* Generate diagram specifications.
* Store image assets.
* Manage visual-to-slide relationships.

**Presentation module**

* Assemble slide manifests.
* Manage versions.
* Save edits.
* Serve playback data.

**Revision module**

* Create flashcards and quizzes.
* Score answers.
* Schedule revision.
* Track mistakes.

**Exports module**

* Generate PDF notes.
* Generate PPTX presentations.
* Export diagrams and supported media.
* Track export jobs.

---

# 7. REST API Design

Use a versioned prefix: `/api/v1`.

## 7.1 Authentication

| Method | Endpoint                | Purpose                    |
| ------ | ----------------------- | -------------------------- |
| POST   | `/auth/register`        | Create account             |
| POST   | `/auth/login`           | Authenticate               |
| POST   | `/auth/logout`          | End session                |
| GET    | `/auth/me`              | Get current user           |
| POST   | `/auth/forgot-password` | Start password recovery    |
| POST   | `/auth/reset-password`  | Complete password recovery |

Use secure, HTTP-only cookies for browser sessions where appropriate, with CSRF protection for cookie-authenticated state-changing requests.

## 7.2 Projects

| Method | Endpoint                 | Purpose              |
| ------ | ------------------------ | -------------------- |
| POST   | `/projects`              | Create project       |
| GET    | `/projects`              | List user's projects |
| GET    | `/projects/:id`          | Project details      |
| PATCH  | `/projects/:id`          | Update project       |
| DELETE | `/projects/:id`          | Delete project       |
| GET    | `/projects/:id/activity` | Project activity     |

## 7.3 Source material

| Method | Endpoint                       | Purpose            |
| ------ | ------------------------------ | ------------------ |
| POST   | `/projects/:id/sources/text`   | Submit pasted text |
| POST   | `/projects/:id/sources/upload` | Upload a document  |
| GET    | `/projects/:id/sources`        | List sources       |
| GET    | `/sources/:id`                 | Source details     |
| DELETE | `/sources/:id`                 | Remove source      |

## 7.4 Generation jobs

| Method | Endpoint                    | Purpose                    |
| ------ | --------------------------- | -------------------------- |
| POST   | `/projects/:id/generations` | Start generation           |
| GET    | `/generations/:id`          | Check generation status    |
| POST   | `/generations/:id/retry`    | Retry eligible failed work |
| POST   | `/generations/:id/cancel`   | Cancel pending work        |
| GET    | `/generations/:id/events`   | Stream progress using SSE  |

The generation request should include a source reference and preferences. The backend should return a job ID immediately.

## 7.5 Lessons and presentations

| Method | Endpoint                      | Purpose                   |
| ------ | ----------------------------- | ------------------------- |
| GET    | `/lessons/:id`                | Get lesson                |
| PATCH  | `/lessons/:id`                | Edit lesson               |
| GET    | `/lessons/:id/presentation`   | Get presentation manifest |
| PATCH  | `/presentations/:id`          | Save presentation edits   |
| POST   | `/presentations/:id/versions` | Create version            |
| POST   | `/presentations/:id/exports`  | Request export            |
| GET    | `/exports/:id`                | Check export status       |

## 7.6 Revision

| Method | Endpoint                  | Purpose                 |
| ------ | ------------------------- | ----------------------- |
| GET    | `/lessons/:id/flashcards` | Get flashcards          |
| POST   | `/flashcards/:id/review`  | Record flashcard review |
| GET    | `/lessons/:id/quizzes`    | Get quizzes             |
| POST   | `/quizzes/:id/attempts`   | Submit quiz answers     |
| GET    | `/revision/due`           | Get due revision items  |
| GET    | `/progress/summary`       | Get learning statistics |

Every endpoint must enforce authentication where required, resource ownership and request validation.

---

# 8. MongoDB Database Design

Use MongoDB with Mongoose and schema validation.

Collections should store structured data and references to large files. Images, audio files and exported presentations should normally live in object storage rather than inside ordinary MongoDB documents.

## 8.1 Users collection

Example:

```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "passwordHash": "hashed-password",
  "displayName": "Learner",
  "preferences": {
    "language": "en",
    "difficulty": "intermediate",
    "narrationEnabled": true
  },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

The example values are placeholders. Passwords must never be stored in plaintext.

Recommended indexes:

* Unique index on normalized email.

## 8.2 Projects collection

Stores the user's learning projects.

Fields:

* `_id`
* `ownerId`
* `title`
* `description`
* `subject`
* `tags`
* `status`
* `preferences`
* `createdAt`
* `updatedAt`
* `lastStudiedAt`

Indexes:

* `ownerId + updatedAt`
* `ownerId + subject`
* Optional text search index, depending on search requirements.

## 8.3 Sources collection

Stores metadata about pasted text and uploaded material.

Fields:

* `_id`
* `ownerId`
* `projectId`
* `sourceType`
* `originalFilename`
* `storageKey`, if uploaded
* `mimeType`
* `sizeBytes`
* `contentHash`
* `extractionStatus`
* `extractedText` or references to content chunks
* `metadata`
* `createdAt`

Do not store unbounded amounts of extracted text in a single document. Large source material should be split into manageable chunks.

## 8.4 Lessons collection

Stores the structured learning content.

Fields:

* `_id`
* `ownerId`
* `projectId`
* `sourceIds`
* `title`
* `subject`
* `difficulty`
* `learningObjectives`
* `sections`
* `keyTerms`
* `sourceReferences`
* `generationStatus`
* `version`
* `createdAt`
* `updatedAt`

A section can include its explanation, examples, practical steps, warnings, summary and source references.

For very large lessons, sections can be stored in a separate collection rather than growing one document indefinitely.

## 8.5 Generations collection

Tracks asynchronous generation jobs.

Fields:

* `_id`
* `ownerId`
* `projectId`
* `sourceIds`
* `status`
* `currentStage`
* `stageResults`
* `attemptCount`
* `errorCode`
* `errorMessage`
* `startedAt`
* `completedAt`
* `createdAt`

Store safe diagnostic information, not provider secrets or full sensitive source material in operational logs.

## 8.6 Presentations collection

Fields:

* `_id`
* `ownerId`
* `projectId`
* `lessonId`
* `title`
* `version`
* `slides`
* `playbackSettings`
* `status`
* `createdAt`
* `updatedAt`

A slide may reference diagram, image and audio assets by ID. It should also contain validated layout and animation data.

For large presentations, store individual slides or presentation versions in separate documents.

## 8.7 Assets collection

Fields:

* `_id`
* `ownerId`
* `projectId`
* `lessonId`
* `assetType`
* `storageKey`
* `mimeType`
* `sizeBytes`
* `checksum`
* `generationMetadata`
* `status`
* `createdAt`

Asset types include:

* Image.
* Audio.
* Diagram export.
* PDF.
* PPTX.
* Other approved file types.

Use signed, short-lived URLs for private asset access.

## 8.8 Flashcards collection

Fields:

* `_id`
* `ownerId`
* `lessonId`
* `conceptId`
* `front`
* `back`
* `explanation`
* `sourceReferences`
* `difficulty`
* `createdAt`

User-specific review history can be stored separately so the same flashcard content can be reused without mixing learning progress between users.

## 8.9 Quizzes collection

Fields:

* `_id`
* `ownerId`
* `lessonId`
* `title`
* `questions`
* `difficulty`
* `sourceReferences`
* `createdAt`

Question data includes:

* Question type.
* Prompt.
* Options, where applicable.
* Answer key.
* Explanation.
* Related concepts.
* Scoring metadata.

For sensitive quiz designs, do not expose answer keys unnecessarily before submission.

## 8.10 Quiz attempts collection

Fields:

* `_id`
* `ownerId`
* `quizId`
* `lessonId`
* `answers`
* `score`
* `maxScore`
* `startedAt`
* `submittedAt`

Use this collection to calculate progress and identify recurring mistakes.

## 8.11 Progress collection

Fields:

* `_id`
* `ownerId`
* `lessonId`
* `lastSlideViewed`
* `completedSections`
* `timeSpentSeconds`
* `completionStatus`
* `lastStudiedAt`
* `updatedAt`

Use a unique compound index on `ownerId + lessonId` if one progress summary per user and lesson is intended.

## 8.12 Relationships

```text
User
 |
 +---- Projects
         |
         +---- Sources
         |
         +---- Generations
         |
         +---- Lessons
                 |
                 +---- Presentations
                 |       |
                 |       +---- Assets
                 |
                 +---- Flashcards
                 |
                 +---- Quizzes
                 |       |
                 |       +---- Quiz Attempts
                 |
                 +---- Progress
```

All ownership relationships must be checked on the server. Knowing a MongoDB document ID must never be sufficient to access another user's material.

---

# 9. Suggested Frontend Folder Structure

```text
frontend/
├── public/
│   ├── icons/
│   └── fonts/
├── src/
│   ├── app/
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── query-client.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── diagrams/
│   │   ├── media/
│   │   └── presentation/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── sources/
│   │   ├── generation/
│   │   ├── lessons/
│   │   ├── presentations/
│   │   ├── diagrams/
│   │   ├── flashcards/
│   │   ├── quizzes/
│   │   ├── progress/
│   │   └── settings/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── vite.config.ts
```

Use feature-based organization so each major feature owns its components, API functions, types and state logic.

Suggested shared libraries:

* TanStack Query for server state.
* React Hook Form for forms.
* Zod for client-side validation.
* A small UI state store only where cross-component state is genuinely needed.

The presentation player should maintain its playback clock separately from ordinary UI state to avoid unnecessary re-renders.

---

# 10. Suggested Backend Folder Structure

```text
backend/
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── storage.ts
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── validate.ts
│   │   ├── rateLimit.ts
│   │   └── errorHandler.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── projects/
│   │   ├── sources/
│   │   ├── lessons/
│   │   ├── generations/
│   │   ├── diagrams/
│   │   ├── assets/
│   │   ├── presentations/
│   │   ├── flashcards/
│   │   ├── quizzes/
│   │   ├── progress/
│   │   └── exports/
│   ├── ai/
│   │   ├── providers/
│   │   ├── prompts/
│   │   ├── schemas/
│   │   ├── contentAnalyzer.ts
│   │   ├── lessonGenerator.ts
│   │   ├── visualPlanner.ts
│   │   └── narrationGenerator.ts
│   ├── jobs/
│   │   ├── queues/
│   │   └── workers/
│   ├── services/
│   ├── models/
│   ├── utils/
│   ├── app.ts
│   └── server.ts
├── tests/
├── package.json
└── tsconfig.json
```

The backend should use a centralized error format and typed service interfaces. Business logic belongs in services, not directly in route handlers.

---

# 11. AI Provider Abstraction

Do not couple the application to a single provider's API.

Define interfaces such as:

```ts
interface TextGenerationProvider {
  generateStructured<T>(
    input: {
      instructions: string;
      content: string;
      schema: unknown;
    }
  ): Promise<T>;
}

interface ImageGenerationProvider {
  generateImage(input: {
    prompt: string;
    aspectRatio?: string;
  }): Promise<{
    assetUrl: string;
  }>;
}

interface SpeechProvider {
  synthesize(input: {
    text: string;
    language: string;
  }): Promise<{
    assetUrl: string;
  }>;
}
```

These are illustrative TypeScript contracts. Production implementations must also support timeouts, error handling, usage accounting and provider-specific limitations.

The backend should validate all returned content before saving it.

Never execute AI-generated JavaScript, HTML or arbitrary code to render a lesson. Render only approved component types and validated structured data.

---

# 12. Job Processing and Reliability

AI generation may take seconds or minutes, so background processing is essential.

## Recommended workflow

1. API validates the request.
2. API creates a generation record in MongoDB.
3. API enqueues a job in Redis/BullMQ.
4. Worker claims the job.
5. Worker updates stage status.
6. Worker generates structured content.
7. Worker validates and persists results.
8. Subsequent jobs generate visuals, narration and exports.
9. SSE informs the frontend about progress.
10. Final status becomes completed, partially completed or failed.

Production requirements:

* Idempotent job execution.
* Retry with exponential backoff.
* Provider timeout handling.
* Per-user concurrency limits.
* Cancellation support.
* Duplicate-job prevention.
* Partial-result recovery.
* Dead-letter handling for repeatedly failed jobs.
* Usage and cost tracking.

A retry should reuse already successful assets wherever possible.

---

# 13. File Uploads and Content Extraction

Supported initial formats:

* Plain text.
* Markdown.
* PDF.
* DOCX.

Additional formats such as PPTX and images with OCR can be added later.

Extraction workflow:

1. Validate file extension, MIME type and file signature.
2. Apply upload-size and page-count limits.
3. Store the file in private object storage.
4. Scan uploaded files where suitable tooling is available.
5. Extract text in a sandboxed processing environment.
6. Preserve headings, page numbers and source references where possible.
7. Split large material into chunks.
8. Create the source record.
9. Send the normalized content into the generation pipeline.

Scanned PDFs may require OCR. Password-protected, corrupted or unsupported files should produce a clear error rather than silently generating incomplete lessons.

Never trust a file's extension alone.

---

# 14. Presentation Export

The application should provide three distinct export experiences.

## 14.1 PDF notes

Include:

* Lesson title.
* Table of contents.
* Section explanations.
* Diagrams.
* Key takeaways.
* Flashcards or questions, if selected.
* Source references.

## 14.2 PPTX presentation

Create editable presentation slides where feasible.

Include:

* Titles and bullet content.
* Diagrams and illustrations.
* Speaker notes where supported.
* Consistent slide layouts.

Do not promise that every browser animation will transfer perfectly to PPTX. The export process should use an explicit set of supported animation features.

## 14.3 Animated presentation

The primary animated experience should run inside the application using the React presentation player.

Exporting it as a video can be a later feature. It may require a rendering pipeline, audio synchronization and additional compute resources.

---

# 15. Security Requirements

Security must be built into the first version.

* Use HTTPS in production.
* Hash passwords with a modern password-hashing algorithm.
* Enforce authentication and resource ownership.
* Validate every API request.
* Apply rate limits.
* Use secure session cookies or appropriately managed tokens.
* Keep secrets out of frontend code and Git repositories.
* Use private object storage and expiring signed URLs.
* Limit upload size, type and processing time.
* Sanitize rendered text and prevent stored XSS.
* Never render arbitrary generated HTML or execute generated scripts.
* Protect against CSRF where cookie-based authentication is used.
* Restrict CORS to trusted application origins.
* Redact sensitive information from logs.
* Apply deletion policies to uploaded content and generated assets.
* Track AI provider usage and spending.
* Protect against prompt injection in uploaded learning material.
* Treat source documents as untrusted input, not system instructions.

Because the application is initially intended for cybersecurity study, users may paste logs or security data. Warn them not to upload secrets, credentials or sensitive third-party data unless they are authorized and the processing arrangement is appropriate.

---

# 16. Accuracy and Learning Quality

The application must not simply produce visually impressive slides. It must produce useful, technically correct educational material.

## Required safeguards

**Source grounding**

Generated explanations should link back to the relevant source sections. Additional claims should be labeled as supplementary explanations.

**Technical validation**

Commands, log identifiers, configuration examples and query syntax should be checked against the source or an appropriate reference when possible.

**Visual validation**

Diagram edges should correspond to real relationships. Labels should be editable and readable. The renderer should not invent connections.

**Question validation**

Quiz answers must match the lesson content. Scenario questions should distinguish confirmed evidence from hypotheses.

**Human review**

The user must be able to edit or regenerate any generated section, diagram, slide or question.

**Uncertainty**

When source content is insufficient, the application should flag uncertainty instead of filling gaps with fabricated facts.

---

# 17. Non-Functional Requirements

The initial product should target:

* Responsive desktop-first experience.
* Accessible controls and keyboard navigation.
* Autosave for lesson and presentation edits.
* Reliable recovery after refresh.
* Clear generation status.
* Partial success when one media provider fails.
* Efficient asset reuse.
* Pagination and search for large libraries.
* Secure deletion and data export.
* Monitoring for failed jobs and API errors.

Performance goals should be established through testing rather than assumed. Large source documents and media-heavy presentations must be handled without freezing the browser.

---

# 18. Development Roadmap

## Phase 1 — Foundation

Build:

* React application shell.
* Dashboard and navigation.
* Authentication.
* Express API.
* MongoDB connection.
* Project creation.
* Paste-text input.
* Saved project library.

**Acceptance criterion:** A user can create an account, paste material, save a project and reopen it.

## Phase 2 — AI learning content

Build:

* Source normalization.
* Content analyzer.
* Structured lesson generation.
* Lesson viewer.
* Editing and autosave.
* Generation status.

**Acceptance criterion:** Pasted content becomes a structured, editable lesson.

## Phase 3 — Diagrams and visuals

Build:

* Visual planner.
* React Flow diagram renderer.
* SVG diagram exports.
* Image-generation adapter.
* Asset library.
* Diagram-to-lesson linking.

**Acceptance criterion:** A lesson can contain both validated technical diagrams and relevant generated illustrations.

## Phase 4 — Animated presentation

Build:

* Presentation manifest.
* Slide layouts.
* Timeline engine.
* Reveal and highlight events.
* Moving elements along paths.
* Pause, resume, seek and playback speed.
* Slide navigation.

**Acceptance criterion:** A user can play an animated lesson and pause or resume without losing synchronization.

## Phase 5 — Narration

Build:

* Narration script generation.
* Text-to-speech integration.
* Captions.
* Audio asset storage.
* Narration-to-animation synchronization.

**Acceptance criterion:** The spoken explanation and visual sequence follow the same lesson plan.

## Phase 6 — Revision system

Build:

* Flashcards.
* Quizzes.
* Scenario-based questions.
* Answer explanations.
* Progress tracking.
* Revision scheduling.

**Acceptance criterion:** The user can test understanding and revisit weak topics.

## Phase 7 — Export and polish

Build:

* PDF notes.
* PPTX export.
* Presentation version history.
* Search and filters.
* Improved mobile layout.
* Operational monitoring.
* Security review.

**Acceptance criterion:** Users can save, revise, export and reliably revisit generated learning material.

---

# 19. MVP Scope

Do not build every advanced feature simultaneously.

The first usable release should include:

1. Dashboard.
2. Paste-text input.
3. PDF and DOCX upload.
4. AI-generated structured lesson.
5. Automatic technical diagrams.
6. Relevant generated illustrations.
7. Interactive animated slides.
8. Optional narration.
9. Flashcards and MCQs.
10. MongoDB persistence.
11. Project library.
12. Basic PDF export.

PPTX video export, complex spaced repetition, multiple AI providers and advanced collaboration can come later.

The most important milestone is a complete end-to-end flow: one source document becomes one accurate, animated, revisable lesson.

---

# 20. Suggested Initial Database and Infrastructure Setup

Development environment:

* Node.js LTS.
* React + Vite.
* Express.js.
* MongoDB local instance or managed development database.
* Redis for background jobs.
* Private local or S3-compatible asset storage.
* Environment variables managed outside source control.
* Docker Compose for repeatable local services.

Suggested environment variables:

```dotenv
NODE_ENV=development
PORT=4000

MONGODB_URI=
REDIS_URL=

SESSION_SECRET=

AI_TEXT_PROVIDER=
AI_TEXT_API_KEY=

AI_IMAGE_PROVIDER=
AI_IMAGE_API_KEY=

AI_SPEECH_PROVIDER=
AI_SPEECH_API_KEY=

STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

These variables are configuration placeholders. Actual provider names, URLs and keys should be added only after choosing the services.

Do not commit `.env` files. Provide a `.env.example` containing empty placeholders.

For production, use a secrets manager or deployment platform's secure environment configuration.

---

# 21. Definition of Done

The product should be considered ready for its first real user only when the following flow works reliably:

1. The user pastes a lesson or uploads a document.
2. The application extracts and analyzes its content.
3. The AI creates an editable, structured lesson.
4. The application generates relevant diagrams and illustrations.
5. The slide renderer assembles a presentation.
6. Visual events animate in the correct order.
7. Narration plays when enabled.
8. The user can pause, resume, navigate and revisit slides.
9. Flashcards and quizzes are generated with explanations.
10. The lesson is saved in MongoDB.
11. Generated assets remain available after refreshing the application.
12. The user can export notes and supported presentation formats.
13. Failed generation stages can be retried without losing successful work.
14. User data remains private and access-controlled.
15. Technical claims and diagrams are grounded in the provided material or appropriately verified.

---

# Final Product Direction

CyberLearn AI should evolve into a personal AI teacher, not just an AI slide generator.

Its defining experience is:

**Understand → Explain → Visualize → Animate → Narrate → Practice → Revise.**

React will provide the interactive learning environment, Node.js will coordinate the generation pipeline and background jobs, and MongoDB will store the structured lessons, projects and progress.

The most important engineering decision is to use a structured lesson and presentation format as the central data model. Every feature—diagrams, narration, quizzes, animations and exports—should be generated from or linked to that shared structure. This makes the application easier to maintain, extend and improve without rebuilding the same content independently for every feature.
1. Application ka core concept

Tum kisi bhi source se learning material la sako ge:

Apne notes paste karna.

PDF, DOCX, PPTX, TXT aur Markdown files upload karna.

Apne class notes aur lecture transcripts import karna.

HTB, TryHackMe, university courses aur doosre learning resources se apne permitted notes add karna.

Baad mein URLs, YouTube transcripts aur aur bhi input types add karna, jahan supported hon.

App material analyze karke usay structured lessons mein convert karegi. Tumhara original material bhi preserve rahega, aur generated content us se alag hoga.

Sab se important design decision: SOC, Pentesting aur Cloud Security ko application ke andar alag products nahi, balkay subjects, learning paths aur modules rakhenge. Naya subject add karna data aur configuration ka kaam hoga, nayi application banane ka nahi.

2. Application ke andar kya kya hoga?

01 — Dashboard

Tumhari poori learning ka home screen.

Continue Learning

Recently opened lessons

Daily study goals

Quiz scores aur weak topics

Revision due

Total study hours aur progress

02 — Universal Study Importer

Har naye topic ko yahin se add karoge.

Text paste aur document upload

Original file preserve karna

Text extraction aur topic detection

Headings, definitions, commands aur examples identify karna

AI analysis ka preview, generation se pehle

Multiple sources ko ek lesson mein combine karna

03 — AI Teacher

Ye tumhara personal tutor hoga.

Beginner se advanced explanations

Difficult concepts ko simple examples se samjhana

English technical terms ke saath Roman Urdu explanations

Follow-up questions poochna

Practical examples aur command explanations

“Explain again”, “Give an example” aur “Go deeper” options

04 — Visual Learning Studio

Text ko visual learning experience mein badalna.

Automatically generated diagrams

Network aur system architecture

Process flowcharts

Concept maps

Generated images

Animated diagrams aur step-by-step explanations

Presentation slides with transitions

05 — Animated Lessons & Narration

Slides automatically advance karna

Diagram ke components ko step-by-step highlight karna

AI voice narration

Pause, replay aur playback speed controls

Captions aur synchronized transcript

Lesson ko dobara play karna

Note: narration aur animation ki synchronization generated timeline aur timestamps se manage hogi.

06 — Practice & Assessment

MCQs aur short-answer questions

Flashcards

Scenario-based questions

Practical lab checklists

Har answer ke baad explanation

Mistakes ki history

Difficulty ke hisaab se question generation

07 — Revision Center

Aaj revise karne wale topics

Weak concepts ki automatic list

Spaced repetition

Topic-wise revision notes

Exam preparation mode

Previously missed questions

Revision reminders aur progress

08 — Knowledge Graph

Ye feature tumhari learning ko ek doosre se connect karega.

Example: HTTP → Authentication → Session Management → Broken Access Control → IDOR.

SOC mein SIEM → Log Analysis → Detection Rules → Incident Investigation.

Is tarah tum dekh sako ge ke ek concept doosre concept se kaise related hai.

3. Subjects aur learning paths ka system

App mein fixed subjects hardcode nahi karne. Ek dynamic learning-path system banayenge.

SOC & Blue Team

SIEM, Windows Logs, Detection Engineering, Incident Response, HTB CDSA

Penetration Testing

HTTP, Burp Suite, OWASP, authentication, API security, authorized labs

Cloud Security

IAM, networking, cloud logging, permissions, misconfigurations

AI Security

LLM security, prompt injection, AI threat modeling, secure AI systems

University & Other Studies

BSCS courses, networking, programming, mathematics, English ya koi bhi naya subject

Add New Subject

Subject ka naam, description aur optional learning path add karo. System automatically uska workspace bana dega.

Naya subject add karne par app ko nayi coding ya nayi deployment ki zaroorat nahi honi chahiye. Subject aur uske modules database mein create honge; existing importer, AI teacher, diagram engine, quizzes aur revision system usi subject ke liye kaam karenge.

4. Har study session ka workflow

Ye application ka central workflow hoga:

1
Import

Notes paste karo ya file upload karo

2
Analyze

AI topics aur important concepts identify kare

3
Review

Extracted content check aur edit karo

4
Generate

Notes, diagrams, animations, narration aur quizzes banao

5
Learn

Lesson parho, suno aur visual explanation dekho

6
Practice

Questions solve karo aur mistakes samjho

7
Revise

Weak topics ko schedule ke mutabiq dobara parho

Har stage par user ka control rahega. AI ko bina review ke tumhare original notes edit ya delete karne ki permission nahi deni chahiye.

5. Recommended technology stack

Tum React aur Node.js use karna chahte ho, is liye ye architecture suitable hai.

Layer

	

Technology

	

Kaam




Frontend

	

React + TypeScript + Vite

	

App interface




Styling

	

Tailwind CSS

	

Responsive UI




UI components

	

shadcn/ui

	

Consistent controls and dialogs




Backend

	

Node.js + Express + TypeScript

	

API, business logic




Database

	

MongoDB + Mongoose

	

Users, subjects, lessons, progress




Authentication

	

Secure session or JWT-based system

	

Login and access control




AI provider

	

OpenCode API through backend

	

Text analysis and generation




AI abstraction

	

Provider interface

	

Future mein provider switch karna




Diagrams

	

React Flow + SVG

	

Interactive diagrams




Animation

	

Motion + timeline-based player

	

Animated lessons




Background jobs

	

Redis + BullMQ

	

Long AI generation tasks




File storage

	

S3-compatible object storage

	

Uploaded files and generated assets




Narration

	

Pluggable text-to-speech provider

	

Voice and captions




Testing

	

Vitest + API integration tests

	

Reliability

OpenCode AI integration: API key sirf backend par rahegi, frontend par kabhi expose nahi hogi. Text generation ke liye configured model use hoga; image generation aur voice ke liye compatible services separately configure hongi. Provider abstraction ki wajah se future mein service badalna asaan hoga.

6. Database mein kya store hoga?

MongoDB mein sirf notes nahi, tumhari learning ki poori history store hogi.

Collection

	

Stored information




users

	

Account, preferences, language




subjects

	

SOC, pentesting, cloud aur custom subjects




learningPaths

	

Ordered modules aur milestones




sources

	

Original uploaded files aur extracted text




lessons

	

Generated notes aur explanations




diagrams

	

Diagram definitions aur source references




presentations

	

Slides, animation timelines, narration links




assets

	

Images, audio aur generated files




flashcards

	

Questions, answers aur review history




quizzes

	

Questions, answers aur explanations




quizAttempts

	

Scores, wrong answers aur attempts




progress

	

Completion, study time aur mastery estimates




revisionSchedules

	

Agli revision ki date aur review state

Search ke liye source text aur lesson content ko index karenge. Is se tum baad mein search kar sako ge: “Maine IDOR kahan parha tha?” ya “Mere failed logon attempts ke notes kahan hain?”

7. Kuch advanced features jo app ko genuinely useful banayenge

Ask My Notes

Apne saved material se sawal poochna. Jawab ke saath original source aur relevant section ka reference milega. Agar material mein jawab nahi hai, app ko ye baat clearly batani chahiye.

Connect My Knowledge

Related concepts ko different subjects ke darmiyan link karna, jaise SOC detection aur pentesting ke attack techniques.

Export & Backup

Notes ko Markdown, PDF aur supported formats mein export karna; original files aur generated content ka backup bhi rakhna.

Version History

Lesson regenerate ya edit karne par previous versions preserve hon, taake useful notes accidentally lose na hon.

Privacy & Security

Private files, authorization checks, rate limits, upload validation, encrypted transport aur account/data deletion controls.

8. Development roadmap — kis order mein banani hai?

Meri strong recommendation hai ke sab features ek saath build na karo. Pehle foundation banao, phir usi app ko incrementally expand karo.

Phase 1
Core learning platform

Subjects, folders, authentication, notes import, original file storage, lesson editor, search aur OpenCode API integration.

Phase 2
AI learning engine

Structured topic extraction, explanations, summaries, diagrams, quizzes, flashcards aur source references.

Phase 3
Visual learning studio

Animated diagrams, slides, image generation, narration, captions aur presentation playback.

Phase 4
Personal revision system

Spaced repetition, weak-topic tracking, learning analytics, revision calendar aur knowledge graph.

Phase 5
Advanced learning workspace

Ask My Notes, additional import formats, export, backups, optional cloud sync aur configurable learning paths.

Har phase isi codebase, database aur application mein add hoga. Baad mein nayi technology ya subject add karna pade to reusable modules ke through karenge.

9. Final product mein kya nahi hona chahiye?

Har subject ke liye separate hardcoded pages.

AI provider ki API key frontend mein.

AI-generated content ko verified facts samajhna.

Notes regenerate karte waqt original source overwrite karna.

Har user action par synchronous, long-running AI request chalana.

Animation ko sirf decorative banana, jabke actual concept explain na ho.

Aisi features banana jo abhi tum use nahi karte aur core study workflow ko delay kar dein.

10. Meri final recommendation

Pehla working version SOC study workflow se test karo, lekin database aur architecture day one se universal rakho. Phir isi system mein Penetration Testing, Cloud Security, AI Security aur university subjects add karte jao.
