/**
 * Self-contained stack for the end-to-end tests: an in-memory MongoDB, the API
 * with the offline AI provider (no keys, no cost, deterministic), and Vite.
 * Playwright starts it (see playwright.config.ts) and stops it afterwards.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = process.env.E2E_API_PORT ?? '4100';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5180';

// Kali/Debian-testing is not recognised by mongodb-memory-server; use the Debian 12 build.
try {
  if (/^ID=kali/m.test(readFileSync('/etc/os-release', 'utf8'))) process.env.MONGOMS_DISTRO ??= 'debian-12';
} catch {
  /* not Linux */
}
const mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION ?? '7.0.14' } });

const children = [];
const run = (cmd, args, cwd, env) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code) => {
    if (code) {
      console.error(`${cmd} ${args.join(' ')} exited with ${code}`);
      void shutdown(1);
    }
  });
};

run('npx', ['tsx', 'src/server.ts'], path.join(root, 'backend'), {
  NODE_ENV: 'development',
  PORT: API_PORT,
  APP_ORIGIN: `http://localhost:${WEB_PORT}`,
  MONGODB_URI: mongo.getUri('cyberlearn_e2e'),
  REDIS_URL: '',
  RUN_WORKER_IN_PROCESS: 'true',
  AI_TEXT_PROVIDER: 'mock',
  AI_IMAGE_PROVIDER: 'placeholder',
  AI_SPEECH_PROVIDER: 'browser',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: mkdtempSync(path.join(tmpdir(), 'cyberlearn-e2e-')),
  SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long',
  LOG_LEVEL: 'warn',
});
run('npx', ['vite', '--port', WEB_PORT, '--strictPort'], path.join(root, 'frontend'), { VITE_API_PROXY: `http://localhost:${API_PORT}` });

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  await mongo.stop();
  process.exit(code);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
