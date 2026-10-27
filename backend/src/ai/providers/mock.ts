import type {
  ContentAnalysis,
  ConceptRelationship,
  GeneratedAssessment,
  GeneratedDiagram,
  GeneratedSection,
  KeyTerm,
  NodeKind,
  PlannedVisual,
  Question,
  VisualType,
} from '@cyberlearn/shared';
import type { AnalyzeContext, ChunkInput } from '../contentAnalyzer.js';
import type { SectionContext } from '../lessonGenerator.js';
import type { AssessmentContext } from '../assessmentGenerator.js';
import type { DiagramContext } from '../visualPlanner.js';
import type { NarrationContext } from '../narrationGenerator.js';
import type { AnswerContext } from '../askNotes.js';
import { sentences, splitByHeadings } from '../../services/text.js';
import type { StructuredRequest, StructuredResult, TextGenerationProvider } from '../types.js';

/**
 * Offline provider. It never invents facts: every sentence it outputs is taken
 * from the learner's own material, organised with simple heuristics. It lets the
 * whole pipeline run (and be tested) without an API key; quality improves with a
 * real model.
 */
export class MockTextProvider implements TextGenerationProvider {
  readonly name = 'mock';
  readonly model = 'heuristic-v1';

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const ctx = request.context;
    let out: unknown;
    switch (request.task) {
      case 'analyze':
        out = mockAnalyze(ctx as AnalyzeContext);
        break;
      case 'section':
        out = mockSection(ctx as SectionContext);
        break;
      case 'assessment':
        out = mockAssessment(ctx as AssessmentContext);
        break;
      case 'diagram':
        out = mockDiagram(ctx as DiagramContext);
        break;
      case 'narration':
        out = mockNarration(ctx as NarrationContext);
        break;
      case 'answer':
        out = mockAnswer(ctx as AnswerContext);
        break;
      case 'examples':
        out = mockExamples(ctx as { chunks: ChunkInput[]; section: { title: string; howItWorks: string } });
        break;
    }
    const data = request.schema.parse(out);
    return { data, usage: { calls: 1, inputChars: request.content.length, outputChars: JSON.stringify(out).length } };
  }
}

