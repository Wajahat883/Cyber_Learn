import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.AI_TEXT_PROVIDER = 'mock';
process.env.AI_IMAGE_PROVIDER = 'placeholder';
process.env.AI_SPEECH_PROVIDER = 'browser';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), 'cyberlearn-test-'));
process.env.APP_ORIGIN = 'http://localhost:5173';

const { default: mongoose } = await import('mongoose');

beforeAll(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI!, { dbName: `test-${process.pid}-${Date.now()}` });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
