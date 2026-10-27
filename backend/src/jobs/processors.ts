import { runGeneration } from '../services/generationPipeline.js';
import { regenerateImage } from '../services/imageRegeneration.js';
import { runExport } from '../services/exports.js';
import { registerProcessor, type JobPayloads } from './queues.js';

/** Content, diagram, image, narration and export work all run through these processors (spec 6.2). */
registerProcessor(async (name, data) => {
  switch (name) {
    case 'generation:run':
      await runGeneration((data as JobPayloads['generation:run']).generationId);
      break;
    case 'media:regenerate-image':
      await regenerateImage((data as JobPayloads['media:regenerate-image']).assetId);
      break;
    case 'media:export':
      await runExport((data as JobPayloads['media:export']).assetId);
      break;
  }
});
