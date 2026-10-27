# CyberLearn AI — Implementation Plan and Product Ideas

**Based on:** `CyberLearn AI.md`  
**Purpose:** Turn the application specification into an ordered, practical build plan.

---

## 1. Recommended Product Direction

CyberLearn AI should be **one reusable learning platform**, not a separate application for SOC, penetration testing, cloud security, or university subjects.

The main workflow should remain:

**Import → Analyze → Review → Generate → Learn → Practice → Revise**

The most important recommendation is to build a small, reliable end-to-end workflow first. Do not begin with image generation, narration, advanced animation, and every import format at the same time.

### First working version to prove

A user should be able to:

1. Create a subject and learning project.
2. Paste notes about one topic, such as SIEM architecture.
3. Review the AI-generated topic and lesson plan.
4. Generate a structured lesson with source references.
5. Edit and save the lesson without changing the original notes.
6. View one validated technical diagram.
7. Complete generated flashcards and an MCQ quiz.
8. Reopen everything after refreshing or restarting the application.

After this works reliably, add document uploads, animated presentations, narration, generated images, advanced revision, and exports.

### Decisions to preserve from the specification

- Subjects and learning paths must be database-driven, not hardcoded pages.
- Original source material must be preserved and never overwritten by AI.
- Generated content must be editable and versioned.
- AI responses must follow validated structured schemas.
- Technical diagrams should use structured nodes and edges, not inaccurate text inside generated images.
- Long-running generation must use background jobs.
- The lesson and presentation manifests should be the central data models.
- The backend should start as a modular monolith, with a separate worker process for jobs—not microservices.

---

## 2. Application Architecture

| Part | Recommended responsibility |
| --- | --- |
| React frontend | Dashboard, importer, lesson editor, diagram viewer, presentation player, quizzes, revision, and settings |
| Express API | Authentication, authorization, validation, CRUD operations, generation requests, and progress tracking |
| Background worker | Content analysis, lesson generation, media generation, and exports |
| MongoDB | Users, subjects, sources, lessons, quizzes, progress, and generation records |
| Redis + BullMQ | Queues, retries, concurrency limits, and job coordination |
| S3-compatible storage | Original uploads, generated images, narration audio, and exports |
| Provider adapters | Text AI, image generation, and text-to-speech integrations |
| SSE | Real-time generation status updates |

```text
React Web App
      |
      v
Express API ----> MongoDB
      |
      +---------> Redis/BullMQ ----> Worker ----> AI providers
      |                                  |
      |                                  +------> Object storage
      |
      +---------> SSE generation updates
```

### Suggested project organization

```text
cyberlearn-ai/
├── frontend/             # React + TypeScript + Vite
├── backend/              # Express API and business modules
├── worker/               # BullMQ consumers and generation pipeline
├── shared/               # Shared TypeScript types and Zod schemas
├── infra/                # Docker Compose and local service configuration
└── docs/                 # Architecture, API, and testing decisions
```

This can be managed with npm or pnpm workspaces. Keep the architecture simple and use feature-based modules inside each application.

---

# 3. Step-by-Step Build Plan

## Phase A — Foundation

### Step 1: Define the MVP boundary and acceptance scenario

Before writing code:

- Select one complete test lesson with accurate, permitted SOC study notes.
- Define the first user journey listed in Section 1.
- Decide which generation preferences are required initially: language, difficulty, detail level, quiz, and flashcards.
- Keep English, Roman Urdu, and bilingual output in the design, but test one language first and then add the others.
- Write down what is deliberately postponed.

**Done when:** One end-to-end scenario is clearly defined, and everyone agrees that advanced media will not block the first core workflow.

### Step 2: Create the project and development tooling

Set up:

- React, TypeScript, Vite, and Tailwind CSS for the frontend.
- Express and TypeScript for the API.
- A worker entry point using the same shared contracts.
- Mongoose, Zod, BullMQ, and the storage client.
- Environment validation so the server fails clearly when required configuration is missing.
- Formatting, linting, type checking, and test scripts.
- A root README with setup and startup instructions.

Add testing from the beginning:

- Vitest for unit tests.
- React Testing Library for important UI behavior.
- Supertest for API integration tests.
- Playwright later for complete browser workflows.

**Done when:** The frontend, API, and worker start in development, connect to their dependencies, and pass a basic health-check test.

### Step 3: Configure local infrastructure and secrets

