import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import {
  KIND_COLORS,
  layoutDiagram,
  NODE_H,
  NODE_W,
  type DiagramSpec,
  type LessonSection,
  type PresentationManifest,
  type Question,
} from '@cyberlearn/shared';

export interface ExportLesson {
  title: string;
  subject: string;
  summary: string;
  learningObjectives: string[];
  sections: LessonSection[];
  diagrams: DiagramSpec[];
  warnings: string[];
}

export interface ExportExtras {
  flashcards: { front: string; back: string }[];
  questions: Question[];
  includeQuestions: boolean;
  /** Raster illustrations by asset id (SVG placeholders are skipped in PPTX). */
  images: Map<string, { body: Buffer; mimeType: string }>;
}

const plain = (md: string) =>
  md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();

// ---------------------------------------------------------------- Markdown

export function buildMarkdown(lesson: ExportLesson, extras: ExportExtras): string {
  const out: string[] = [`# ${lesson.title}`, '', `_${lesson.subject || 'Lesson'} — exported from CyberLearn AI on ${new Date().toISOString().slice(0, 10)}_`, ''];
  if (lesson.summary) out.push(lesson.summary, '');
  if (lesson.learningObjectives.length) out.push('## Learning objectives', '', ...lesson.learningObjectives.map((o) => `- ${o}`), '');
  out.push('## Contents', '', ...lesson.sections.map((s, i) => `${i + 1}. [${s.title}](#${s.id})`), '');
  for (const s of lesson.sections) {
    out.push(`## ${s.title}`, '');
    const block = (title: string, body: string) => body.trim() && out.push(`### ${title}`, '', body.trim(), '');
    if (s.definition) out.push(`> ${s.definition.replace(/\n/g, '\n> ')}`, '');
    block('Explanation', s.explanation);
    block('Why it matters', s.whyItMatters);
    block('How it works', s.howItWorks);
    block('Example', s.example);
    for (const c of s.codeSnippets) out.push('```' + (c.language === 'text' ? '' : c.language), c.code, '```', '');
    if (s.commonMistakes.length) out.push('### Common mistakes', '', ...s.commonMistakes.map((m) => `- ${m}`), '');
    block('Practical application', s.practicalApplication);
    if (s.supplementaryNotes.length) out.push('### Supplementary notes (not in the source)', '', ...s.supplementaryNotes.map((m) => `- ${m}`), '');
    block('Key takeaway', s.summary);
    for (const d of lesson.diagrams.filter((x) => x.sectionId === s.id)) {
      // Mermaid keeps the diagram editable in Markdown tools that render it.
      out.push(`### Diagram: ${d.title}`, '', '```mermaid', `flowchart ${d.direction}`);
      for (const n of d.nodes) out.push(`  ${n.id.replace(/-/g, '_')}["${n.label.replace(/"/g, "'")}"]`);
      for (const e of d.edges) out.push(`  ${e.source.replace(/-/g, '_')} -->${e.label ? `|${e.label.replace(/[|"]/g, '')}|` : ''} ${e.target.replace(/-/g, '_')}`);
      out.push('```', '');
    }
    if (s.sourceRefs.length) out.push('<details><summary>Source references</summary>', '', ...s.sourceRefs.map((r) => `- Chunk ${r.chunkIndex + 1}: ${r.excerpt.replace(/\n/g, ' ')}`), '', '</details>', '');
  }
  if (extras.includeQuestions && extras.flashcards.length) out.push('## Flashcards', '', ...extras.flashcards.map((c) => `- **${c.front}** — ${c.back}`), '');
  if (extras.includeQuestions && extras.questions.length) {
    out.push('## Practice questions', '');
    extras.questions.forEach((q, i) => {
      out.push(`${i + 1}. ${q.prompt}`);
      if (q.context) out.push('', '   ```', ...q.context.split('\n').map((l) => `   ${l}`), '   ```');
      q.options.forEach((o, j) => out.push(`   - ${String.fromCharCode(65 + j)}. ${o}`));
      out.push('');
    });
    out.push('### Answers', '');
    extras.questions.forEach((q, i) => out.push(`${i + 1}. ${q.correctOptionIndex !== undefined ? `${String.fromCharCode(65 + q.correctOptionIndex)}. ` : ''}${q.answer || ''} — ${q.explanation}`));
    out.push('');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- PDF

const INK = '#0f172a';
const MUTED = '#475569';
const ACCENT = '#0284c7';

function drawDiagramPdf(doc: PDFKit.PDFDocument, diagram: DiagramSpec, maxWidth: number) {
  const layout = layoutDiagram(diagram);
  const scale = Math.min(1, maxWidth / layout.width, 280 / layout.height);
  const height = layout.height * scale + 10;
  if (doc.y + height + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED).text(`Diagram: ${diagram.title}`);
  const ox = doc.page.margins.left + (maxWidth - layout.width * scale) / 2;
  const oy = doc.y + 6;
  doc.save();
  for (const e of layout.edges) {
    const pts = e.points.map((p) => ({ x: ox + p.x * scale, y: oy + p.y * scale }));
    doc.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) doc.lineTo(p.x, p.y);
    doc.lineWidth(1).strokeColor('#64748b').stroke();
    const [a, b] = pts.slice(-2);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    doc
      .moveTo(b.x, b.y)
      .lineTo(b.x - 6 * Math.cos(ang - 0.4), b.y - 6 * Math.sin(ang - 0.4))
      .lineTo(b.x - 6 * Math.cos(ang + 0.4), b.y - 6 * Math.sin(ang + 0.4))
      .fillColor('#64748b')
      .fill();
    if (e.label) {
      const mid = pts[Math.floor(pts.length / 2)];
      doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(e.label, mid.x - 40, mid.y - 9, { width: 80, align: 'center' });
    }
  }
  for (const n of layout.nodes) {
    const x = ox + n.x * scale;
    const y = oy + n.y * scale;
    doc.roundedRect(x, y, NODE_W * scale, NODE_H * scale, 6).lineWidth(1.5).fillAndStroke('#f8fafc', KIND_COLORS[n.kind]);
    doc
      .font('Helvetica-Bold')
      .fontSize(Math.max(7, 11 * scale))
      .fillColor(INK)
      .text(n.label, x + 4, y + (NODE_H * scale) / 2 - 6 * Math.max(0.7, scale), { width: NODE_W * scale - 8, align: 'center', height: NODE_H * scale - 4, ellipsis: true });
  }
  doc.restore();
  doc.x = doc.page.margins.left;
  doc.y = oy + height;
  doc.moveDown(0.5);
}

function writeMarkdownBlock(doc: PDFKit.PDFDocument, md: string, width: number) {
  const lines = md.split('\n');
  let inCode = false;
  let code: string[] = [];
  const flushCode = () => {
    if (!code.length) return;
    doc.font('Courier').fontSize(8.5).fillColor(INK);
    const text = code.join('\n');
    const h = doc.heightOfString(text, { width: width - 12 }) + 10;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.rect(doc.page.margins.left, doc.y, width, h).fill('#f1f5f9');
    doc.fillColor(INK).text(text, doc.page.margins.left + 6, doc.y + 5, { width: width - 12 });
    doc.moveDown(0.5);
    code = [];
  };
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(raw);
      continue;
    }
    const line = raw.trimEnd();
    if (!line.trim()) {
      doc.moveDown(0.3);
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
    doc.font('Helvetica').fontSize(10.5).fillColor(INK);
    if (bullet) doc.text(`•  ${plain(bullet[1])}`, doc.page.margins.left + 10, doc.y, { width: width - 10 });
    else if (/^#{1,6}\s/.test(line)) doc.font('Helvetica-Bold').text(plain(line), doc.page.margins.left, doc.y, { width });
    else doc.text(plain(line), doc.page.margins.left, doc.y, { width, align: 'left' });
  }
  flushCode();
}

export function buildPdf(lesson: ExportLesson, extras: ExportExtras): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: lesson.title, Creator: 'CyberLearn AI' }, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Cover
    doc.font('Helvetica').fontSize(10).fillColor(ACCENT).text((lesson.subject || 'Lesson').toUpperCase(), { characterSpacing: 2 });
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(26).fillColor(INK).text(lesson.title);
    doc.moveDown(0.5).font('Helvetica').fontSize(11).fillColor(MUTED).text(lesson.summary);
    if (lesson.learningObjectives.length) {
      doc.moveDown().font('Helvetica-Bold').fontSize(12).fillColor(INK).text('Learning objectives');
      doc.font('Helvetica').fontSize(10.5);
      for (const o of lesson.learningObjectives) doc.text(`•  ${o}`, { indent: 6 });
    }
    // Table of contents (also added to the PDF outline for navigation).
    doc.moveDown().font('Helvetica-Bold').fontSize(12).fillColor(INK).text('Contents');
    doc.font('Helvetica').fontSize(10.5);
    lesson.sections.forEach((s, i) => doc.text(`${i + 1}.  ${s.title}`, { indent: 6 }));
    if (lesson.warnings.length) {
      doc.moveDown().font('Helvetica-Oblique').fontSize(9).fillColor(MUTED);
      for (const w of lesson.warnings) doc.text(`Note: ${w}`);
    }

    lesson.sections.forEach((s, i) => {
      doc.addPage();
      doc.outline.addItem(`${i + 1}. ${s.title}`);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(`${i + 1}. ${s.title}`);
      doc.moveDown(0.4);
      if (s.definition) {
        doc.font('Helvetica-Oblique').fontSize(10.5).fillColor(INK);
        const h = doc.heightOfString(plain(s.definition), { width: width - 16 }) + 12;
        doc.rect(doc.page.margins.left, doc.y, 3, h).fill(ACCENT);
        doc.fillColor(INK).text(plain(s.definition), doc.page.margins.left + 12, doc.y + 6, { width: width - 16 });
        doc.moveDown(0.8);
      }
      const block = (title: string, body: string) => {
        if (!body.trim()) return;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text(title, doc.page.margins.left);
        doc.moveDown(0.2);
        writeMarkdownBlock(doc, body, width);
        doc.moveDown(0.4);
      };
      block('Explanation', s.explanation);
      block('Why it matters', s.whyItMatters);
      block('How it works', s.howItWorks);
      for (const d of lesson.diagrams.filter((x) => x.sectionId === s.id)) drawDiagramPdf(doc, d, width);
      block('Example', s.example);
      for (const c of s.codeSnippets) writeMarkdownBlock(doc, '```\n' + c.code + '\n```', width);
      if (s.commonMistakes.length) block('Common mistakes', s.commonMistakes.map((m) => `- ${m}`).join('\n'));
      block('Practical application', s.practicalApplication);
      if (s.supplementaryNotes.length) block('Supplementary notes (not in your source)', s.supplementaryNotes.map((m) => `- ${m}`).join('\n'));
      block('Key takeaway', s.summary);
      if (s.sourceRefs.length) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('Source references', doc.page.margins.left);
        doc.font('Helvetica').fontSize(8).fillColor(MUTED);
        for (const r of s.sourceRefs.slice(0, 5)) doc.text(`Chunk ${r.chunkIndex + 1}: ${r.excerpt.replace(/\s+/g, ' ').slice(0, 220)}`, { width });
      }
    });

    doc.addPage();
    doc.outline.addItem('Key takeaways');
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Key takeaways');
    doc.moveDown(0.5).font('Helvetica').fontSize(10.5);
    for (const s of lesson.sections) if (s.summary || s.definition) doc.text(`•  ${s.title}: ${plain(s.summary || s.definition)}`, { width });

    if (extras.includeQuestions && (extras.flashcards.length || extras.questions.length)) {
      doc.addPage();
      doc.outline.addItem('Revision');
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Revision');
      if (extras.flashcards.length) {
        doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text('Flashcards');
        for (const c of extras.flashcards) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(c.front);
          doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(c.back, { indent: 10 });
          doc.moveDown(0.3);
        }
      }
      if (extras.questions.length) {
        doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text('Practice questions');
        extras.questions.forEach((q, i) => {
          doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`${i + 1}. ${plain(q.prompt)}`);
          if (q.context) doc.font('Courier').fontSize(8.5).fillColor(INK).text(q.context, { indent: 10 });
          doc.font('Helvetica').fontSize(10);
          q.options.forEach((o, j) => doc.text(`${String.fromCharCode(65 + j)}. ${o}`, { indent: 10 }));
          doc.moveDown(0.3);
        });
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text('Answers');
        extras.questions.forEach((q, i) => {
          const key = q.correctOptionIndex !== undefined ? `${String.fromCharCode(65 + q.correctOptionIndex)}. ` : '';
          doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`${i + 1}. ${key}${plain(q.answer)} ${plain(q.explanation)}`, { width });
          doc.moveDown(0.2);
        });
      }
    }

    // Page numbers.
    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`${lesson.title} · ${p + 1}/${range.count}`, doc.page.margins.left, doc.page.height - 36, { width, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

// ---------------------------------------------------------------- PPTX

const BG = '0B1020';
const FG = 'F1F5F9';
const SUB = '94A3B8';
const CYAN = '38BDF8';

function addDiagramShapes(pptx: PptxGenJS, slide: PptxGenJS.Slide, diagram: DiagramSpec, box: { x: number; y: number; w: number; h: number }) {
  const layout = layoutDiagram(diagram);
  const s = Math.min(box.w / layout.width, box.h / layout.height);
  const ox = box.x + (box.w - layout.width * s) / 2;
  const oy = box.y + (box.h - layout.height * s) / 2;
  for (const e of layout.edges) {
    const pts = e.points.map((p) => ({ x: ox + p.x * s, y: oy + p.y * s }));
    pts.slice(1).forEach((b, i) => {
      const a = pts[i];
      const last = i === pts.length - 2;
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.max(0.001, Math.abs(b.x - a.x)),
        h: Math.max(0.001, Math.abs(b.y - a.y)),
        flipH: b.x < a.x,
        flipV: b.y < a.y,
        line: { color: '64748B', width: 1.25, endArrowType: last ? 'triangle' : undefined },
      });
    });
    if (e.label) {
      const mid = pts[Math.floor(pts.length / 2)];
      slide.addText(e.label, { x: mid.x - 0.6, y: mid.y - 0.12, w: 1.2, h: 0.24, fontSize: 8, color: SUB, align: 'center', fill: { color: BG } });
    }
  }
  // Nodes are real shapes with text, so the diagram stays editable in PowerPoint.
  for (const n of layout.nodes) {
    slide.addText(n.label, {
      shape: n.kind === 'decision' ? pptx.ShapeType.rect : pptx.ShapeType.roundRect,
      x: ox + n.x * s,
      y: oy + n.y * s,
      w: NODE_W * s,
      h: NODE_H * s,
      rectRadius: 0.08,
      fill: { color: '0F1830' },
      line: { color: KIND_COLORS[n.kind].replace('#', ''), width: 1.5 },
      color: FG,
      fontSize: Math.max(8, Math.min(14, 120 * s)),
      bold: true,
      align: 'center',
      valign: 'middle',
    });
  }
}

