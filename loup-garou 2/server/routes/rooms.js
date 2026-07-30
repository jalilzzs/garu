const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const Room = require('../src/models/Room');
const User = require('../src/models/User');
const { recommendComposition, validateComposition } = require('../game/roleBalancer');

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  const { maxPlayers = 8, isPrivate = false } = req.body;
  const user = await User.findById(req.auth.sub);

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

  res.status(201).json({ room });
});

router.get('/:roomCode', async (req, res) => {
  const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() });
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  res.json({ room });
});

// Recompute the Smart Auto-Recommend suggestion for a given player count
router.get('/recommend/:playerCount', (req, res) => {
  const count = parseInt(req.params.playerCount, 10);
  if (Number.isNaN(count) || count < 4 || count > 20) {
    return res.status(400).json({ error: 'Player count must be between 4 and 20.' });
  }
  res.json({ recommended: recommendComposition(count) });
});

// Validate a manual role composition before starting
router.post('/:roomCode/validate-roles', async (req, res) => {
  const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() });
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  const result = validateComposition(req.body.roleConfig, room.players.length);
  res.json(result);
});

module.exports = router;
