import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, newAgent, SAMPLE_TEXT, signUp } from './helpers.js';

describe('health', () => {
  it('reports status', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('auth', () => {
  it('registers, reads the session, logs out and logs back in', async () => {
    const { agent, csrf } = await signUp('ada@example.com');
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.email).toBe('ada@example.com');
    expect(me.body.user.passwordHash).toBeUndefined();

    await agent.post('/api/v1/auth/logout').set('x-csrf-token', csrf).expect(204);
    await agent.get('/api/v1/auth/me').expect(401);

    await agent.post('/api/v1/auth/login').set('x-csrf-token', csrf).send({ email: 'ada@example.com', password: 'wrong password' }).expect(401);
    await agent.post('/api/v1/auth/login').set('x-csrf-token', csrf).send({ email: 'ADA@example.com', password: 'correct horse battery' }).expect(200);
    await agent.get('/api/v1/auth/me').expect(200);
  });

  it('sets an HTTP-only session cookie', async () => {
    const { agent, csrf } = await newAgent();
    const res = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: 'cookie@example.com', password: 'correct horse battery', displayName: 'C' });
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('cl_session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const { agent } = await newAgent();
    const res = await agent.post('/api/v1/auth/register').send({ email: 'x@example.com', password: 'correct horse battery', displayName: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await signUp('dup@example.com');
    const { agent, csrf } = await newAgent();
    await agent.post('/api/v1/auth/register').set('x-csrf-token', csrf).send({ email: 'dup@example.com', password: 'correct horse battery', displayName: 'D' }).expect(409);
    const weak = await agent.post('/api/v1/auth/register').set('x-csrf-token', csrf).send({ email: 'new@example.com', password: 'short', displayName: 'D' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('BAD_REQUEST');
  });

  it('resets a password and invalidates old sessions', async () => {
    const first = await signUp('reset@example.com');
    const { agent, csrf } = await newAgent();
    const forgot = await agent.post('/api/v1/auth/forgot-password').set('x-csrf-token', csrf).send({ email: 'reset@example.com' }).expect(200);
    const token = new URL(forgot.body.devResetUrl).searchParams.get('token');
    await agent.post('/api/v1/auth/reset-password').set('x-csrf-token', csrf).send({ token, password: 'a brand new password' }).expect(200);
    await first.agent.get('/api/v1/auth/me').expect(401);
    await agent.post('/api/v1/auth/reset-password').set('x-csrf-token', csrf).send({ token, password: 'another new password' }).expect(400);
  });

  it('creates default subjects for new users', async () => {
    const { agent } = await signUp();
    const res = await agent.get('/api/v1/subjects').expect(200);
    expect(res.body.subjects.map((s: { name: string }) => s.name)).toContain('SOC & Blue Team');
  });
});

describe('subjects and learning paths', () => {
  it('creates a custom subject and a learning path', async () => {
    const { agent, csrf } = await signUp();
    const subject = await agent.post('/api/v1/subjects').set('x-csrf-token', csrf).send({ name: 'Digital Forensics' }).expect(201);
    await agent.post('/api/v1/subjects').set('x-csrf-token', csrf).send({ name: 'digital forensics' }).expect(409);
    const project = await agent.post('/api/v1/projects').set('x-csrf-token', csrf).send({ title: 'Memory analysis', subjectId: subject.body.subject._id }).expect(201);
    const path = await agent
      .post('/api/v1/learning-paths')
      .set('x-csrf-token', csrf)
      .send({ subjectId: subject.body.subject._id, title: 'DFIR basics', modules: [{ title: 'Week 1', projectIds: [project.body.project._id] }] })
      .expect(201);
    expect(path.body.learningPath.modules[0].projectIds).toHaveLength(1);
    const list = await agent.get('/api/v1/subjects').expect(200);
    const forensics = list.body.subjects.find((s: { name: string }) => s.name === 'Digital Forensics');
    expect(forensics.projectCount).toBe(1);
  });
});

describe('projects and sources (Phase 1 acceptance)', () => {
  it('creates an account, pastes material, saves a project and reopens it', async () => {
    const { agent, csrf } = await signUp();
    const created = await agent
      .post('/api/v1/projects')
      .set('x-csrf-token', csrf)
      .send({ title: 'SIEM Architecture', tags: ['soc', 'siem'] })
      .expect(201);
    const id = created.body.project._id;
    expect(created.body.project.status.content).toBe('empty');

    const source = await agent.post(`/api/v1/projects/${id}/sources/text`).set('x-csrf-token', csrf).send({ title: 'SIEM notes', text: SAMPLE_TEXT }).expect(201);
    expect(source.body.source.extractionStatus).toBe('completed');
    expect(source.body.source.chunkCount).toBeGreaterThan(0);
    expect(source.body.source.metadata.headings).toContain('Log Collection');

    const again = await agent.post(`/api/v1/projects/${id}/sources/text`).set('x-csrf-token', csrf).send({ title: 'Same notes', text: SAMPLE_TEXT }).expect(200);
    expect(again.body.duplicate).toBe(true);

    const reopened = await agent.get(`/api/v1/projects/${id}`).expect(200);
    expect(reopened.body.project.title).toBe('SIEM Architecture');
    expect(reopened.body.project.status.content).toBe('source_added');
    expect(reopened.body.sources).toHaveLength(1);

    const detail = await agent.get(`/api/v1/sources/${source.body.source._id}`).expect(200);
    expect(detail.body.chunks.map((c: { text: string }) => c.text).join(' ')).toContain('brute-force');
  });

  it('lists, searches, favorites, duplicates and deletes projects', async () => {
    const { agent, csrf } = await signUp();
    const a = await agent.post('/api/v1/projects').set('x-csrf-token', csrf).send({ title: 'Windows event logs', tags: ['soc'] });
    await agent.post('/api/v1/projects').set('x-csrf-token', csrf).send({ title: 'Burp Suite basics', tags: ['pentest'] });
    await agent.post(`/api/v1/projects/${a.body.project._id}/sources/text`).set('x-csrf-token', csrf).send({ title: 'n', text: SAMPLE_TEXT });

    const search = await agent.get('/api/v1/projects?q=windows').expect(200);
    expect(search.body.projects).toHaveLength(1);
    const byTag = await agent.get('/api/v1/projects?tag=pentest').expect(200);
    expect(byTag.body.projects[0].title).toBe('Burp Suite basics');

    await agent.patch(`/api/v1/projects/${a.body.project._id}`).set('x-csrf-token', csrf).send({ favorite: true, title: 'Windows Security Logs' }).expect(200);
    const favs = await agent.get('/api/v1/projects?favorite=true').expect(200);
    expect(favs.body.projects[0].title).toBe('Windows Security Logs');

    const copy = await agent.post(`/api/v1/projects/${a.body.project._id}/duplicate`).set('x-csrf-token', csrf).expect(201);
    const copySources = await agent.get(`/api/v1/projects/${copy.body.project._id}/sources`).expect(200);
    expect(copySources.body.sources).toHaveLength(1);

    await agent.delete(`/api/v1/projects/${a.body.project._id}`).set('x-csrf-token', csrf).expect(204);
    await agent.get(`/api/v1/projects/${a.body.project._id}`).expect(404);
    const all = await agent.get('/api/v1/projects').expect(200);
    expect(all.body.total).toBe(2);

    const activity = await agent.get(`/api/v1/projects/${copy.body.project._id}/activity`).expect(200);
    expect(activity.body.activity.length).toBeGreaterThan(0);
  });

  it("never exposes another user's project", async () => {
    const owner = await signUp();
    const intruder = await signUp();
    const project = await owner.agent.post('/api/v1/projects').set('x-csrf-token', owner.csrf).send({ title: 'Private notes' });
    const id = project.body.project._id;
    await intruder.agent.get(`/api/v1/projects/${id}`).expect(404);
    await intruder.agent.patch(`/api/v1/projects/${id}`).set('x-csrf-token', intruder.csrf).send({ title: 'pwned' }).expect(404);
    await intruder.agent.delete(`/api/v1/projects/${id}`).set('x-csrf-token', intruder.csrf).expect(404);
    await intruder.agent.post(`/api/v1/projects/${id}/sources/text`).set('x-csrf-token', intruder.csrf).send({ title: 't', text: SAMPLE_TEXT }).expect(404);
    const list = await intruder.agent.get('/api/v1/projects').expect(200);
    expect(list.body.total).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/v1/projects').expect(401);
  });
});
