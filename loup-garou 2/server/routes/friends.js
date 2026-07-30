const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const User = require('../src/models/User');

const router = express.Router();
router.use(requireAuth);

// List friends + pending requests
router.get('/', async (req, res) => {
  const user = await User.findById(req.auth.sub)
    .populate('friends', 'userId displayName avatarUrl rank level')
    .populate('friendRequests.from', 'userId displayName avatarUrl rank level');
  res.json({
    friends: user.friends,
    pendingRequests: user.friendRequests,
  });
});

// Send a friend request by target userId (public UUID, not Mongo _id)
router.post('/request/:targetUserId', async (req, res) => {
  const target = await User.findOne({ userId: req.params.targetUserId });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target._id.equals(req.auth.sub)) return res.status(400).json({ error: 'Cannot friend yourself.' });

  const already = target.friendRequests.some((r) => r.from.equals(req.auth.sub));
  if (!already) {
    target.friendRequests.push({ from: req.auth.sub });
    await target.save();
  }
  res.json({ ok: true });
});

// Accept a friend request
router.post('/accept/:requesterUserId', async (req, res) => {
  const requester = await User.findOne({ userId: req.params.requesterUserId });
  if (!requester) return res.status(404).json({ error: 'User not found.' });

  const me = await User.findById(req.auth.sub);
  me.friendRequests = me.friendRequests.filter((r) => !r.from.equals(requester._id));
  if (!me.friends.some((f) => f.equals(requester._id))) me.friends.push(requester._id);
  if (!requester.friends.some((f) => f.equals(me._id))) requester.friends.push(me._id);

  await me.save();
  await requester.save();
  res.json({ ok: true });
});

// Remove a friend
router.delete('/:friendUserId', async (req, res) => {
  const friend = await User.findOne({ userId: req.params.friendUserId });
  if (!friend) return res.status(404).json({ error: 'User not found.' });

  const me = await User.findById(req.auth.sub);
  me.friends = me.friends.filter((f) => !f.equals(friend._id));
  friend.friends = friend.friends.filter((f) => !f.equals(me._id));

  await me.save();
  await friend.save();
  res.json({ ok: true });
});

module.exports = router;
