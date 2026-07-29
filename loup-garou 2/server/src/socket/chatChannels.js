import { isWolf } from './payloadFilter.js';

/**
 * Three chat channels, each mapped to a socket.io room name derived from
 * the game room code:
 *  - day    `${code}:day`    — all LIVING players, only during day phases
 *  - wolves `${code}:wolves` — living wolves only, only during night
 *  - dead   `${code}:dead`   — all dead/eliminated players, always open
 *           (spectators effectively live here once eliminated)
 *
 * Membership is recomputed on every phase change and every death rather
 * than trusted from client state, so a disconnect/reconnect or a client
 * bug can never leak a message into a channel the player shouldn't be in.
 */

export function channelName(roomCode, channel) {
  return `${roomCode}:${channel}`;
}

/**
 * Determines which single channel a given player is allowed to SEND to
 * right now. Returns null if they have no valid channel to speak in
 * (e.g. a living non-wolf during the night phase).
 */
export function allowedSendChannel(engine, player) {
  if (!player.alive) return 'dead';

  const isNight = engine.phase === 'night';
  if (isNight) {
    return isWolf(player.role) ? 'wolves' : null;
  }
  // day_discussion or day_vote
  return 'day';
}

/**
 * Recomputes full channel membership for the current engine state.
 * Returns { day: [userId...], wolves: [userId...], dead: [userId...] }.
 */
export function computeChannelMembership(engine) {
  const day = [];
  const wolves = [];
  const dead = [];

  for (const p of engine.players) {
    if (!p.alive) {
      dead.push(p.userId);
      continue;
    }
    day.push(p.userId); // living players always see day chat (read access),
    if (isWolf(p.role)) wolves.push(p.userId);
  }

  return { day, wolves, dead };
}

/**
 * Validates and shapes a chat message before it's broadcast. Throws a
 * descriptive error the socket handler can turn into an error ack rather
 * than silently dropping the message.
 */
export function prepareChatMessage(engine, player, { channel, text }) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('EMPTY_MESSAGE');
  }
  const trimmed = text.trim().slice(0, 500);

  const allowed = allowedSendChannel(engine, player);
  if (!allowed || allowed !== channel) {
    throw new Error('CHANNEL_NOT_ALLOWED');
  }

  return {
    channel,
    from: player.userId,
    displayName: player.displayName,
    text: trimmed,
    at: new Date().toISOString(),
  };
}
