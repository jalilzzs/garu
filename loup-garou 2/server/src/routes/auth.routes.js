import { Router } from 'express';
import passport from 'passport';
import { nanoid } from 'nanoid';

import User from '../models/User.js';
import { signToken, requireAuth } from '../config/jwt.js';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

router.get('/health', (_req, res) => res.json({ ok: true, scope: 'auth' }));

/* ---------------------------------------------------------------------- */
/* Guest login — no provider, instant JWT-backed profile                   */
/* ---------------------------------------------------------------------- */
router.post('/guest', async (req, res, next) => {
  try {
    const requestedName = (req.body?.displayName || '').trim();
    const displayName = requestedName
      ? requestedName.slice(0, 24)
      : `Guest${nanoid(5)}`;

    const user = await User.create({
      displayName,
      isGuest: true,
      authProviders: [{ provider: 'guest', providerId: nanoid(16) }],
    });

    const token = signToken(user);
    res.status(201).json({ ok: true, token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------- */
/* Google                                                                   */
/* ---------------------------------------------------------------------- */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${CLIENT_URL}/login?error=google` }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
  }
);

/* ---------------------------------------------------------------------- */
/* Facebook                                                                 */
/* ---------------------------------------------------------------------- */
router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'], session: false })
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: `${CLIENT_URL}/login?error=facebook` }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
  }
);

/* ---------------------------------------------------------------------- */
/* Apple                                                                    */
/* ---------------------------------------------------------------------- */
router.get('/apple', passport.authenticate('apple', { session: false }));

// Apple posts back (form_post response_mode), not a GET redirect.
router.post(
  '/apple/callback',
  passport.authenticate('apple', { session: false, failureRedirect: `${CLIENT_URL}/login?error=apple` }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
  }
);

/* ---------------------------------------------------------------------- */
/* Current session                                                          */
/* ---------------------------------------------------------------------- */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export default router;