Use Docker Compose for local development where practical:

- MongoDB.
- Redis.
- MinIO or another S3-compatible development store.

Also add:

- `.env.example` files with empty placeholders.
- `.env` exclusions in `.gitignore`.
- API and worker health checks.
- Separate development, test, and production configuration.
- Private storage buckets and clearly defined file-size limits.

**Done when:** A fresh development environment can be created from the documentation without storing real credentials in source code.

### Step 4: Design shared contracts and the database first

Create shared, versioned schemas for the data exchanged by the frontend, API, AI providers, and worker.

Start with these collections:

- `users`
- `subjects`
- `learningPaths`
- `projects`
- `sources`
- `sourceChunks`
- `lessons`
- `generations`
- `diagrams`
- `presentations`
- `assets`
- `flashcards`
- `flashcardReviews`
- `quizzes`
- `quizAttempts`
- `progress`
- `revisionSchedules`

Important rules:

- Every owned document should contain an `ownerId` or be reachable through an owned parent.
- Source chunks should keep stable IDs and page, heading, or character references where available.
- Lesson sections, diagrams, questions, and chat answers should reference those source chunks.
- Store large binary files in object storage, not ordinary MongoDB documents.
- Add indexes for ownership, project membership, update dates, and revision due dates.
- Keep schema versions on lesson and presentation manifests so future changes can be migrated.

**Done when:** A sample subject, project, source, lesson, and quiz can be saved and queried without hardcoding the subject name.

### Step 5: Build the backend foundation and authorization

Implement the initial modules:

- Authentication and user preferences.
- Subjects and learning paths.
- Projects and library.
- Sources.
- Lessons.
- Generations.

Use a consistent API structure under `/api/v1` and add:

- Zod request validation.
- A centralized error response format.
- Authentication middleware.
- Resource-ownership checks in services or repositories.
- Rate limits for login, uploads, generation, and other expensive endpoints.
- Safe operational logging without passwords, API keys, or sensitive lesson content.

**Done when:** Integration tests prove that one authenticated user cannot read, modify, generate against, or delete another user's resources.

### Step 6: Build the frontend shell and basic learning workspace

Create:

- Responsive application layout with collapsible navigation.
- Dashboard with honest empty states.
- Subject and learning-path management.
- Project creation and library pages.
- Create Lesson page.
- Basic lesson viewer and loading/error states.
- Settings for language and generation defaults.

Use TanStack Query for server state and reusable design tokens for the dark cybersecurity theme. Do not build a separate UI for each subject.

**Done when:** A user can create a custom subject, create a project inside it, and reopen it without any subject-specific code changes.

---

## Phase B — Core AI Learning Workflow

### Step 7: Implement the universal study importer

Build the importer incrementally:

1. Pasted text.
2. TXT and Markdown.
3. PDF and DOCX extraction.
4. Additional formats only after the main flow is stable.

The importer should:

- Preserve the original source.
- Calculate a content hash to help detect duplicate uploads.
- Validate extension, MIME type, file signature, and size.
- Extract text while retaining headings and page references where possible.
- Split large content into meaningful, overlapping chunks only when needed.
- Allow multiple permitted sources to belong to one project.
- Show clear errors for corrupt, protected, empty, or unsupported files.
- Warn users not to upload credentials, secrets, or unauthorized private data.

**Done when:** The original file and extracted text remain separate, large content is not placed in one unbounded document, and every extracted chunk can be traced back to its source.

### Step 8: Add background generation and live status

Create a generation pipeline with explicit states such as:

`queued → extracting → analyzing → awaitingReview → generatingLesson → generatingActivities → completed`

Also support `failed`, `cancelled`, and `partiallyCompleted` where appropriate.

Implement:

- A generation record in MongoDB before queueing work.
- Immediate API response with a generation ID.
- BullMQ jobs and worker handlers.
- SSE updates for stage changes.
- Idempotent stages so retries do not duplicate lessons or assets.
- Exponential backoff for temporary provider failures.
- Per-user concurrency and spending limits.
- Recovery after page refresh or worker restart.
- Safe cancellation of work that has not started.

Initially, let users read a completed lesson even if an optional visual or activity fails.

**Done when:** A user can leave and return to the generation screen, see the correct current state, and retry failed work without losing successful results.

### Step 9: Build the content analyzer and review screen

The first AI operation should create a learning plan, not every output at once.

