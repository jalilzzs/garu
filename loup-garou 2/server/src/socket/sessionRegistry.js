/**
 * In-memory registry of live game sessions, keyed by room code.
 *
 * A "session" bundles the authoritative GameEngine instance with the
 * socket-facing bookkeeping needed to route events: which socket belongs
 * to which seated player, and the room's Mongo _id for later persistence.
 *
 * This is intentionally NOT the source of truth for lobby state (that's
 * the Room mongoose document) — it only exists once a match has started.
 */
const sessions = new Map();

export function createSession(roomCode, { roomId, engine }) {
  const session = {
    roomId,
    engine,
    sockets: new Map(), // userId -> socket.id
  };
  sessions.set(roomCode, session);
  return session;
}

export function getSession(roomCode) {
  return sessions.get(roomCode);
}

export function endSession(roomCode) {
  sessions.delete(roomCode);
}

export function bindSocket(roomCode, userId, socketId) {
  const session = sessions.get(roomCode);
  if (session) session.sockets.set(userId, socketId);
}

export function unbindSocket(roomCode, userId) {
  const session = sessions.get(roomCode);
  if (session) session.sockets.delete(userId);
}