// ---------------------------------------------------------------- helpers

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
const stripFences = (s: string) => s.replace(/```[\s\S]*?```/g, ' ');
const plainSentences = (s: string) =>
  sentences(stripFences(s).replace(/^#+\s.*$/gm, '').replace(/^\s*[-*]\s+/gm, ''))
    .map((x) => x.replace(/\*\*|__|`/g, ''))
    .filter((x) => x.split(' ').length >= 4);
const pick = (list: string[], rx: RegExp, max: number, exclude = new Set<string>()) => list.filter((s) => rx.test(s) && !exclude.has(s)).slice(0, max);
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (text: string, term: string) => new RegExp(`\\b${escapeRx(term)}\\b`, 'i').test(text);

const SUBJECTS: [string, RegExp][] = [
  ['Cybersecurity', /\b(siem|soc|malware|phishing|attack|threat|vulnerab|exploit|incident|firewall|ids|ips|edr|forensic|brute[- ]force|logon|privilege|ransomware|owasp|pentest|burp|cve|detection)\b/gi],
  ['Cloud Computing', /\b(aws|azure|gcp|cloud|s3|iam|kubernetes|container|serverless|ec2|vpc)\b/gi],
  ['Networking', /\b(tcp|udp|packet|router|switch|subnet|dns|dhcp|osi|ip address|vlan|bgp|ethernet)\b/gi],
  ['Programming', /\b(function|variable|class|compile|python|javascript|java|loop|array|algorithm|api|typescript)\b/gi],
  ['Mathematics', /\b(theorem|equation|integral|derivative|matrix|probability|proof|algebra)\b/gi],
  ['Artificial Intelligence', /\b(llm|neural|machine learning|model training|prompt|embedding|transformer)\b/gi],
];

function detectSubject(text: string): string {
  let best = ['General Studies', 0] as [string, number];
  for (const [name, rx] of SUBJECTS) {
    const n = text.match(rx)?.length ?? 0;
    if (n > best[1]) best = [name, n];
  }
  return best[0];
}

const STOP = new Set(['The', 'This', 'That', 'These', 'Those', 'When', 'For', 'If', 'In', 'It', 'A', 'An', 'Many', 'Each', 'Some', 'After', 'Before', 'Then', 'However', 'Example', 'For example', 'Agents', 'Note']);

function extractKeyTerms(text: string): KeyTerm[] {
  const plain = stripFences(text);
  const sents = plainSentences(plain);
  const terms = new Map<string, string>();
  const definitionFor = (term: string) => sents.find((s) => contains(s, term) && /\b(is|are|refers to|means|converts|collects)\b/.test(s)) ?? sents.find((s) => contains(s, term)) ?? '';

  for (const m of plain.matchAll(/\b([A-Z][A-Za-z-]+(?:\s+(?:and\s+|of\s+)?[A-Z][A-Za-z-]+){1,5})\s*\(([A-Z][A-Za-z]{1,7})\)/g)) {
    terms.set(m[2], `${m[2]} (${m[1]})`);
  }
  for (const s of sents) {
    const m = s.match(/^(?:The |A |An )?([A-Za-z][A-Za-z0-9 -]{2,40}?)\s+(?:is|are|refers to|means)\s+(?:a|an|the|used|when|how|what)\b/);
    if (m && !STOP.has(m[1]) && m[1].split(' ').length <= 4) terms.set(m[1].trim(), m[1].trim());
  }
  const counts = new Map<string, number>();
  for (const m of plain.matchAll(/\b([A-Z]{2,6}s?)\b/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const NOT_TERMS = new Set(['ID', 'IDs', 'OK', 'AM', 'PM', 'TODO', 'NOTE']);
  for (const [acr, n] of counts) if (n >= 2 && !NOT_TERMS.has(acr) && !terms.has(acr) && !terms.has(acr.replace(/s$/, ''))) terms.set(acr, acr);
  for (const m of plain.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
    const phrase = m[1];
    if (!STOP.has(phrase.split(' ')[0]) && (plain.match(new RegExp(`\\b${escapeRx(phrase)}\\b`, 'g'))?.length ?? 0) >= 2) terms.set(phrase, phrase);
  }
  // Lower-case technical noun phrases that are defined in the text ("normalization converts ...").
  for (const s of sents) {
    const m = s.match(/^([A-Z][a-z]+(?:\s[a-z]+)?)\s+(?:converts|collects|correlates|forwards|raises|stores|detects)\b/);
    if (m && !STOP.has(m[1])) terms.set(m[1], m[1]);
  }

  return [...terms.entries()].slice(0, 20).map(([key, label]) => ({ term: label, definition: clip(definitionFor(key), 600) }));
}

/** Short searchable form of a term ("SIEM (Security Information ...)" -> "SIEM"). */
const termKey = (term: string) => term.replace(/\s*\(.*\)$/, '');

function chooseVisual(text: string): VisualType {
  const t = text.toLowerCase();
  if (/```|^\s*\$ |powershell|command|query/m.test(t)) return 'code-walkthrough';
  if (/\b(vs\.?|versus|compared|difference between|unlike)\b/.test(t)) return 'comparison';
  if (/\b(timeline|\d{2}:\d{2}|then .* later|chronolog)\b/.test(t)) return 'timeline';
  if (/\b(decide|whether|if .* then|escalat|triage)\b/.test(t)) return 'decision-flow';
  if (/\b(forward|send|flow|pipeline|collect|ingest|stream|traffic|route)\b/.test(t)) return 'data-flow';
  if (/\b(step|first|then|process|procedure|stage)\b/.test(t)) return 'flowchart';
  if (/\b(component|architecture|layer|server|service|infrastructure)\b/.test(t)) return 'architecture';
  return 'concept-map';
}

interface Block {
  heading: string;
  text: string;
  chunkIndex: number;
}

function blocksFromChunks(chunks: ChunkInput[]): Block[] {
  const blocks: Block[] = [];
  for (const c of chunks) {
    const parts = splitByHeadings(c.text);
    for (const p of parts) {
      const heading = p.heading || (blocks.length ? blocks[blocks.length - 1].heading : c.heading);
      const last = blocks[blocks.length - 1];
      if (last && last.heading === heading && !p.heading) last.text += `\n\n${p.text}`;
      else blocks.push({ heading, text: p.text, chunkIndex: c.index });
    }
  }
  return blocks;
}

// ---------------------------------------------------------------- analyze

function mockAnalyze(ctx: AnalyzeContext): ContentAnalysis {
  const all = ctx.chunks.map((c) => c.text).join('\n\n');
  const blocks = blocksFromChunks(ctx.chunks);
  const docTitle = splitByHeadings(ctx.chunks[0]?.text ?? '').find((b) => b.level === 1)?.heading;
  const title = clip(docTitle || ctx.projectTitle, 200);
  const keyTerms = extractKeyTerms(all);

  // Merge consecutive blocks with the same heading, drop empty ones.
  const grouped: Block[] = [];
  for (const b of blocks) {
    if (!b.text.trim()) continue;
    const last = grouped[grouped.length - 1];
    if (last && last.heading === b.heading) last.text += `\n\n${b.text}`;
    else grouped.push({ ...b });
  }
  let sectionBlocks = grouped.map((b, i) => ({ ...b, heading: b.heading && b.heading !== title ? b.heading : i === 0 ? 'Overview' : `Part ${i + 1}` }));
  if (!sectionBlocks.length) sectionBlocks = [{ heading: 'Overview', text: all, chunkIndex: 0 }];
  // Very long single blocks become several parts so each section stays focused.
  sectionBlocks = sectionBlocks.slice(0, 12);

  const used = new Set<string>();
  const sections = sectionBlocks.map((b) => {
    let id = kebab(b.heading);
    while (used.has(id)) id = `${id}-2`;
    used.add(id);
    const concepts = keyTerms.filter((k) => contains(b.text, termKey(k.term))).map((k) => termKey(k.term));
    const chunkIndexes = ctx.chunks.filter((c) => c.text.includes(b.text.slice(0, 60)) || c.heading === b.heading).map((c) => c.index);
    return { id, title: clip(b.heading, 200), concepts: [...new Set(concepts)].slice(0, 12), sourceChunks: chunkIndexes.length ? chunkIndexes : [b.chunkIndex], include: true, text: b.text };
  });

  const relationships: ConceptRelationship[] = [];
  const keys = keyTerms.map((k) => termKey(k.term));
  for (const s of plainSentences(all)) {
    const present = keys
      .map((k) => ({ k, i: s.search(new RegExp(`\\b${escapeRx(k)}\\b`, 'i')) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i);
    for (let i = 0; i + 1 < present.length && relationships.length < 40; i++) {
      const between = s.slice(present[i].i + present[i].k.length, present[i + 1].i).trim().split(/\s+/).filter(Boolean);
      if (between.length === 0 || between.length > 5) continue;
      const label = between.join(' ').replace(/[,;:]/g, '').trim() || 'relates to';
      if (!relationships.some((r) => r.from === present[i].k && r.to === present[i + 1].k)) relationships.push({ from: present[i].k, to: present[i + 1].k, label: clip(label, 120) });
    }
  }

  const visuals: PlannedVisual[] = sections.map((s, i) => ({ id: `v${i + 1}`, type: chooseVisual(`${s.title}\n${s.text}`), purpose: clip(`Explain ${s.title} visually`, 300), sectionId: s.id }));
  if (ctx.preferences.visualMode !== 'diagrams' && sections[0]) {
    visuals.push({ id: `v${visuals.length + 1}`, type: 'conceptual-image', purpose: `Conceptual overview of ${title}`, sectionId: sections[0].id });
  }

  const warnings: string[] = [];
  if (all.length < 600) warnings.push('The source material is short, so the lesson will be brief. Add more notes for a deeper lesson.');
  if (sections.length === 1) warnings.push('No clear headings were found, so the material is treated as a single section.');
  warnings.push('Generated offline with the heuristic provider: explanations reuse your own sentences. Configure an AI provider for richer lessons.');

  return {
    title,
    subject: detectSubject(all),
    mainTopic: title,
    difficulty: ctx.preferences.difficulty,
    summary: clip(plainSentences(all).slice(0, 2).join(' '), 2000),
    learningObjectives: sections.slice(0, 8).map((s) => clip(`Explain ${s.title}`, 300)),
    sections: sections.map(({ text: _t, ...s }) => s),
    keyTerms,
    prerequisites: [],
    relationships,
    visuals,
    suggestedSlideCount: Math.min(80, 2 + sections.length * 2),
    warnings,
  };
}

// ---------------------------------------------------------------- section

function sectionText(ctx: SectionContext): string {
  const blocks = blocksFromChunks(ctx.chunks);
  const match = blocks.filter((b) => b.heading.toLowerCase() === ctx.section.title.toLowerCase());
  if (match.length) return match.map((b) => b.text).join('\n\n');
  if (ctx.section.title === 'Overview' && blocks[0]) return blocks[0].text;
  return ctx.chunks.map((c) => c.text).join('\n\n');
}

function mockSection(ctx: SectionContext): GeneratedSection {
  const text = sectionText(ctx);
  const sents = plainSentences(text);
  const usedSet = new Set<string>();
  const take = (list: string[]) => {
    list.forEach((s) => usedSet.add(s));
    return list;
  };
  const definition = sents.find((s) => /\b(is|are|refers to|means)\b/.test(s)) ?? sents[0] ?? '';
  const how = take(pick(sents, /\b(forward|send|collect|convert|correlat|match|raise|trigger|first|then|after|process|pars|stor|use|uses|review|decide)/i, 6, new Set([definition])));
  const why = take(pick(sents, /\b(important|helps?|allows?|enables?|critical|so that|because|ensures?|may indicate)\b/i, 3));
  const example = take(pick(sents, /\b(example|e\.g\.|for instance|such as)\b/i, 3));
  const mistakes = pick(sents, /\b(must|should not|never|avoid|mistake|do not|don't|before concluding|careful)\b/i, 5);
  const warnings = pick(sents, /\b(warning|caution|risk|sensitive|danger)\b/i, 3);
  const practical = pick(sents, /\b(analyst|investigat|configure|run|monitor|triage|escalat)/i, 3, usedSet);
  const code = [...text.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map((m) => ({ language: m[1] || 'text', code: m[2].trim(), caption: '' })).filter((c) => c.code);
  const explanation = stripFences(text)
    .replace(/^#+\s.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    definition: clip(definition, 2000),
    explanation: clip(explanation, 12000),
    whyItMatters: clip(why.join(' '), 3000),
    howItWorks: clip(how.map((s) => `- ${s}`).join('\n'), 6000),
    example: clip(example.join(' '), 6000),
    commonMistakes: mistakes.map((m) => clip(m, 600)),
    practicalApplication: clip(practical.join(' '), 4000),
    summary: clip(sents.length > 1 ? `${sents[0]} ${sents[sents.length - 1]}` : sents[0] ?? '', 2000),
    prerequisites: [],
    keyConcepts: ctx.section.concepts.slice(0, 20),
    warnings: warnings.map((w) => clip(w, 600)),
    codeSnippets: code.slice(0, 10),
    supplementaryNotes: [],
    grounding: 'source',
    sourceChunks: ctx.chunks.map((c) => c.index),
  };
}

// ---------------------------------------------------------------- assessment

function mockAssessment(ctx: AssessmentContext): GeneratedAssessment {
  const sectionOf = (term: string) => ctx.sections.find((s) => contains(`${s.definition} ${s.explanation}`, term))?.id ?? '';
  const terms = ctx.keyTerms.filter((k) => k.definition);
  const flashcards: GeneratedAssessment['flashcards'] = [];
  for (const k of terms) {
    const key = termKey(k.term);
    flashcards.push({ front: clip(`What is ${k.term}?`, 500), back: clip(k.definition, 1500), explanation: '', conceptId: key, sectionId: sectionOf(key), difficulty: ctx.preferences.difficulty });
  }
  for (const s of ctx.sections) {
    if (s.definition) flashcards.push({ front: clip(`Explain: ${s.title}`, 500), back: clip(s.definition, 1500), explanation: clip(s.summary, 2000), conceptId: s.title, sectionId: s.id, difficulty: ctx.preferences.difficulty });
  }

  const questions: Question[] = [];
  const keys = terms.map((k) => termKey(k.term));
  terms.forEach((k, i) => {
    const key = keys[i];
    const masked = k.definition.replace(new RegExp(`\\b${escapeRx(key)}\\b`, 'gi'), '____');
    if (masked === k.definition) return;
    const others = keys.filter((x) => x.toLowerCase() !== key.toLowerCase());
    if (others.length < 1) return;
    const distractors = [...new Set(others)].slice(i % Math.max(1, others.length - 2), (i % Math.max(1, others.length - 2)) + 3);
    const options = [...distractors.slice(0, 3)];
    const correct = i % (options.length + 1);
    options.splice(correct, 0, key);
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return;
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'mcq',
      prompt: clip(`Which term completes this statement from the lesson?\n\n"${masked}"`, 2000),
      context: '',
      options,
      correctOptionIndex: correct,
      answer: '',
      explanation: clip(`The lesson states: "${k.definition}"`, 3000),
      difficulty: ctx.preferences.difficulty,
      relatedConcept: key,
      sectionId: sectionOf(key),
      rubric: [],
    });
  });

  // True/false: alternate true statements with term-swapped false ones.
  let flip = false;
  for (const s of ctx.sections) {
    const sentence = plainSentences(s.explanation).find((x) => keys.some((k) => contains(x, k)));
    if (!sentence) continue;
    const key = keys.find((k) => contains(sentence, k))!;
    const other = keys.find((k) => k.toLowerCase() !== key.toLowerCase() && !contains(sentence, k));
    const makeFalse = flip && Boolean(other);
    const statement = makeFalse ? sentence.replace(new RegExp(`\\b${escapeRx(key)}\\b`), other!) : sentence;
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'true-false',
      prompt: clip(`True or false: "${statement}"`, 2000),
      context: '',
      options: ['True', 'False'],
      correctOptionIndex: makeFalse ? 1 : 0,
      answer: '',
      explanation: clip(`The lesson says: "${sentence}"`, 3000),
      difficulty: ctx.preferences.difficulty,
      relatedConcept: key,
      sectionId: s.id,
      rubric: [],
    });
    flip = !flip;
  }

  for (const s of ctx.sections) {
    if (!s.definition) continue;
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'short-answer',
      prompt: clip(`In your own words, explain ${s.title}.`, 2000),
      context: '',
      options: [],
      answer: clip([s.definition, ...plainSentences(s.howItWorks.replace(/^- /gm, '')).slice(0, 2)].join(' '), 3000),
      explanation: clip(s.summary || s.definition, 3000),
      difficulty: ctx.preferences.difficulty,
      relatedConcept: s.keyConcepts[0] ?? s.title,
      sectionId: s.id,
      rubric: s.keyConcepts.slice(0, 5),
    });
  }

  // Scenario question when the material is about alerts, logs or investigations.
  const all = ctx.sections.map((s) => s.explanation).join(' ');
  const evidence = plainSentences(all).filter((s) => /\b(event id|\d{4}\b|alert|failed logon|log)/i.test(s));
  const procedure = plainSentences(all).filter((s) => /\b(analyst|evidence|escalat|triage|investigat|before concluding)\b/i.test(s));
  if (evidence.length && procedure.length) {
    const target = ctx.sections.find((s) => procedure.some((p) => s.explanation.includes(p.slice(0, 40))));
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'scenario',
      prompt: 'You are the SOC analyst on shift and the situation below appears. What do you do next, and what evidence would you still need before concluding what happened?',
      context: clip(evidence.slice(0, 3).join('\n'), 6000),
      options: [],
      answer: clip(procedure.slice(0, 3).join(' '), 3000),
      explanation: 'Separate what the evidence confirms from what it only suggests, and follow the investigation steps described in the lesson.',
      difficulty: ctx.preferences.difficulty,
      relatedConcept: target?.keyConcepts[0] ?? 'Investigation',
      sectionId: target?.id ?? '',
      rubric: ['Identifies the relevant evidence', 'Does not jump to a conclusion', 'Names the next investigation step'],
    });
  }

  return { flashcards: flashcards.slice(0, 60), questions: questions.slice(0, 40) };
}

