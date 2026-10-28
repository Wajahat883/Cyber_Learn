import { Schema, model, type InferSchemaType } from 'mongoose';

/** AI usage per user per UTC day, for the daily budget and the Settings usage line. */
const aiUsageSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    calls: { type: Number, default: 0 },
    inputChars: { type: Number, default: 0 },
    outputChars: { type: Number, default: 0 },
    /** Real token counts reported by the providers. */
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    /** Calls that failed after reaching the provider (they may still have been billed). */
    failedCalls: { type: Number, default: 0 },
    imageCalls: { type: Number, default: 0 },
    speechCalls: { type: Number, default: 0 },
    speechChars: { type: Number, default: 0 },
    /** Per-model breakdown: { [model]: { calls, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } }. */
    byModel: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
aiUsageSchema.index({ ownerId: 1, day: 1 }, { unique: true });
// Old days are only needed for a while.
aiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export type AiUsageDoc = InferSchemaType<typeof aiUsageSchema>;
export const AiUsageDay = model('AiUsageDay', aiUsageSchema);
