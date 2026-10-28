/** Caption with the spoken word lit up, karaoke-style. */
export function WordCaption({ text, word, scale }: { text: string; word: number; scale: number }) {
  const parts = text.split(/(\s+)/);
  let n = -1;
  return (
    <p className="rounded-xl bg-black/75 px-5 py-2.5 text-center text-white/60 backdrop-blur-sm max-w-[88%]" style={{ fontSize: `${Math.max(12, 22 * scale)}px`, lineHeight: 1.4 }}>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        n++;
        const state = n < word ? 'said' : n === word ? 'now' : 'next';
        return (
          <span key={i} className={state === 'now' ? 'rounded bg-primary/30 text-white' : state === 'said' ? 'text-white' : undefined} style={state === 'now' ? { boxShadow: '0 0 0 2px rgba(56,189,248,0.3)' } : undefined}>
            {part}
          </span>
        );
      })}
    </p>
  );
}

