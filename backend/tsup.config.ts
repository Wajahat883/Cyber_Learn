import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', worker: 'src/worker.ts', extractWorker: 'src/services/extractWorker.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package; keep real npm dependencies external.
  noExternal: ['@cyberlearn/shared'],
});
