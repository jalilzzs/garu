import User from '../models/User.js';
import FriendRequest, { RoomInvite } from '../models/FriendRequest.js';

/**
 * Tracks userId -> socket.id for online presence, independent of any
 * game session. Used to push friend requests / room invites live to a
 * connected recipient; if they're offline, the DB record (created via
 * the REST endpoints in user.routes.js) is still there for them to see
 * next time they fetch /api/users/me/friends or their pending invites.
 */
const onlineUsers = new Map();

export function registerFriendHandlers(io, socket) {
  const { user } = socket;

  onlineUsers.set(user.userId, socket.id);
  io.emit('presence:online', { userId: user.userId });

  socket.on('friend:request', async ({ targetUserId }, ack) => {
    try {
      const target = await User.findOne({ userId: targetUserId });
      if (!target) return ack?.({ ok: false, error: 'USER_NOT_FOUND' });
      if (target.userId === user.userId) return ack?.({ ok: false, error: 'CANNOT_FRIEND_SELF' });

      const request = await FriendRequest.findOneAndUpdate(
        { from: user.id, to: target._id },
        { status: 'pending' },
        { upsert: true, new: true }
      );

      const targetSocketId = onlineUsers.get(target.userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend:requestReceived', {
          requestId: request._id.toString(),
          from: { userId: user.userId, displayName: user.displayName },
        });
      }

      ack?.({ ok: true, requestId: request._id.toString() });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on('friend:respond', async ({ requestId, accept }, ack) => {
    try {
      const request = await FriendRequest.findOne({ _id: requestId, to: user.id, status: 'pending' });
      if (!request) return ack?.({ ok: false, error: 'REQUEST_NOT_FOUND' });

      request.status = accept ? 'accepted' : 'declined';
      await request.save();

      if (accept) {
        await User.findByIdAndUpdate(request.from, { $addToSet: { friends: request.to } });
        await User.findByIdAndUpdate(request.to, { $addToSet: { friends: request.from } });
      }

      const requester = await User.findById(request.from);
      const requesterSocketId = requester && onlineUsers.get(requester.userId);
      if (requesterSocketId) {
        io.to(requesterSocketId).emit('friend:requestResolved', {
          requestId,
          accepted: accept,
          by: { userId: user.userId, displayName: user.displayName },
        });
      }

      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  /**
   * Real-time room invite: pushes a live "come join my room" prompt to a
   * friend if they're online, in addition to the persisted RoomInvite
   * record (10 min TTL) created here.
   */
  socket.on('invite:room', async ({ targetUserId, roomCode }, ack) => {
    try {
      const target = await User.findOne({ userId: targetUserId });
      if (!target) return ack?.({ ok: false, error: 'USER_NOT_FOUND' });

      const invite = await RoomInvite.create({
        from: user.id,
        to: target._id,
        roomCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const targetSocketId = onlineUsers.get(target.userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('invite:roomReceived', {
          inviteId: invite._id.toString(),
          roomCode,
          from: { userId: user.userId, displayName: user.displayName },
        });
      }

      ack?.({ ok: true, delivered: Boolean(targetSocketId) });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    if (onlineUsers.get(user.userId) === socket.id) {
      onlineUsers.delete(user.userId);
      io.emit('presence:offline', { userId: user.userId });
    }
  });
}

export function isUserOnline(userId) {
  return onlineUsers.has(userId);
}
