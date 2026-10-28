import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { fileTypeFromBuffer } from 'file-type';
import { ALLOWED_UPLOAD_EXTENSIONS } from '@cyberlearn/shared';
import { badRequest } from '../utils/errors.js';
import { ExtractionError, parseDocument, type DocumentKind } from './extractParsers.js';

export { ExtractionError };

const EXTRACTION_TIMEOUT_MS = 60_000;

export interface ValidatedUpload {
  kind: DocumentKind;
  mimeType: string;
  extension: string;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Validates extension, declared MIME type and the actual file signature.
 * A file's extension alone is never trusted (spec 13).
 */
export async function validateUpload(filename: string, buffer: Buffer): Promise<ValidatedUpload> {
  const extension = path.extname(filename).toLowerCase();
  if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    throw badRequest(`Unsupported file type "${extension || 'none'}". Upload PDF, DOCX, TXT or Markdown.`);
  }
  if (!buffer.length) throw badRequest('The file is empty');
  const detected = await fileTypeFromBuffer(buffer);

  if (extension === '.pdf') {
    if (detected?.mime !== 'application/pdf') throw badRequest('The file content is not a PDF');
    return { kind: 'pdf', mimeType: 'application/pdf', extension };
  }
  if (extension === '.docx') {
    if (detected?.mime !== DOCX_MIME) throw badRequest('The file content is not a Word (DOCX) document');
    return { kind: 'docx', mimeType: DOCX_MIME, extension };
  }
  // Plain text / Markdown: must not be a recognised binary format and must be valid UTF-8 without NUL bytes.
  if (detected) throw badRequest(`The file content looks like ${detected.ext.toUpperCase()}, not text`);
  if (buffer.includes(0)) throw badRequest('The file contains binary data, not text');
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw badRequest('The text file is not valid UTF-8');
  }
  return { kind: 'text', mimeType: extension === '.txt' ? 'text/plain' : 'text/markdown', extension };
}

function workerFile(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, 'extractWorker.js'), path.join(here, 'extractWorker.ts')]) {
    // TypeScript workers only load when the process runs under a TS loader (tsx sets execArgv).
    if (existsSync(candidate) && (candidate.endsWith('.js') || process.execArgv.some((a) => a.includes('tsx')))) return candidate;
  }
  return null;
}

/** Extracts page texts in a sandboxed worker thread with memory and time limits. */
export async function extractDocument(kind: DocumentKind, buffer: Buffer): Promise<string[]> {
  if (kind === 'text') return parseDocument('text', buffer);
  const file = workerFile();
  if (!file) {
    // Test runner fallback: same parser, in-process, still time-limited.
    return Promise.race([
      parseDocument(kind, new Uint8Array(buffer)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new ExtractionError('Extraction took too long')), EXTRACTION_TIMEOUT_MS).unref?.()),
    ]);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(file, {
      workerData: { kind, data: new Uint8Array(buffer) },
      resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new ExtractionError('Extraction took too long and was stopped'));
    }, EXTRACTION_TIMEOUT_MS);
    worker.once('message', (msg: { ok: boolean; pages?: string[]; error?: string; userFacing?: boolean }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (msg.ok) resolve(msg.pages ?? []);
      // Raw parser messages stay internal (logged by the caller), only vetted ones reach the user.
      else reject(msg.userFacing ? new ExtractionError(msg.error ?? 'Extraction failed') : new Error(msg.error ?? 'Extraction failed'));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err.message.includes('memory') ? new ExtractionError('The document is too complex to process') : new Error(`Extraction worker error: ${err.message}`));
    });
  });
}
