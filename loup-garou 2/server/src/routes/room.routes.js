import { Router } from 'express';

import Room from '../models/Room.js';
import User from '../models/User.js';
import { requireAuth } from '../config/jwt.js';
import { recommendRoles, validateRoleConfig } from '../game/autoRecommend.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, scope: 'room' }));

/**
 * Smart Auto-Recommend — given a player count, returns the suggested
 * balanced role composition. Pure computation, no DB write; the client
 * calls this live as the host adjusts capacity in the lobby.
 */
router.get('/auto-recommend', (req, res) => {
  const playerCount = parseInt(req.query.playerCount, 10);
  if (!Number.isFinite(playerCount) || playerCount < 4 || playerCount > 20) {
    return res.status(400).json({ ok: false, error: 'playerCount must be between 4 and 20' });
  }
  res.json({ ok: true, recommendation: recommendRoles(playerCount) });
});

/** Validates a host's manually-edited role config before allowing game start. */
router.post('/validate-role-config', (req, res) => {
  const { roleConfig, playerCount } = req.body || {};
  if (!Array.isArray(roleConfig) || !Number.isFinite(playerCount)) {
    return res.status(400).json({ ok: false, error: 'roleConfig array and playerCount are required' });
  }
  res.json({ ok: true, validation: validateRoleConfig(roleConfig, playerCount) });
});

/* ---------------------------------------------------------------------- */
/* Lobby lifecycle                                                          */
/* ---------------------------------------------------------------------- */

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { minPlayers = 4, maxPlayers = 20, isPrivate = true, language = 'en' } = req.body || {};

    if (minPlayers < 4 || maxPlayers > 20 || minPlayers > maxPlayers) {
      return res.status(400).json({ ok: false, error: 'Player capacity must be within 4-20.' });
    }

    const host = await User.findById(req.auth.sub);
    if (!host) return res.status(404).json({ ok: false, error: 'Host user not found' });

    const room = await Room.create({
      host: host._id,
      minPlayers,
      maxPlayers,
      isPrivate,
      language,
      seats: [
        {
          user: host._id,
          userId: host.userId,
          displayName: host.displayName,
          isHost: true,
          seatIndex: 0,
        },
      ],
      // Seed with a recommendation for the minimum capacity; host can
      // adjust as more players join.
      roleConfig: recommendRoles(minPlayers).roleConfig,
      autoRecommended: true,
    });

    res.status(201).json({ ok: true, room: room.toJSON() });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
    res.json({ ok: true, room: room.toJSON() });
  } catch (err) {
    next(err);
  }
});

router.post('/:code/join', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
    if (room.status !== 'lobby') {
      return res.status(400).json({ ok: false, error: 'Room is not accepting new players' });
    }
    if (room.seats.length >= room.maxPlayers) {
      return res.status(400).json({ ok: false, error: 'Room is full' });
    }

    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const alreadySeated = room.seats.some((s) => s.userId === user.userId);
    if (!alreadySeated) {
      room.seats.push({
        user: user._id,
        userId: user.userId,
        displayName: user.displayName,
        seatIndex: room.seats.length,
      });

      // Keep the auto-recommend suggestion in sync with the live player
      // count, but only while the host hasn't hand-edited the config.
      if (room.autoRecommended) {
        room.roleConfig = recommendRoles(room.seats.length).roleConfig;
      }

      await room.save();
    }

    res.json({ ok: true, room: room.toJSON() });
  } catch (err) {
    next(err);
  }
});

/** Host-only: manually override the role toggles, turning off auto-recommend. */
router.patch('/:code/roles', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });

    const isHost = room.host.toString() === req.auth.sub;
    if (!isHost) return res.status(403).json({ ok: false, error: 'Only the host can edit roles' });

    const { roleConfig } = req.body || {};
    const validation = validateRoleConfig(roleConfig, room.seats.length);
    if (!validation.valid) {
      return res.status(400).json({ ok: false, error: 'Invalid role config', details: validation.errors });
    }

    room.roleConfig = roleConfig;
    room.autoRecommended = false;
    await room.save();

    res.json({ ok: true, room: room.toJSON() });
  } catch (err) {
    next(err);
  }
});

/** Host-only: revert to the Smart Auto-Recommend suggestion for current capacity. */
router.post('/:code/roles/auto', requireAuth, async (req, res, next) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });

    const isHost = room.host.toString() === req.auth.sub;
    if (!isHost) return res.status(403).json({ ok: false, error: 'Only the host can edit roles' });

    room.roleConfig = recommendRoles(room.seats.length).roleConfig;
    room.autoRecommended = true;
    await room.save();

    res.json({ ok: true, room: room.toJSON() });
  } catch (err) {
    next(err);
  }
});

export default router;