The analyzer should return structured JSON containing:

- Proposed title and detected subject.
- Difficulty and prerequisites.
- Learning objectives.
- Ordered sections and key concepts.
- Important terminology.
- Suggested visuals.
- Source references for each section.
- Missing, ambiguous, or contradictory source information.

Then create a review screen where the user can:

- Rename the lesson.
- Remove or reorder sections.
- Correct obvious topic-detection mistakes.
- Select which optional outputs to generate.
- Confirm before expensive generation begins.

Treat uploaded material as untrusted data. Source text must not be allowed to replace system instructions or request unrelated actions.

**Done when:** Invalid AI JSON is rejected or safely retried, and no media generation begins before the learning plan is valid and approved according to the chosen workflow.

### Step 10: Build the grounded lesson generator and editor

Generate one section at a time from the approved plan. Each section can contain:

- Explanation and learning objective.
- Key terms.
- Examples and practical application.
- Common mistakes.
- Summary.
- Source references.
- Clearly marked supplementary explanation or uncertainty.

Build the lesson experience with:

- Outline navigation.
- Readable code and command blocks.
- Section-level regeneration.
- Tiptap-based editing where rich text is needed.
- Autosave with visible save status.
- Version history before replacing a generated or edited section.
- “Explain again,” “Give an example,” and “Go deeper” actions grounded in the same source context.

Do not invent commands, Windows event IDs, query syntax, or facts to fill a template.

**Done when:** A generated lesson is readable and editable, every source-based claim can be traced to its reference, and regenerating content never modifies the original source or silently deletes the previous lesson version.

### Step 11: Add deterministic diagrams and visual exploration

Start with a small set of useful diagram types:

- Architecture/data-flow diagram.
- Process flowchart.
- Investigation timeline.
- Comparison view.

The AI should produce a validated diagram definition containing nodes, edges, labels, grouping, and source references. React should render only approved diagram types.

Add:

- React Flow for interactive node-based diagrams.
- SVG for custom technical visuals and exports.
- Validation for unique IDs and valid edge references.
- Zoom, pan, node details, and links back to lesson sections.
- Manual correction and regeneration of a selected diagram.

**Done when:** A SIEM data-flow diagram renders correctly, invalid connections are rejected, and no arbitrary AI-generated HTML, JavaScript, or executable code is rendered.

### Step 12: Build practice, progress, and basic revision

Generate activities from the approved lesson and learning objectives:

- Flashcards.
- MCQs and true/false questions.
- Short-answer questions with a rubric where appropriate.
- Scenario-based questions after the basic scoring flow is reliable.

Each item should include its related concept, explanation, difficulty, and source reference.

Implement:

- Server-side quiz submission and scoring.
- Quiz attempts and mistake history.
- Flashcard reviews stored separately from reusable card content.
- Lesson and section completion based on real activity.
- A simple initial revision schedule.
- A revision page showing due items and weak concepts.

Do not treat opening a lesson as mastery. Avoid fabricated study statistics or weak-topic claims.

**Done when:** A user can complete a quiz, review explanations, revisit missed questions, and see progress that matches stored activity.

---

## Phase C — Multimedia Learning Experience

### Step 13: Build the animated presentation engine

Create a versioned presentation manifest derived from the lesson rather than generating an unrelated slide deck.

Start with a few slide layouts:

- Title and learning objectives.
- Explanation with key points.
- Progressive diagram.
- Investigation timeline.
- Comparison.
- Summary and knowledge check.

The player should use **one presentation clock** for slide and visual-event timing. Add events incrementally:

1. Reveal.
2. Highlight.
3. Simple transition.
4. Movement along a validated SVG path.

Controls should include play/pause, previous/next, replay, seek, slide navigation, fullscreen, and playback speed. Also support keyboard controls and reduced-motion preferences.

**Done when:** Pause, resume, seek, restart, and speed changes produce predictable visual states without unrelated timers drifting out of sync.

### Step 14: Add narration, captions, images, and asset management

Narration should be generated from the same slide manifest used for animation.

Implement:

- Narration script generation.
- A pluggable text-to-speech adapter.
- Audio stored as a reusable asset.
- Transcript and captions.
- Sentence or word timing metadata when available.
- A fallback timing strategy when exact timestamps are unavailable.
- Caption-based playback when audio generation is disabled or fails.

For generated illustrations:

