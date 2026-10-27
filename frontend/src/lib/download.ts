import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DiagramSpec } from '@cyberlearn/shared';
import { DiagramSvg } from '../components/diagrams/DiagramSvg';
import { layoutDiagram } from '@cyberlearn/shared';

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (title: string, ext: string) => `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'diagram'}.${ext}`;

export function diagramSvgMarkup(diagram: DiagramSpec): { markup: string; width: number; height: number } {
  const layout = layoutDiagram(diagram);
  const body = renderToStaticMarkup(createElement(DiagramSvg, { diagram, layout }));
  // Standalone file: dark background and explicit pixel size.
  const markup = body
    .replace('width="100%" height="100%"', `width="${layout.width + 20}" height="${layout.height + 20}"`)
    .replace(/(<svg[^>]*>)/, `$1<rect x="-20" y="-20" width="${layout.width + 40}" height="${layout.height + 40}" fill="#0B1020"/>`);
  return { markup, width: layout.width + 20, height: layout.height + 20 };
}

export function downloadDiagramSvg(diagram: DiagramSpec) {
  const { markup } = diagramSvgMarkup(diagram);
  save(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], { type: 'image/svg+xml' }), fileName(diagram.title, 'svg'));
}

export async function downloadDiagramPng(diagram: DiagramSpec, scale = 2) {
  const { markup, width, height } = diagramSvgMarkup(diagram);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not render the diagram'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob) save(blob, fileName(diagram.title, 'png'));
}
