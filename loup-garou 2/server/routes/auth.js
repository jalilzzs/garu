const express = require('express');
const passport = require('../config/passport');
const { signToken, verifyToken } = require('../config/jwt');
const User = require('../src/models/User');

const router = express.Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function oauthCallback(req, res) {
  const token = signToken(req.user);
  res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
}

// ---- Google ----
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${CLIENT_URL}/login?error=google` }),
  oauthCallback
);

// ---- Facebook ----
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: `${CLIENT_URL}/login?error=facebook` }),
  oauthCallback
);

// ---- Apple ----
router.post(
  '/apple/callback',
  passport.authenticate('apple', { session: false, failureRedirect: `${CLIENT_URL}/login?error=apple` }),
  oauthCallback
);

// ---- Guest login ----
router.post('/guest', async (req, res) => {
  try {
    const { displayName } = req.body;
    const user = await User.create({
      authProvider: 'guest',
      isGuest: true,
      displayName: displayName?.trim().slice(0, 24) || `Guest${Math.floor(Math.random() * 100000)}`,
    });
    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create guest session.' });
  }
});

// ---- Current user ----
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided.' });
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

function sanitizeUser(user) {
  return {
    id: user._id,
    userId: user.userId,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isGuest: user.isGuest,
    xp: user.xp,
    level: user.level,
    rank: user.rank,
    stats: user.stats,
    language: user.language,
  };
}

module.exports = router;