- Generate only visuals that improve understanding.
- Keep technical labels in editable HTML/SVG overlays.
- Store prompt/description, provider metadata, owning lesson, and storage key.
- Reuse successful assets during retries.
- Use private storage and short-lived signed URLs.

**Done when:** Narration and visual events follow the same timeline, optional media failures do not destroy the lesson, and assets remain available after a refresh.

---

## Phase D — Search, Export, Quality, and Release

### Step 15: Add library search and “Ask My Notes”

First implement reliable library search across titles, tags, subjects, and lesson content. Add semantic retrieval only if ordinary search is insufficient.

“Ask My Notes” should:

1. Find relevant chunks from the user's own authorized sources and lessons.
2. Send only the necessary context to the text-generation provider.
3. Generate an answer with clickable source references.
4. Clearly say when the saved material does not contain enough information.
5. Separate source-based answers from supplementary explanation.

**Done when:** Test questions produce correct source links, unrelated documents are not used, and unsupported questions receive an honest “not found in your notes” response.

### Step 16: Add export, backup, and deletion

Implement exports in increasing order of difficulty:

1. Markdown and structured JSON backup.
2. PDF notes.
3. SVG/PNG diagrams.
4. Editable PPTX where supported.
5. Video export only as a later, separate rendering project.

Also provide:

- Export of original sources and generated learning data.
- Clear export status for large jobs.
- Account/project deletion that also handles queued jobs and stored assets.
- Documented backup and restore procedures.

Do not promise that browser animations will transfer perfectly into PPTX.

**Done when:** An exported lesson matches a saved version, deleted resources are no longer accessible, and backup restoration has been tested.

### Step 17: Perform quality, security, and accessibility hardening

Security is required throughout development, but dedicate a complete review before release.

Test at least:

- Authentication and cross-user authorization.
- Stored XSS and unsafe Markdown/rich-text rendering.
- CSRF where cookie authentication is used.
- CORS, rate limiting, and secure production cookies.
- Malicious, oversized, corrupt, and mislabeled uploads.
- Prompt injection inside source documents.
- Provider timeout, rate-limit, invalid-output, and outage behavior.
- Duplicate queue delivery and worker retries.
- Secret redaction and storage access control.
- Keyboard navigation, focus management, contrast, captions, and reduced motion.
- Large lessons and media-heavy presentations without browser freezes.

Create a small reviewed evaluation set containing cybersecurity and non-cybersecurity notes. Measure:

- Valid structured-output rate.
- Section-to-source citation coverage.
- Quiz answer correctness.
- Diagram structural validity.
- Whether uncertainty is reported when the source is incomplete.

**Done when:** Core end-to-end tests pass, high-risk security issues are resolved, and generated-output quality is checked against known examples rather than judged only by appearance.

### Step 18: Deploy, pilot, and improve from real study sessions

For deployment:

- Run the web app, API, and worker as separately scalable processes while keeping one modular codebase.
- Use HTTPS through a reverse proxy or managed platform.
- Move secrets to the deployment platform's secure configuration.
- Use managed or backed-up MongoDB, Redis, and private object storage as appropriate.
- Add centralized error tracking, worker failure alerts, and AI usage/cost monitoring.
- Document restore, rollback, and data-migration procedures.

Pilot in this order:

1. One complete SOC lesson.
2. A longer multi-source SOC project.
3. One non-SOC subject, such as networking or programming, to prove the platform is universal.
4. A small group of real study sessions before adding more advanced features.

**Done when:** Users can complete the full study workflow without developer assistance, and improvements are prioritized from observed learning problems rather than feature count.

---

## 4. Recommended Release Scope

### Build first — Core MVP

- Authentication and ownership.
- Dynamic subjects, learning paths, projects, and library.
- Paste-text input followed by PDF/DOCX/TXT/Markdown import.
- Analysis preview and structured lesson generation.
- Source references, editing, autosave, and versions.
- Background jobs, SSE status, and retries.
- Basic technical diagrams.
- Flashcards, MCQs, attempts, and honest progress.
- Basic search and Markdown/JSON backup.

### Add after the core is reliable — Multimedia V1

- Animated presentation player.
- Narration, captions, and synchronized transcript.
- Useful generated illustrations and asset gallery.
- Scenario questions and stronger revision scheduling.
- “Ask My Notes.”
- PDF, diagram, and supported PPTX exports.

