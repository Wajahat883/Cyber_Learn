import { Schema, model } from 'mongoose';

/**
 * Subjects are data, not code (Roman Urdu section 3): adding "Cloud Security"
 * or a university course creates a document, never a new page or deployment.
 */
const subjectSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 1000 },
    color: { type: String, default: '#38BDF8' },
    icon: { type: String, default: 'book' },
  },
  { timestamps: true },
);

subjectSchema.index({ ownerId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Subject = model('Subject', subjectSchema);

const learningPathSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    title: { type: String, required: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 1000 },
    modules: [
      {
        title: { type: String, required: true, maxlength: 150 },
        description: { type: String, default: '', maxlength: 600 },
        projectIds: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
      },
    ],
  },
  { timestamps: true },
);

learningPathSchema.index({ ownerId: 1, subjectId: 1 });

export const LearningPath = model('LearningPath', learningPathSchema);

/** Starter subjects created for every new account (they can be renamed or deleted). */
export const DEFAULT_SUBJECTS = [
  { name: 'SOC & Blue Team', description: 'SIEM, Windows logs, detection engineering, incident response, HTB CDSA', color: '#38BDF8', icon: 'shield' },
  { name: 'Penetration Testing', description: 'HTTP, Burp Suite, OWASP, authentication, API security, authorized labs', color: '#F87171', icon: 'target' },
  { name: 'Cloud Security', description: 'IAM, networking, cloud logging, permissions, misconfigurations', color: '#8B5CF6', icon: 'cloud' },
  { name: 'AI Security', description: 'LLM security, prompt injection, AI threat modeling, secure AI systems', color: '#34D399', icon: 'cpu' },
  { name: 'University & Other Studies', description: 'BSCS courses, networking, programming, mathematics and any other subject', color: '#FBBF24', icon: 'book' },
];
