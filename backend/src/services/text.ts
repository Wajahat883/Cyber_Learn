/** Source normalization and chunking (spec 3.1 "Normalization & Chunking"). */

export interface TextChunk {
  index: number;
  text: string;
  heading: string;
  page: number;
}

export const CHUNK_TARGET_CHARS = 2500;

export function normalizeText(input: string): string {
  return (
    input
      .replace(/\r\n?/g, '\n')
      // Strip control characters except tab and newline.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const HEADING = /^(#{1,6})\s+(.+)$|^([A-Z][A-Za-z0-9 ,:&()/'-]{2,80})$/;

function detectHeading(line: string, next: string | undefined): string | null {
  const md = line.match(/^#{1,6}\s+(.+)$/);
  if (md) return md[1].trim();
  // Setext-style heading ("Title" followed by ==== or ----).
  if (next && /^(=+|-+)$/.test(next.trim()) && line.trim()) return line.trim();
  // Short title-cased line without terminal punctuation, e.g. "Log Collection".
  const plain = line.trim();
  if (HEADING.test(plain) && !/[.!?;]$/.test(plain) && plain.split(' ').length <= 8 && /^[A-Z]/.test(plain)) {
    const words = plain.split(/\s+/);
    const capitalised = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
    if (capitalised / words.length >= 0.6) return plain;
  }
  return null;
}

export function extractHeadings(text: string): string[] {
  const lines = text.split('\n');
  const headings: string[] = [];
  lines.forEach((line, i) => {
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const h = detectHeading(line, lines[i + 1]);
    if (h && (prevBlank || line.startsWith('#'))) headings.push(h);
  });
  return [...new Set(headings)].slice(0, 100);
}

/**
 * Splits text into chunks of roughly CHUNK_TARGET_CHARS, preferring heading and
 * paragraph boundaries and never splitting inside a fenced code block.
 */
export function chunkText(text: string, page = 0, startIndex = 0): TextChunk[] {
  const blocks: { text: string; heading: string }[] = [];
  let heading = '';
  let buffer: string[] = [];
  let inFence = false;
  const lines = text.split('\n');

  const flush = () => {
    const joined = buffer.join('\n').trim();
    if (joined) blocks.push({ text: joined, heading });
    buffer = [];
  };

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const prevBlank = i === 0 || !lines[i - 1].trim();
      const h = detectHeading(line, lines[i + 1]);
      if (h && (prevBlank || line.startsWith('#'))) {
        flush();
        heading = h;
      }
      if (!line.trim()) {
        flush();
        return;
      }
    }
    buffer.push(line);
  });
  flush();

  const chunks: TextChunk[] = [];
  let current = '';
  let currentHeading = '';
  const push = () => {
    if (current.trim()) chunks.push({ index: startIndex + chunks.length, text: current.trim(), heading: currentHeading, page });
    current = '';
  };

  for (const block of blocks) {
    const pieces = block.text.length > CHUNK_TARGET_CHARS * 1.5 ? splitLong(block.text) : [block.text];
    for (const piece of pieces) {
      const headingChanged = block.heading !== currentHeading && current.length > CHUNK_TARGET_CHARS / 3;
      if (current && (current.length + piece.length > CHUNK_TARGET_CHARS || headingChanged)) push();
      if (!current) currentHeading = block.heading;
      current += (current ? '\n\n' : '') + piece;
    }
  }
  push();
  return chunks;
}

function splitLong(text: string): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur.length + s.length > CHUNK_TARGET_CHARS && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
    while (cur.length > CHUNK_TARGET_CHARS * 1.5) {
      out.push(cur.slice(0, CHUNK_TARGET_CHARS));
      cur = cur.slice(CHUNK_TARGET_CHARS);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Splits text into heading-led blocks, keeping fenced code inside its block. */
export function splitByHeadings(text: string): { heading: string; level: number; text: string }[] {
  const lines = text.split('\n');
  const blocks: { heading: string; level: number; text: string }[] = [];
  let current = { heading: '', level: 0, lines: [] as string[] };
  let inFence = false;
  const flush = () => {
    const body = current.lines.join('\n').trim();
    if (body || current.heading) blocks.push({ heading: current.heading, level: current.level, text: body });
  };
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const prevBlank = i === 0 || !lines[i - 1].trim();
      const h = detectHeading(line, lines[i + 1]);
      if (h && (prevBlank || line.startsWith('#'))) {
        flush();
        const md = line.match(/^(#{1,6})\s/);
        current = { heading: h, level: md ? md[1].length : 2, lines: [] };
        return;
      }
      if (/^(=+|-+)$/.test(line.trim()) && current.lines.length === 0 && current.heading) return;
    }
    current.lines.push(line);
  });
  flush();
  return blocks;
}

/** Splits text into sentences (used by the offline mock provider and narration timing). */
export function sentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