export async function buildPptx(manifest: PresentationManifest, extras: ExportExtras): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = manifest.title;
  pptx.company = 'CyberLearn AI';
  const diagrams = new Map(manifest.diagrams.map((d) => [d.id, d]));

  for (const s of manifest.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: BG };
    const isTitle = s.type === 'title';
    slide.addText(s.title, { x: 0.5, y: isTitle ? 1.2 : 0.3, w: 9, h: isTitle ? 1.2 : 0.7, fontSize: isTitle ? 36 : 24, bold: true, color: FG, fontFace: 'Calibri' });
    if (s.subtitle) slide.addText(s.subtitle, { x: 0.5, y: isTitle ? 2.4 : 0.95, w: 9, h: 0.5, fontSize: isTitle ? 16 : 12, color: SUB });
    const top = isTitle ? 3.0 : 1.5;
    const diagram = s.diagramId ? diagrams.get(s.diagramId) : undefined;
    const image = s.imageAssetId ? extras.images.get(s.imageAssetId) : undefined;

    if (diagram) {
      addDiagramShapes(pptx, slide, diagram, { x: 0.5, y: 1.5, w: 9, h: 3.8 });
    } else if (s.timeline.length) {
      const w = 9 / s.timeline.length;
      slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 2.2, w: 9, h: 0, line: { color: '263449', width: 2 } });
      s.timeline.forEach((t, i) => {
        slide.addShape(pptx.ShapeType.ellipse, { x: 0.5 + i * w + 0.05, y: 2.05, w: 0.3, h: 0.3, fill: { color: '8B5CF6' } });
        slide.addText(`${t.time}\n${t.label}`, { x: 0.5 + i * w, y: 2.5, w: w - 0.1, h: 2.5, fontSize: 11, color: FG, valign: 'top' });
      });
    } else if (s.comparison) {
      const col = (side: NonNullable<typeof s.comparison>['left'], x: number, color: string) => {
        slide.addText(side.title, { x, y: 1.5, w: 4.3, h: 0.5, fontSize: 18, bold: true, color });
        slide.addText(side.points.map((p) => ({ text: p.text, options: { bullet: true } })), { x, y: 2.1, w: 4.3, h: 3.2, fontSize: 13, color: FG, valign: 'top' });
      };
      col(s.comparison.left, 0.5, '34D399');
      col(s.comparison.right, 5.2, 'F87171');
    } else if (s.terminal.length) {
      slide.addText(s.terminal.map((t) => `$ ${t.command}${t.output ? `\n${t.output}` : ''}`).join('\n\n'), {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 3.8,
        fontFace: 'Consolas',
        fontSize: 12,
        color: FG,
        fill: { color: '05080F' },
        valign: 'top',
        margin: 12,
      });
    } else if (s.bullets.length) {
      slide.addText(
        s.bullets.map((b) => ({ text: b.text, options: { bullet: { code: '25CF' }, paraSpaceAfter: 10 } })),
        { x: 0.5, y: top, w: image ? 5.4 : 9, h: 5.3 - top, fontSize: 16, color: FG, valign: 'top' },
      );
    }
    if (image && !diagram) {
      const data = `data:${image.mimeType};base64,${image.body.toString('base64')}`;
      const box = s.type === 'concept-illustration' ? { x: 0.5, y: 1.5, w: 9, h: 3.8 } : { x: 6.1, y: 1.5, w: 3.4, h: 1.9 };
      slide.addImage({ data, ...box, sizing: { type: 'cover', w: box.w, h: box.h } });
      for (const a of s.annotations) {
        slide.addText(a.label, { x: box.x + (a.x / 100) * box.w - 0.8, y: box.y + (a.y / 100) * box.h - 0.18, w: 1.6, h: 0.36, fontSize: 11, bold: true, color: FG, fill: { color: BG }, align: 'center' });
      }
    } else if (s.type === 'concept-illustration' && s.annotations.length) {
      slide.addText(s.annotations.map((a) => ({ text: a.label, options: { bullet: true } })), { x: 0.5, y: 1.6, w: 9, h: 3.5, fontSize: 16, color: CYAN });
    }
    const notes = s.narration.text || s.speakerNotes;
    if (notes) slide.addNotes(notes);
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(out as ArrayBuffer);
}
