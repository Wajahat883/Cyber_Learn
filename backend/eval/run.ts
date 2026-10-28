/**
 * AI quality evaluation: runs the real generation steps on fixture notes and
 * scores what matters for learners. Usage:
 *
 *   npm run eval -w backend                       # server AI provider from .env
 *   npm run eval -w backend -- --provider mock    # offline, free (checks the harness itself)
 *   npm run eval -w backend -- --user you@x.com   # the provider saved in that user's Settings
 *   npm run eval -w backend -- --min 0.8          # exit 1 if any score falls below 0.8
 *
 * Results are printed and saved to eval/results/<timestamp>.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiagramSpecSchema, GenerationPreferencesSchema, QuestionSchema, type ContentAnalysis, type LessonSection } from '@cyberlearn/shared';
import { analyzeContent, type ChunkInput } from '../src/ai/contentAnalyzer.js';
import { generateSection, relevantChunks } from '../src/ai/lessonGenerator.js';
import { generateAssessment } from '../src/ai/assessmentGenerator.js';
import { generateDiagram, planVisuals } from '../src/ai/visualPlanner.js';
import { MockTextProvider } from '../src/ai/providers/mock.js';
import { textProvider } from '../src/ai/providers/index.js';
import { chunkText } from '../src/services/text.js';
import type { AiUsage, TextGenerationProvider } from '../src/ai/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function providerFromArgs(): Promise<{ provider: TextGenerationProvider; close?: () => Promise<void> }> {
  if (arg('provider') === 'mock') return { provider: new MockTextProvider() };
  const email = arg('user');
  if (!email) return { provider: textProvider() };
  const { connectDatabase } = await import('../src/config/database.js');
  const { default: mongoose } = await import('mongoose');
  const { User } = await import('../src/models/index.js');
  const { textProviderFor } = await import('../src/ai/providers/userProviders.js');
  await connectDatabase();
  const user = await User.findOne({ email: email.toLowerCase() }).select('_id').lean();
  if (!user) throw new Error(`No user ${email}`);
  return { provider: await textProviderFor(String(user._id)), close: () => mongoose.disconnect() };
}

const norm = (s: string) => s.toLowerCase().replace(/[`*_#>…]/g, '').replace(/\s+/g, ' ').trim();
const ratio = (a: number, b: number) => (b ? a / b : 1);

interface Step {
  name: string;
  ok: boolean;
  firstTry: boolean;
  ms: number;
  error?: string;
}

async function step<T>(steps: Step[], name: string, run: () => Promise<T & { usage: AiUsage }>): Promise<T | null> {
  const start = Date.now();
  try {
    const out = await run();
    steps.push({ name, ok: true, firstTry: out.usage.calls <= 1, ms: Date.now() - start });
    return out;
  } catch (err) {
    steps.push({ name, ok: false, firstTry: false, ms: Date.now() - start, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    return null;
  }
}

function parseFixture(file: string) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = m?.[1] ?? '';
  const title = meta.match(/^title:\s*(.+)$/m)?.[1].trim() ?? path.basename(file, '.md');
  const facts = (meta.match(/^facts:\s*\[(.*)\]$/m)?.[1] ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  return { title, facts, text: m ? raw.slice(m[0].length) : raw };
}

async function evaluate(provider: TextGenerationProvider, file: string) {
  const fixture = parseFixture(file);
  const preferences = GenerationPreferencesSchema.parse({});
  const chunks: ChunkInput[] = chunkText(fixture.text).map((c) => ({ ...c, sourceId: 'fixture' }));
  const source = norm(fixture.text);
  const steps: Step[] = [];

  const analyzed = await step(steps, 'analyze', () => analyzeContent(provider, { chunks, projectTitle: fixture.title, preferences }));
  const analysis = analyzed?.analysis as ContentAnalysis | undefined;
  const sections: LessonSection[] = [];
  for (const planned of analysis?.sections.filter((s) => s.include) ?? []) {
    const out = await step(steps, `section: ${planned.title}`, () => generateSection(provider, { section: planned, chunks: relevantChunks(planned, chunks), analysis: analysis!, preferences }));
    if (out) sections.push(out.section);
  }
  const assessed = sections.length
    ? await step(steps, 'assessment', () => generateAssessment(provider, { title: fixture.title, sections, keyTerms: analysis!.keyTerms, sourceText: fixture.text, preferences }))
    : null;
  const diagrams = [];
  for (const visual of analysis ? planVisuals(analysis, preferences).diagrams : []) {
    const section = sections.find((s) => s.id === visual.sectionId);
    if (!section) continue;
    const planned = analysis!.sections.find((s) => s.id === section.id)!;
    const out = await step(steps, `diagram: ${section.title}`, () => generateDiagram(provider, { visual, section, chunks: relevantChunks(planned, chunks), keyTerms: analysis!.keyTerms }));
    if (out) diagrams.push(out.diagram);
  }

  // ---- scores (0..1)
  const lessonText = norm(sections.map((s) => [s.title, s.definition, s.explanation, s.howItWorks, s.example, s.summary].join(' ')).join(' '));
  const refs = sections.flatMap((s) => s.sourceRefs);
  const verbatim = refs.filter((r) => {
    const e = norm(r.excerpt);
    return e.length >= 12 && (source.includes(e) || source.includes(e.slice(0, 60)));
  });
  const questions = assessed?.assessment.questions ?? [];
  const validQuestions = questions.filter((q) => QuestionSchema.safeParse(q).success);
  const supported = validQuestions.filter((q) => {
    const answer = q.type === 'mcq' || q.type === 'true-false' ? q.options?.[q.correctOptionIndex ?? -1] : q.answer;
    if (!answer) return false;
    if (q.type === 'true-false') return true;
    // The answer's key words should come from the notes, not from outside knowledge.
    const words = norm(answer).match(/[a-z0-9]{4,}/g) ?? [];
    return words.length === 0 || ratio(words.filter((w) => source.includes(w)).length, words.length) >= 0.5;
  });
  const connected = diagrams.filter((d) => DiagramSpecSchema.safeParse(d).success && d.nodes.every((n) => d.edges.some((e) => e.source === n.id || e.target === n.id) || d.nodes.length === 1));

  const scores = {
    structuredFirstTry: ratio(steps.filter((s) => s.firstTry).length, steps.length),
    structuredValid: ratio(steps.filter((s) => s.ok).length, steps.length),
    citationCoverage: ratio(sections.filter((s) => s.sourceRefs.length > 0).length, sections.length),
    citationVerbatim: ratio(verbatim.length, refs.length),
    quizValid: ratio(validQuestions.length, questions.length),
    quizSupported: ratio(supported.length, validQuestions.length),
    diagramValid: ratio(connected.length, diagrams.length),
    factRecall: ratio(fixture.facts.filter((f) => lessonText.includes(norm(f))).length, fixture.facts.length),
  };
  return {
    fixture: path.basename(file),
    counts: { sections: sections.length, questions: questions.length, flashcards: assessed?.assessment.flashcards.length ?? 0, diagrams: diagrams.length, calls: steps.length },
    scores,
    failures: steps.filter((s) => !s.ok),
    missingFacts: fixture.facts.filter((f) => !lessonText.includes(norm(f))),
    seconds: Math.round(steps.reduce((n, s) => n + s.ms, 0) / 100) / 10,
  };
}

const { provider, close } = await providerFromArgs();
const files = readdirSync(path.join(here, 'fixtures'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.join(here, 'fixtures', f));
console.log(`Evaluating ${files.length} fixtures with ${provider.name} ${provider.model || ''}\n`);
const results: Awaited<ReturnType<typeof evaluate>>[] = [];
for (const file of files) {
  const r = await evaluate(provider, file);
  results.push(r);
  console.log(`■ ${r.fixture}  (${r.counts.sections} sections, ${r.counts.questions} questions, ${r.counts.diagrams} diagrams, ${r.seconds}s)`);
  for (const [k, v] of Object.entries(r.scores)) console.log(`   ${k.padEnd(22)} ${(v * 100).toFixed(0).padStart(4)}%`);
  for (const f of r.failures) console.log(`   ✗ ${f.name}: ${f.error}`);
  if (r.missingFacts.length) console.log(`   missing facts: ${r.missingFacts.join(', ')}`);
  console.log();
}
const keys = Object.keys(results[0]?.scores ?? {}) as (keyof (typeof results)[number]['scores'])[];
const overall = Object.fromEntries(keys.map((k) => [k, results.reduce((n, r) => n + r.scores[k], 0) / results.length]));
console.log('Overall:', Object.entries(overall).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · '));

const out = path.join(here, 'results');
mkdirSync(out, { recursive: true });
const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ provider: provider.name, model: provider.model, at: new Date().toISOString(), overall, results }, null, 2));
console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
await close?.();

const min = arg('min') ? Number(arg('min')) : undefined;
if (min !== undefined && Object.values(overall).some((v) => v < min)) {
  console.error(`Below the --min ${min} threshold.`);
  process.exit(1);
}
