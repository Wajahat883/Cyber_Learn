import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../src/app.js';

export const app = createApp();

export interface Session {
  agent: InstanceType<typeof TestAgent>;
  csrf: string;
  user: { id: string; email: string };
}

/** Creates an agent that keeps cookies and knows its CSRF token. */
export async function newAgent() {
  const agent = request.agent(app);
  const res = await agent.get('/api/v1/auth/csrf');
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('cl_csrf='));
  const csrf = cookie!.split(';')[0].split('=')[1];
  return { agent, csrf };
}

let counter = 0;

export async function signUp(email = `learner${++counter}-${Date.now()}@example.com`): Promise<Session> {
  const { agent, csrf } = await newAgent();
  const res = await agent
    .post('/api/v1/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email, password: 'correct horse battery', displayName: 'Learner' })
    .expect(201);
  return { agent, csrf, user: res.body.user };
}

export const SAMPLE_TEXT = `# SIEM Architecture

A Security Information and Event Management (SIEM) system collects security events from many log sources.

## Log Collection

Log sources such as Windows servers, firewalls and Linux hosts forward events to the SIEM. Agents or syslog forwarders send the events over the network. Normalization converts different log formats into a common schema.

## Correlation and Alerting

The SIEM correlates events using detection rules. When a rule matches, the SIEM raises an alert. For example, many failed logons (Windows event ID 4625) followed by a success (event ID 4624) may indicate a brute-force attack.

## Investigation

A SOC analyst triages the alert, reviews related events on a timeline and decides whether to escalate the incident. The analyst must gather more evidence before concluding that an attack occurred.
`;
