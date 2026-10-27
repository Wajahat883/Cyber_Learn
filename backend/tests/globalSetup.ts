import { readFileSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer | undefined;

export async function setup() {
  // Kali/Debian-testing is not recognised by mongodb-memory-server; use the Debian 12 build.
  const osRelease = (() => {
    try {
      return readFileSync('/etc/os-release', 'utf8');
    } catch {
      return '';
    }
  })();
  if (/^ID=kali/m.test(osRelease)) process.env.MONGOMS_DISTRO ??= 'debian-12';

  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION ?? '7.0.14' } });
  process.env.TEST_MONGODB_URI = mongo.getUri();
}

export async function teardown() {
  await mongo?.stop();
}
