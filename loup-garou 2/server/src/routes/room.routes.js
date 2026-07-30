const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const Room = require('../src/models/Room').default;
const User = require('../src/models/User').default;

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { maxPlayers = 8, isPrivate = false } = req.body;

    const user = await User.findById(req.auth.sub);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const room = await Room.create({
      host: user._id,
      minPlayers: 4,
      maxPlayers,
      isPrivate,

      roleConfig: [
        { role: 'villageois', count: 3 },
        { role: 'loup_garou', count: 1 }
      ],

      seats: [
        {
          user: user._id,
          userId: user.userId,
          displayName: user.displayName,
          seatIndex: 0,
          isHost: true,
          isReady: true,
          connected: true
        }
      ]
    });

    res.status(201).json({ room });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

router.get('/:roomCode', async (req, res) => {
  try {
    const room = await Room.findOne({
      code: req.params.roomCode.toUpperCase()
    });

    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }

    res.json({ room });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;
