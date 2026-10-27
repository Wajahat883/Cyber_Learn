import { parentPort, workerData } from 'node:worker_threads';
import { parseDocument, type DocumentKind } from './extractParsers.js';

/** Runs in a resource-limited worker thread so a hostile or huge document cannot stall the API. */
const { kind, data } = workerData as { kind: DocumentKind; data: Uint8Array };
parseDocument(kind, data).then(
  (pages) => parentPort?.postMessage({ ok: true, pages }),
  (err: Error) => parentPort?.postMessage({ ok: false, error: err.message }),
);
