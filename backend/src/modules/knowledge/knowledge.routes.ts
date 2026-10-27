import { Router } from 'express';
import type { ConceptRelationship, KeyTerm, LessonSection } from '@cyberlearn/shared';
import { Lesson, Project, Subject } from '../../models/index.js';
import { userId } from '../../utils/http.js';

export const knowledgeRouter = Router();

/** Normalised concept key so "SIEM", "siem" and "SIEMs" meet across lessons. */
const keyOf = (label: string) =>
  label
    .replace(/\s*\(.*\)$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/s$/, '')
    .trim();

/**
 * Knowledge graph (Roman Urdu section 2, "08 — Knowledge Graph"): concepts from
 * every lesson, merged across lessons and subjects, connected by the
 * relationships the analyzer found in the material.
 */
knowledgeRouter.get('/knowledge-graph', async (req, res) => {
  const ownerId = userId(req);
  const subjectFilter = typeof req.query.subjectId === 'string' && /^[a-f\d]{24}$/i.test(req.query.subjectId) ? req.query.subjectId : null;
  const projectFilter = subjectFilter ? { ownerId, subjectId: subjectFilter } : { ownerId };
  const projects = await Project.find(projectFilter).select('_id subjectId').lean();
  const subjects = await Subject.find({ ownerId }).select('name color').lean();
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const subjectOfProject = new Map(projects.map((p) => [String(p._id), p.subjectId ? subjectById.get(String(p.subjectId)) : undefined]));
  const lessons = await Lesson.find({ ownerId, projectId: { $in: projects.map((p) => p._id) } })
    .select('title subject projectId keyTerms conceptLinks sections.id sections.title sections.keyConcepts sections.definition sections.explanation')
    .lean();

  const nodes = new Map<string, { id: string; label: string; definition: string; lessons: Map<string, { lessonId: string; title: string; sectionId: string; subject: string; color: string }> }>();
  const edges = new Map<string, { id: string; source: string; target: string; label: string; kind: 'stated' | 'related'; lessonIds: Set<string> }>();

  const touch = (label: string, lesson: (typeof lessons)[number], sectionId = '', definition = '') => {
    const key = keyOf(label);
    if (!key || key.length < 2) return null;
    const node = nodes.get(key) ?? { id: key.replace(/ /g, '-'), label: label.replace(/\s*\(.*\)$/, ''), definition: '', lessons: new Map() };
    if (!node.definition && definition) node.definition = definition;
    const subject = subjectOfProject.get(String(lesson.projectId));
    if (!node.lessons.has(String(lesson._id)) || (sectionId && !node.lessons.get(String(lesson._id))!.sectionId)) {
      node.lessons.set(String(lesson._id), { lessonId: String(lesson._id), title: lesson.title, sectionId, subject: subject?.name ?? lesson.subject, color: subject?.color ?? '#38BDF8' });
    }
    nodes.set(key, node);
    return node;
  };

  for (const lesson of lessons) {
    for (const term of lesson.keyTerms as KeyTerm[]) touch(term.term, lesson, '', term.definition);
    for (const section of lesson.sections as LessonSection[]) for (const concept of section.keyConcepts ?? []) touch(concept, lesson, section.id);
    for (const rel of lesson.conceptLinks as ConceptRelationship[]) {
      const a = touch(rel.from, lesson);
      const b = touch(rel.to, lesson);
      if (!a || !b || a === b) continue;
      const id = `${a.id}->${b.id}`;
      const edge = edges.get(id) ?? { id, source: a.id, target: b.id, label: rel.label, kind: 'stated' as const, lessonIds: new Set<string>() };
      edge.lessonIds.add(String(lesson._id));
      edges.set(id, edge);
    }
  }

  // Concepts taught in the same section are related (weaker than a relationship stated in the material).
  for (const lesson of lessons) {
    for (const section of lesson.sections as LessonSection[]) {
      const ids = [...new Set((section.keyConcepts ?? []).map((c) => nodes.get(keyOf(c))?.id).filter((x): x is string => Boolean(x)))];
      for (const other of ids.slice(1)) {
        const [a, b] = [ids[0], other];
        if (edges.has(`${a}->${b}`) || edges.has(`${b}->${a}`)) continue;
        edges.set(`${a}->${b}`, { id: `${a}->${b}`, source: a, target: b, label: '', kind: 'related', lessonIds: new Set([String(lesson._id)]) });
      }
    }
  }

  // A concept defined in one lesson and merely mentioned in another still connects them.
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const node of nodes.values()) {
    const label = node.label.trim();
    if (label.length < 3) continue;
    const rx = new RegExp(`\\b${escape(label)}s?\\b`, 'i');
    for (const lesson of lessons) {
      if (node.lessons.has(String(lesson._id))) continue;
      const section = (lesson.sections as LessonSection[]).find((sec) => rx.test(`${sec.definition ?? ''} ${sec.explanation ?? ''}`));
      if (section) touch(label, lesson, section.id);
    }
  }

  const list = [...nodes.values()];
  // Concepts that appear in several lessons are the bridges between subjects.
  res.json({
    nodes: list.map((n) => ({ id: n.id, label: n.label, definition: n.definition, lessons: [...n.lessons.values()], weight: n.lessons.size })),
    edges: [...edges.values()].map((e) => ({ ...e, lessonIds: [...e.lessonIds] })),
    lessonCount: lessons.length,
  });
});
