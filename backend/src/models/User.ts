import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    preferences: {
      language: { type: String, enum: ['en', 'roman-urdu', 'bilingual'], default: 'en' },
      difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate' },
      narrationEnabled: { type: Boolean, default: true },
      presentationDensity: { type: String, enum: ['concise', 'detailed'], default: 'detailed' },
      visualMode: { type: String, enum: ['diagrams', 'illustrations', 'both'], default: 'both' },
      playbackSpeed: { type: Number, default: 1 },
      captions: { type: Boolean, default: true },
    },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    /** Bumped on logout-everywhere / password change to invalidate existing sessions. */
    sessionVersion: { type: Number, default: 0 },
    usage: {
      generations: { type: Number, default: 0 },
      aiCalls: { type: Number, default: 0 },
      inputChars: { type: Number, default: 0 },
      outputChars: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