### Postpone until there is evidence users need it

- Video rendering.
- Native mobile applications.
- Real-time collaboration.
- OCR and many additional import integrations.
- Automatic URL or video ingestion.
- Complex knowledge-graph reasoning.
- Public template marketplaces or plugin systems.
- Advanced gamification.

---

## 5. Additional Feature Ideas

| Idea | How it helps | Suggested priority |
| --- | --- | --- |
| **Teach-Back Mode** | The learner explains a concept in their own words; AI asks follow-up questions and identifies missing or misunderstood points using a source-grounded rubric. | High |
| **SOC Investigation Simulator** | Turn synthetic or authorized logs into a guided case with an evidence board, timeline, hypotheses, hints, and a final investigation report. | High |
| **Adaptive Learning Paths** | Use a short diagnostic quiz and later performance to recommend prerequisites and the next module instead of always following a fixed order. | High |
| **Bilingual Technical Glossary** | Keep the English technical term alongside Roman Urdu or bilingual explanations, examples, and common misconceptions. | High |
| **Lesson Quality Report** | Show missing citations, ambiguous source passages, unreviewed AI additions, and sections with weak quiz coverage before publishing or exporting. | High |
| **Mistake and Misconception Journal** | Group repeated wrong answers by concept and generate a focused correction exercise rather than simply repeating the same quiz. | High |
| **Incremental Regeneration** | When source notes change, show a diff and regenerate only affected sections, diagrams, and questions while preserving manual edits where possible. | Medium |
| **Knowledge Graph** | Connect concepts and prerequisites across subjects, such as HTTP → sessions → access control, and reveal gaps in the learner's path. | Medium |
| **Lab-to-Lesson Converter** | Convert permitted HTB, TryHackMe, university, or personal lab notes into a clean reflection, concept summary, and revision pack. | Medium |
| **Command and Query Explainer** | Explain each part of a command or detection query with source references and safety notes; keep execution outside the normal lesson renderer. | Medium |
| **Offline Revision Packs** | Download selected notes, flashcards, and quizzes for later study, then synchronize results when online. | Later |
| **Read-Only Sharing** | Share a reviewed lesson or revision pack without exposing private source files, account data, or answer history. | Later |

### Best differentiating idea: SOC Investigation Simulator

This would make CyberLearn AI more than a notes-and-slides generator. A strong workflow would be:

1. Provide synthetic or authorized evidence.
2. Let the learner build a timeline and select suspicious events.
3. Ask for a hypothesis and what evidence supports it.
4. Offer optional hints instead of immediately revealing the answer.
5. Evaluate the investigation using a transparent rubric.
6. Generate revision material for the exact concepts the learner missed.

### Best general learning idea: Teach-Back Mode

Reading and watching can create false confidence. Asking the learner to explain a topic gives the application better evidence of understanding and creates a natural bridge between lessons, quizzes, and revision.

---

## 6. Non-Negotiable Engineering Rules

1. Never overwrite original source material during extraction, generation, or regeneration.
2. Never expose AI, storage, or session secrets in frontend code.
3. Check authentication and ownership on every protected resource and asset.
4. Validate AI output before saving or rendering it.
5. Never execute generated JavaScript or render arbitrary generated HTML.
6. Keep text, image, speech, and export providers behind backend adapters.
7. Make jobs idempotent and preserve successful work during retries.
8. Cite source chunks and label supplementary or uncertain explanations.
9. Derive lessons, diagrams, quizzes, narration, and exports from shared structured data.
10. Measure learning progress from actual activity, not fabricated metrics.
11. Track AI usage and cost before allowing heavy media generation.
12. Add subjects through data and configuration, never through new subject-specific applications.

---

## 7. Final Execution Order

Use this order as the main development checklist:

```text
MVP scenario
→ project and infrastructure
→ shared schemas and database
→ authentication and ownership
→ dynamic subjects and projects
→ paste-text importer
→ background jobs
→ AI analysis preview
→ grounded editable lessons
→ diagrams
→ quizzes and progress
→ document uploads and export polish
→ animated presentation
→ narration and generated images
→ revision intelligence and Ask My Notes
→ security/quality hardening
→ deployment and real-user pilot
```

The key milestone is not the number of screens or AI features. It is a dependable learning loop in which **one source becomes an accurate, editable, source-grounded lesson that helps the learner practice and revise**.
