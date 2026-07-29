import { Router } from 'express';

import User from '../models/User.js';
import FriendRequest, { RoomInvite } from '../models/FriendRequest.js';
import Room from '../models/Room.js';
import { requireAuth } from '../config/jwt.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, scope: 'user' }));

/* ---------------------------------------------------------------------- */
/* Profile                                                                  */
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

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { displayName, preferredLanguage } = req.body || {};
    const update = {};
    if (displayName) update.displayName = String(displayName).trim().slice(0, 24);
    if (preferredLanguage && ['en', 'ar'].includes(preferredLanguage)) {
      update.preferredLanguage = preferredLanguage;
    }

    const user = await User.findByIdAndUpdate(req.auth.sub, update, { new: true });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

/** Public profile lookup by public userId (e.g. "LG-AB12CD34"), not Mongo _id. */
router.get('/:userId', async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------- */
/* Friends system                                                           */
/* ---------------------------------------------------------------------- */

router.get('/me/friends', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).populate('friends', 'userId displayName avatarUrl xp');
    res.json({ ok: true, friends: user?.friends || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/friends/request', requireAuth, async (req, res, next) => {
  try {
    const { targetUserId } = req.body || {};
    const target = await User.findOne({ userId: targetUserId });
    if (!target) return res.status(404).json({ ok: false, error: 'Target user not found' });
    if (target._id.toString() === req.auth.sub) {
      return res.status(400).json({ ok: false, error: 'Cannot friend yourself' });
    }

    const request = await FriendRequest.findOneAndUpdate(
      { from: req.auth.sub, to: target._id },
      { status: 'pending' },
      { upsert: true, new: true }
    );
    res.status(201).json({ ok: true, request });
  } catch (err) {
    next(err);
  }
});

router.post('/friends/respond', requireAuth, async (req, res, next) => {
  try {
    const { requestId, accept } = req.body || {};
    const request = await FriendRequest.findOne({ _id: requestId, to: req.auth.sub, status: 'pending' });
    if (!request) return res.status(404).json({ ok: false, error: 'Request not found' });

    request.status = accept ? 'accepted' : 'declined';
    await request.save();

    if (accept) {
      await User.findByIdAndUpdate(request.from, { $addToSet: { friends: request.to } });
      await User.findByIdAndUpdate(request.to, { $addToSet: { friends: request.from } });
    }

    res.json({ ok: true, request });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------------- */
/* Real-time room invites (delivery happens over sockets in Stage 5;        */
/* this just persists the invite record and validates the target room)     */
/* ---------------------------------------------------------------------- */

router.post('/invites/room', requireAuth, async (req, res, next) => {
  try {
    const { targetUserId, roomCode } = req.body || {};
    const [target, room] = await Promise.all([
      User.findOne({ userId: targetUserId }),
      Room.findOne({ code: roomCode }),
    ]);

    if (!target) return res.status(404).json({ ok: false, error: 'Target user not found' });
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });

    const invite = await RoomInvite.create({
      from: req.auth.sub,
      to: target._id,
      roomCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min TTL
    });

    res.status(201).json({ ok: true, invite });
  } catch (err) {
    next(err);
  }
});

export default router;
