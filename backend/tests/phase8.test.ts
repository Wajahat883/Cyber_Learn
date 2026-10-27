import { describe, expect, it } from 'vitest';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { SAMPLE_TEXT, signUp, type Session } from './helpers.js';

const PENTEST = `# Brute Force Attacks

A brute-force attack tries many passwords against a login. Failed logons are recorded by Windows as event ID 4625. A SIEM can correlate these failed logons and raise an alert.

## Defences

Account lockout and MFA reduce the risk of brute force. Rate limiting slows attackers down.`;

async function lesson(s: Session, title: string, text: string, subjectName?: string) {
  const subjects = (await s.agent.get('/api/v1/subjects')).body.subjects;
  const subjectId = subjectName ? subjects.find((x: { name: string }) => x.name === subjectName)._id : undefined;
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title, subjectId });
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title, text });
  await s.agent.post(`/api/v1/projects/${p.body.project._id}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [src.body.source._id], autoContinue: true }).expect(202);
  await drainInlineJobs();
}

describe('universal workspace extras (Phase 8)', () => {
  it('links concepts across lessons and subjects in the knowledge graph', async () => {
    const s = await signUp();
    await lesson(s, 'SIEM', SAMPLE_TEXT, 'SOC & Blue Team');
    await lesson(s, 'Brute force', PENTEST, 'Penetration Testing');
    const graph = (await s.agent.get('/api/v1/knowledge-graph').expect(200)).body;
    expect(graph.lessonCount).toBe(2);
    const siem = graph.nodes.find((n: { id: string }) => n.id === 'siem');
    expect(siem.lessons.map((l: { subject: string }) => l.subject).sort()).toEqual(['Penetration Testing', 'SOC & Blue Team']);
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const e of graph.edges) {
      expect(graph.nodes.some((n: { id: string }) => n.id === e.source)).toBe(true);
      expect(graph.nodes.some((n: { id: string }) => n.id === e.target)).toBe(true);
    }
    const subjects = (await s.agent.get('/api/v1/subjects')).body.subjects;
    const soc = subjects.find((x: { name: string }) => x.name === 'SOC & Blue Team');
    const filtered = (await s.agent.get(`/api/v1/knowledge-graph?subjectId=${soc._id}`)).body;
    expect(filtered.lessonCount).toBe(1);
  });

  it('answers library-wide questions with citations across projects', async () => {
    const s = await signUp();
    await lesson(s, 'SIEM', SAMPLE_TEXT);
    await lesson(s, 'Brute force', PENTEST);
    const res = await s.agent.post('/api/v1/ask').set('x-csrf-token', s.csrf).send({ question: 'Where did I read about account lockout and MFA?' }).expect(200);
    expect(res.body.supported).toBe(true);
    expect(res.body.citations[0].lessonTitle).toBeTruthy();
    expect(res.body.answer).toMatch(/lockout/i);
  });
});