// ---------------------------------------------------------------- diagram

function mockDiagram(ctx: DiagramContext): GeneratedDiagram {
  const text = [ctx.section.definition, ctx.section.explanation, ctx.section.howItWorks].join('\n');
  const candidates = [...ctx.section.keyConcepts, ...ctx.keyTerms.map((k) => termKey(k.term))]
    .map((label) => ({ label, at: text.search(new RegExp(`\\b${escapeRx(label)}\\b`, 'i')) }))
    .filter((c) => c.at >= 0)
    .sort((a, b) => a.at - b.at);
  let labels = [...new Map(candidates.map((c) => [c.label.toLowerCase(), c.label])).values()].slice(0, 8);
  if (labels.length < 2) {
    const phrases = [...text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)].map((m) => m[1]).filter((p) => !STOP.has(p));
    labels = [...new Set([...labels, ...phrases])].slice(0, 6);
  }
  if (!labels.length) labels = [ctx.section.title];

  const sents = plainSentences(text);
  const flow = ['data-flow', 'architecture', 'flowchart', 'sequence', 'decision-flow'].includes(ctx.visual.type);
  const kindFor = (i: number, n: number): NodeKind => {
    if (!flow) return 'concept';
    if (ctx.visual.type === 'decision-flow' && i > 0 && i < n - 1) return 'decision';
    if (i === 0) return 'source';
    if (i === n - 1) return ctx.visual.type === 'data-flow' || ctx.visual.type === 'architecture' ? 'destination' : 'event';
    return 'processor';
  };
  const nodes = labels.map((label, i) => ({
    id: kebab(label),
    label: clip(label, 80),
    kind: kindFor(i, labels.length),
    description: clip(sents.find((s) => contains(s, label)) ?? '', 600),
  }));
  const edgeLabel = (a: string, b: string) => {
    for (const s of sents) {
      const ia = s.search(new RegExp(`\\b${escapeRx(a)}\\b`, 'i'));
      const ib = s.search(new RegExp(`\\b${escapeRx(b)}\\b`, 'i'));
      if (ia >= 0 && ib > ia) {
        const between = s.slice(ia + a.length, ib).trim().split(/\s+/).filter(Boolean);
        if (between.length && between.length <= 4) return clip(between.join(' ').replace(/[,;:]/g, ''), 80);
      }
    }
    return '';
  };
  const edges =
    flow || nodes.length <= 2
      ? nodes.slice(1).map((n, i) => ({ id: `e${i + 1}`, source: nodes[i].id, target: n.id, label: edgeLabel(nodes[i].label, n.label) }))
      : nodes.slice(1).map((n, i) => ({ id: `e${i + 1}`, source: nodes[0].id, target: n.id, label: edgeLabel(nodes[0].label, n.label) }));
  return {
    title: clip(`${ctx.section.title}`, 200),
    description: clip(ctx.visual.purpose, 1000),
    direction: flow && ctx.visual.type !== 'decision-flow' ? 'LR' : 'TB',
    nodes,
    edges,
    steps: nodes.map((n) => n.id),
  };
}

