import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_PDF_PAGES = 400;

export type DocumentKind = 'pdf' | 'docx' | 'text';

/** Converts mammoth HTML to light Markdown so headings survive for chunking and source references. */
function htmlToMarkdown(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  return decode(
    html
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, text) => `\n\n${'#'.repeat(Number(level))} ${text.replace(/<[^>]+>/g, '').trim()}\n\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, text) => `\n- ${text.replace(/<[^>]+>/g, '').trim()}`)
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, text) => `\n\n\`\`\`\n${text.replace(/<[^>]+>/g, '')}\n\`\`\`\n\n`)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|table|tr|ul|ol)>/gi, '\n\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  );
}

/** Pure parsing, executed inside the extraction worker thread. Returns one string per page. */
export async function parseDocument(kind: DocumentKind, data: Uint8Array): Promise<string[]> {
  if (kind === 'pdf') {
    let pdf;
    try {
      pdf = await getDocumentProxy(data);
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password and upload it again.');
      throw new Error('This PDF could not be read. It may be corrupted.');
    }
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}.`);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text as string[];
    const chars = pages.join('').replace(/\s/g, '').length;
    if (chars < 40 * Math.max(1, Math.min(pages.length, 5))) {
      throw new Error('Almost no text was found. This looks like a scanned PDF; OCR is not supported yet.');
    }
    return pages;
  }
  if (kind === 'docx') {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
    return [htmlToMarkdown(result.value)];
  }
  return [new TextDecoder('utf-8', { fatal: false }).decode(data)];
}
