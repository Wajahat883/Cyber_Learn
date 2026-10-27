import type { RegisterInput } from '@cyberlearn/shared';
import { DEFAULT_SUBJECTS, Subject, User } from '../../models/index.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../utils/crypto.js';
import { AppError, conflict, badRequest } from '../../utils/errors.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function publicUser(user: { _id: unknown; email: string; displayName: string; preferences?: unknown; createdAt?: Date }) {
  return { id: String(user._id), email: user.email, displayName: user.displayName, preferences: user.preferences, createdAt: user.createdAt };
}

export async function register(input: RegisterInput) {
  const exists = await User.exists({ email: input.email });
  if (exists) throw conflict('An account with this email already exists');
  const user = await User.create({
    email: input.email,
    displayName: input.displayName,
    passwordHash: await hashPassword(input.password),
  });
  await Subject.insertMany(DEFAULT_SUBJECTS.map((s) => ({ ...s, ownerId: user._id })));
  return user;
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email }).select('+passwordHash');
  // Always run a hash comparison so response timing does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return user;
}

/** Returns the raw reset token (to be delivered out of band) or null when the email is unknown. */
export async function createPasswordReset(email: string): Promise<string | null> {
  const user = await User.findOne({ email });
  if (!user) return null;
  const token = randomToken(32);
  user.set({ resetTokenHash: sha256(token), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) });
  await user.save();
  return token;
}

export async function resetPassword(token: string, password: string) {
  const user = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpiresAt: { $gt: new Date() } }).select(
    '+resetTokenHash +resetTokenExpiresAt',
  );
  if (!user) throw badRequest('Reset link is invalid or has expired');
  user.set({
    passwordHash: await hashPassword(password),
    resetTokenHash: undefined,
    resetTokenExpiresAt: undefined,
    sessionVersion: (user.sessionVersion ?? 0) + 1,
  });
  await user.save();
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  user.set({ passwordHash: await hashPassword(newPassword), sessionVersion: (user.sessionVersion ?? 0) + 1 });
  await user.save();
  return user;
}
