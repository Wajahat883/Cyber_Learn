import { Router } from 'express';
import { ChangePasswordSchema, ForgotPasswordSchema, LoginSchema, RegisterSchema, ResetPasswordSchema } from '@cyberlearn/shared';
import { env } from '../../config/env.js';
import { authenticate, clearSessionCookie, setSessionCookie } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { User } from '../../models/index.js';
import { logger } from '../../utils/logger.js';
import { userId } from '../../utils/http.js';
import * as auth from './auth.service.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate(RegisterSchema), async (req, res) => {
  const user = await auth.register(req.body);
  setSessionCookie(res, String(user._id), user.sessionVersion);
  res.status(201).json({ user: auth.publicUser(user) });
});

authRouter.post('/login', authLimiter, validate(LoginSchema), async (req, res) => {
  const user = await auth.login(req.body.email, req.body.password);
  setSessionCookie(res, String(user._id), user.sessionVersion);
  res.json({ user: auth.publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(userId(req)).lean();
  res.json({ user: user ? auth.publicUser(user) : null });
});

/** Lets the SPA obtain the CSRF cookie before its first state-changing request. */
authRouter.get('/csrf', (_req, res) => {
  res.status(204).end();
});

authRouter.post('/forgot-password', authLimiter, validate(ForgotPasswordSchema), async (req, res) => {
  const token = await auth.createPasswordReset(req.body.email);
  const body: Record<string, string> = { message: 'If that email is registered, a reset link has been issued.' };
  if (token) {
    const resetUrl = `${env.allowedOrigins[0]}/reset-password?token=${token}`;
    // No email provider is configured yet: the link is logged for the operator.
    // Outside production it is also returned so local development works end to end.
    logger.info({ email: req.body.email }, 'Password reset requested');
    if (!env.isProduction) body.devResetUrl = resetUrl;
  }
  res.json(body);
});

authRouter.post('/reset-password', authLimiter, validate(ResetPasswordSchema), async (req, res) => {
  const user = await auth.resetPassword(req.body.token, req.body.password);
  setSessionCookie(res, String(user._id), user.sessionVersion);
  res.json({ user: auth.publicUser(user) });
});

authRouter.post('/change-password', authenticate, authLimiter, validate(ChangePasswordSchema), async (req, res) => {
  const user = await auth.changePassword(userId(req), req.body.currentPassword, req.body.newPassword);
  setSessionCookie(res, String(user._id), user.sessionVersion);
  res.status(204).end();
});
