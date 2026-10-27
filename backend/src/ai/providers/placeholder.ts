import { createHash } from 'node:crypto';
import type { ImageGenerationProvider, SpeechProvider } from '../types.js';

/**
 * Offline illustration: a deterministic abstract "network" composition derived
 * from the topic. It deliberately contains no text; labels are rendered as
 * editable HTML overlays on top (spec 4.10).
 */
export class PlaceholderImageProvider implements ImageGenerationProvider {
  readonly name = 'placeholder';
  readonly model = 'svg-concept-v1';

  async generateImage(input: { prompt: string; title: string; concepts: string[] }) {
    const seed = createHash('sha256').update(input.title + input.concepts.join('|')).digest();
    let i = 0;
    const rnd = () => seed[i++ % seed.length] / 255;
    const W = 1600;
    const H = 900;
    const count = Math.max(4, Math.min(9, input.concepts.length || 6));
    const cx = W / 2;
    const cy = H / 2;
    const points = Array.from({ length: count }, (_, k) => {
      const angle = (k / count) * Math.PI * 2 + rnd() * 0.5;
      const r = 220 + rnd() * 160;
      return { x: cx + Math.cos(angle) * r * 1.5, y: cy + Math.sin(angle) * r * 0.85 };
    });
    const hueA = Math.round(190 + rnd() * 20);
    const hueB = Math.round(255 + rnd() * 25);
    const lines = points
      .map((p, k) => {
        const q = points[(k + 1) % points.length];
        return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(0)}" y2="${p.y.toFixed(0)}" stroke="url(#edge)" stroke-width="3" opacity="0.7"/>
<line x1="${p.x.toFixed(0)}" y1="${p.y.toFixed(0)}" x2="${q.x.toFixed(0)}" y2="${q.y.toFixed(0)}" stroke="hsl(${hueA} 80% 60%)" stroke-width="1.5" opacity="0.25"/>`;
      })
      .join('\n');
    const nodes = points
      .map((p, k) => {
        const r = 26 + rnd() * 22;
        const hue = k % 2 ? hueA : hueB;
        return `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${(r + 18).toFixed(0)}" fill="hsl(${hue} 85% 60%)" opacity="0.12"/>
<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${r.toFixed(0)}" fill="#0f1830" stroke="hsl(${hue} 85% 62%)" stroke-width="4"/>
<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${(r / 3).toFixed(0)}" fill="hsl(${hue} 85% 62%)"/>`;
      })
      .join('\n');
    const grid = Array.from({ length: 16 }, (_, k) => `<line x1="${k * 100}" y1="0" x2="${k * 100}" y2="${H}" stroke="#1d2a47" stroke-width="1"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#16244a"/><stop offset="100%" stop-color="#0b1020"/></radialGradient>
<linearGradient id="edge" x1="0" x2="1"><stop offset="0%" stop-color="hsl(${hueA} 85% 60%)"/><stop offset="100%" stop-color="hsl(${hueB} 80% 66%)"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g opacity="0.35">${grid}</g>
${lines}
${nodes}
<path d="M${cx} ${cy - 120} l105 40 v70 c0 70 -45 115 -105 135 c-60 -20 -105 -65 -105 -135 v-70z" fill="#0f1830" stroke="url(#edge)" stroke-width="8"/>
<path d="M${cx - 45} ${cy + 15} l32 32 l62 -72" fill="none" stroke="hsl(${hueA} 85% 62%)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    return { body: Buffer.from(svg), mimeType: 'image/svg+xml' };
  }
}

/** Narration is spoken in the browser with the Web Speech API; nothing is stored. */
export class BrowserSpeechProvider implements SpeechProvider {
  readonly name = 'browser';
  readonly producesAudio = false;

  async synthesize() {
    return null;
  }
}