// ---------------------------------------------------------------- narration

function mockNarration(ctx: NarrationContext) {
  const ur = ctx.preferences.language === 'roman-urdu';
  const w = ur
    ? { welcome: 'Khush aamdeed. Is lesson mein hum samjhenge', look: 'Chaliye dekhte hain', first: 'Pehle', next: 'Phir', last: 'Aakhir mein', diagram: 'Ye diagram dikhata hai', summary: 'Khulasa ye hai ke', compare: 'Ab hum muqabla karte hain', commands: 'Ab commands dekhte hain', picture: 'Ye tasveer overview deti hai' }
    : { welcome: 'Welcome. In this lesson we will explore', look: "Let's look at", first: 'First,', next: 'Next,', last: 'Finally,', diagram: 'This diagram shows', summary: 'To summarize,', compare: "Let's compare", commands: "Now let's walk through the commands", picture: 'This illustration gives a visual overview of' };
  const seq = (items: string[]) =>
    items
      .map((t, i) => {
        const lead = i === 0 ? w.first : i === items.length - 1 ? w.last : w.next;
        return `${lead} ${t.replace(/[.]+$/, '')}.`;
      })
      .join(' ');

  return {
    slides: ctx.slides.map((s) => {
      let text: string;
      const labels = ctx.diagramLabels[s.id] ?? [];
      switch (s.type) {
        case 'title':
          text = `${w.welcome} ${s.title}. ${s.subtitle}`;
          break;
        case 'summary':
          text = `${w.summary} ${s.bullets.map((b) => b.text.replace(/[.]+$/, '')).join('. ')}.`;
          break;
        case 'progressive-diagram':
        case 'data-flow':
        case 'decision-flow':
          text = `${w.diagram} ${s.title}. ${seq(labels.length ? labels : s.bullets.map((b) => b.text))}`;
          break;
        case 'timeline':
          text = `${w.look} ${s.title}. ${seq(s.timeline.map((t) => `${t.time ? `${t.time}: ` : ''}${t.label}`))}`;
          break;
        case 'comparison':
          text = s.comparison ? `${w.compare} ${s.comparison.left.title} and ${s.comparison.right.title}. ${seq([...s.comparison.left.points, ...s.comparison.right.points].map((p) => p.text))}` : s.title;
          break;
        case 'terminal':
          text = `${w.commands} for ${s.title}. ${seq(s.terminal.map((t) => t.command.split('\n')[0]))}`;
          break;
        case 'concept-illustration':
          text = `${w.picture} ${s.title}. ${s.annotations.length ? seq(s.annotations.map((a) => a.label)) : s.subtitle}`;
          break;
        default:
          text = `${w.look} ${s.title}. ${seq(s.bullets.map((b) => b.text))}`;
      }
      return { slideId: s.id, text: clip(text.replace(/\s+/g, ' ').trim() || s.title, 5000) };
    }),
  };
}

