import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '@cyberlearn/shared';
import jwt from 'jsonwebtoken';
import { app, newAgent, signUp } from './helpers.js';
import request from 'supertest';

describe('security review (Phase 7.6)', () => {
  it('rejects malformed ids with 400 instead of a server error', async () => {
    const s = await signUp();
    await s.agent.get('/api/v1/projects/not-an-id').expect(400);
    const res = await s.agent.post('/api/v1/ask').set('x-csrf-token', s.csrf).send({ question: 'what is siem?', lessonId: 'zzzzzzzzzzzzzzzzzzzzzzzz' });
    expect(res.status).toBe(400);
  });

  it('rejects NoSQL operator injection in credentials', async () => {
    await signUp('victim@example.com');
    const { agent, csrf } = await newAgent();
    const res = await agent.post('/api/v1/auth/login').set('x-csrf-token', csrf).send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('limits upload size', async () => {
    const s = await signUp();
    const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'big' });
    const res = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/upload`).set('x-csrf-token', s.csrf).attach('file', Buffer.alloc(MAX_UPLOAD_BYTES + 10, 'a'), 'big.txt');
    expect(res.status).toBe(413);
  });

  it('rejects requests from foreign origins and forged sessions', async () => {
    const s = await signUp();
    const evil = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).set('Origin', 'https://evil.example').send({ title: 'x' });
    expect(evil.status).toBe(403);
    const forged = jwt.sign({ sub: s.user.id, sv: 0 }, 'not-the-server-secret');
    await request(app).get('/api/v1/auth/me').set('Cookie', `cl_session=${forged}`).expect(401);
  });

  it('sends security headers and never leaks internals in errors', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(bad.body.error.code).toMatch(/BAD_JSON|CSRF_FAILED/);
    expect(JSON.stringify(bad.body)).not.toContain('at ');
  });
});
