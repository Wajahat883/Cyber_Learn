import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { app, signUp } from './helpers.js';

describe('monitoring', () => {
  it('keeps /metrics hidden unless a token is configured and sent', async () => {
    const before = env.METRICS_TOKEN;
    try {
      env.METRICS_TOKEN = '';
      await request(app).get('/api/v1/metrics').expect(404);
      env.METRICS_TOKEN = 'scrape-secret';
      await request(app).get('/api/v1/metrics').expect(404);
      await request(app).get('/api/v1/metrics').set('authorization', 'Bearer wrong').expect(404);

      const s = await signUp();
      await s.agent.get('/api/v1/projects').expect(200);
      const res = await request(app).get('/api/v1/metrics').set('authorization', 'Bearer scrape-secret').expect(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('cyberlearn_process_uptime_seconds');
      // Routes are reported by pattern, never with ids or raw URLs.
      expect(res.text).toMatch(/cyberlearn_http_requests_total\{method="GET",route="\/api\/v1\/projects",status="2xx"\} \d+/);
      expect(res.text).not.toMatch(/[0-9a-f]{24}/);
    } finally {
      env.METRICS_TOKEN = before;
    }
  });
});
