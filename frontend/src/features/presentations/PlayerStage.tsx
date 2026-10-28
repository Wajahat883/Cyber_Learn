import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SlideStage } from '../../components/presentation/SlideStage';
import type { Presentation } from '../../types/models';
import type { PresentationClock } from './clock';
import { captionAt, frameAt, wordAt } from './frame';
import type { NarrationHandle } from './useNarration';
import { Waveform } from './Waveform';

/** The animated slide itself; the only part of the player that renders every animation frame. */
export function PlayerStage({
  clock,
  presentation,
  captions,
  narration,
  voiceOn,
  selected,
  onSelect,
}: {
  clock: PresentationClock;
  presentation: Presentation;
  captions: boolean;
  narration: NarrationHandle;
  voiceOn: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  // The stage is the only part that renders every animation frame.
  const state = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  const slide = presentation.manifest.slides[state.slideIndex];
  const diagram = slide?.diagramId ? presentation.manifest.diagrams.find((d) => d.id === slide.diagramId) : undefined;
  if (!slide) return null;
  const frame = frameAt(slide, state.elapsedMs);
  const current = captions ? captionAt(slide.narration.captions, state.elapsedMs) : undefined;
  let caption: { text: string; word: number } | undefined;
  if (current) {
    // Prefer the word the voice is actually saying; otherwise follow the timeline.
    const spoken = narration.word;
    const index = slide.narration.captions.indexOf(current);
    const word =
      spoken && spoken.slide === state.slideIndex && spoken.caption === index
        ? current.text.slice(0, spoken.charStart).split(/\s+/).filter(Boolean).length
        : wordAt(current, state.elapsedMs, slide.narration.words);
    caption = { text: current.text, word };
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={slide.id} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
        <SlideStage
          slide={slide}
          diagram={diagram}
          frame={frame}
          caption={caption}
          interaction={{
            selectedNode: state.playing ? null : selected,
            onNodeClick: (id) => {
              clock.pause();
              onSelect(id);
            },
            onCloseDetails: () => onSelect(null),
          }}
          overlay={<Waveform narration={narration} active={voiceOn && Boolean(slide.narration.text)} />}
        />
      </motion.div>
    </AnimatePresence>
  );
}

