const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const Room = require('../src/models/Room');
const User = require('../src/models/User');
const { recommendComposition, validateComposition } = require('../game/roleBalancer');

const router = express.Router();

router.use(requireAuth);

// إنشاء غرفة
router.post('/', async (req, res) => {
  try {
    const { maxPlayers = 8, isPrivate = false } = req.body;

    const user = await User.findById(req.auth.sub);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const room = await Room.create({
      hostUserId: user.userId,
      maxPlayers,
      isPrivate,
      roleConfig: recommendComposition(Math.max(4, Math.min(maxPlayers, 20))),
      players: [
        {
          userId: user.userId,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isHost: true,
          isReady: true,
        },
      ],
    });

    return res.status(201).json({ room });
  } catch (err) {
    console.error('CREATE ROOM ERROR:', err);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
});

// جلب غرفة
router.get('/:roomCode', async (req, res) => {
  try {
    const room = await Room.findOne({
      roomCode: req.params.roomCode.toUpperCase(),
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    res.json({ room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// اقتراح الأدوار
router.get('/recommend/:playerCount', (req, res) => {
  const count = parseInt(req.params.playerCount, 10);

  if (Number.isNaN(count) || count < 4 || count > 20) {
    return res.status(400).json({
      error: 'Player count must be between 4 and 20.',
    });
  }

  res.json({
    recommended: recommendComposition(count),
  });
});

// التحقق من الأدوار
router.post('/:roomCode/validate-roles', async (req, res) => {
  try {
    const room = await Room.findOne({
      roomCode: req.params.roomCode.toUpperCase(),
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const result = validateComposition(
      req.body.roleConfig,
      room.players.length
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