// ---------------------------------------------------------------- ask my notes

function mockAnswer(ctx: AnswerContext) {
  const qWords = new Set((ctx.question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((x) => !['what', 'where', 'when', 'which', 'does', 'how', 'the', 'and', 'for', 'why', 'with', 'are', 'did', 'read'].includes(x)));
  const scored = ctx.chunks.flatMap((c) =>
    plainSentences(c.text).map((s) => ({
      s,
      chunk: c.index,
      score: (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((x) => qWords.has(x)).length,
    })),
  );
  const top = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  if (!top.length) {
    return { answer: 'Your notes do not appear to cover this question. Try different keywords or add material about it.', supported: false, citedChunks: [] };
  }
  return {
    answer: `Based on your notes:\n\n${top.map((t) => `- ${t.s}`).join('\n')}`,
    supported: true,
    citedChunks: [...new Set(top.map((t) => t.chunk))],
  };
}

function mockExamples(ctx: { chunks: ChunkInput[]; section: { title: string; howItWorks: string } }) {
  const sents = ctx.chunks.flatMap((c) => plainSentences(c.text));
  const found = pick(sents, /\b(example|e\.g\.|for instance|such as|may indicate)\b/i, 3);
  const examples = found.map((s, i) => ({ title: `Example ${i + 1} from your notes`, body: s, supplementary: false }));
  if (!examples.length) {
    const how = plainSentences(ctx.section.howItWorks.replace(/^- /gm, ''));
    examples.push({ title: `Walkthrough: ${ctx.section.title}`, body: how.length ? how.map((s, i) => `${i + 1}. ${s}`).join('\n') : 'Your notes do not contain a concrete example for this section.', supplementary: false });
  }
  return { examples };
}
