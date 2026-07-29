import Room from '../models/Room.js';
import Match from '../models/Match.js';
import User from '../models/User.js';
import { GameEngine } from '../game/GameEngine.js';
import { assignRoles } from '../game/assignRoles.js';
import {
  createSession,
  getSession,
  endSession,
  bindSocket,
  unbindSocket,
} from './sessionRegistry.js';
import { buildNightPayload, buildDayPayload } from './payloadFilter.js';
import {
  channelName,
  computeChannelMembership,
  prepareChatMessage,
} from './chatChannels.js';

/**
 * Joins the socket to the socket.io rooms matching current channel
 * membership, leaving any stale channel rooms first. Call after every
 * phase transition or death.
 */
function syncChannelMembership(io, roomCode, engine) {
  const membership = computeChannelMembership(engine);

  for (const p of engine.players) {
    const socketId = getSession(roomCode)?.sockets.get(p.userId);
    if (!socketId) continue;
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    socket.leave(channelName(roomCode, 'day'));
    socket.leave(channelName(roomCode, 'wolves'));
    socket.leave(channelName(roomCode, 'dead'));

    if (membership.day.includes(p.userId)) socket.join(channelName(roomCode, 'day'));
    if (membership.wolves.includes(p.userId)) socket.join(channelName(roomCode, 'wolves'));
    if (membership.dead.includes(p.userId)) socket.join(channelName(roomCode, 'dead'));
  }
}

/** Emits the (per-viewer, role-filtered) game state to every connected player. */
function broadcastGameState(io, roomCode, engine) {
  const session = getSession(roomCode);
  if (!session) return;

  for (const p of engine.players) {
    const socketId = session.sockets.get(p.userId);
    if (!socketId) continue;
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    const payload =
      engine.phase === 'night'
        ? buildNightPayload(engine, p, engine.activeNightRoles())
        : buildDayPayload(engine, p);

    socket.emit('game:state', payload);
  }
}

export function registerGameHandlers(io, socket) {
  const { user } = socket;

  /* -------------------------------------------------------------- */
  /* Lobby: join room's socket channel for lobby-state pushes         */
  /* -------------------------------------------------------------- */
  socket.on('lobby:join', async ({ roomCode }, ack) => {
    try {
      const room = await Room.findOne({ code: roomCode?.toUpperCase() });
      if (!room) return ack?.({ ok: false, error: 'ROOM_NOT_FOUND' });

      socket.join(`lobby:${room.code}`);
      socket.data.roomCode = room.code;

      io.to(`lobby:${room.code}`).emit('lobby:update', room.toJSON());
      ack?.({ ok: true, room: room.toJSON() });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  /* -------------------------------------------------------------- */
  /* Host starts the match                                            */
  /* -------------------------------------------------------------- */
  socket.on('game:start', async ({ roomCode }, ack) => {
    try {
      const room = await Room.findOne({ code: roomCode?.toUpperCase() });
      if (!room) return ack?.({ ok: false, error: 'ROOM_NOT_FOUND' });
      if (room.host.toString() !== user.id) {
        return ack?.({ ok: false, error: 'ONLY_HOST_CAN_START' });
      }
      if (room.seats.length < room.minPlayers) {
        return ack?.({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
      }

      const assignment = assignRoles(room.seats, room.roleConfig);
      if (!assignment.ok) {
        return ack?.({ ok: false, error: 'INVALID_ROLE_CONFIG', details: assignment.errors });
      }

      const players = room.seats.map((s) => ({
        user: s.user,
        userId: s.userId,
        displayName: s.displayName,
        role: assignment.assignment[s.userId],
      }));

      const engine = new GameEngine(players);
      createSession(room.code, { roomId: room._id, engine });

      room.status = 'in_progress';
      await room.save();

      // Bind every currently-connected socket in the lobby room to the
      // session so night/day broadcasts can reach them.
      const lobbySockets = await io.in(`lobby:${room.code}`).fetchSockets();
      for (const s of lobbySockets) {
        if (s.user) bindSocket(room.code, s.user.userId, s.id);
      }

      engine.startNight();
      syncChannelMembership(io, room.code, engine);
      broadcastGameState(io, room.code, engine);

      io.to(`lobby:${room.code}`).emit('game:started', { roomCode: room.code });
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  /* -------------------------------------------------------------- */
  /* Binding a socket to a running session on (re)connect              */
  /* -------------------------------------------------------------- */
  socket.on('game:resume', ({ roomCode }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });

    bindSocket(roomCode, user.userId, socket.id);
    socket.data.roomCode = roomCode;
    syncChannelMembership(io, roomCode, session.engine);

    const viewer = session.engine.findPlayer(user.userId);
    if (!viewer) return ack?.({ ok: false, error: 'NOT_IN_MATCH' });

    const payload =
      session.engine.phase === 'night'
        ? buildNightPayload(session.engine, viewer, session.engine.activeNightRoles())
        : buildDayPayload(session.engine, viewer);

    ack?.({ ok: true, state: payload });
  });

  /* -------------------------------------------------------------- */
  /* Night actions                                                     */
  /* -------------------------------------------------------------- */
  socket.on('game:nightAction', ({ roomCode, action }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });

    const { engine } = session;
    const player = engine.findPlayer(user.userId);
    if (!player || !player.alive) return ack?.({ ok: false, error: 'NOT_ALIVE' });
    if (engine.phase !== 'night') return ack?.({ ok: false, error: 'NOT_NIGHT_PHASE' });
    if (!engine.activeNightRoles().includes(player.role)) {
      return ack?.({ ok: false, error: 'ROLE_HAS_NO_NIGHT_ACTION' });
    }

    engine.submitNightAction(player.role, action);
    ack?.({ ok: true });

    // If every active role has submitted, auto-resolve the night.
    const stillWaiting = engine
      .activeNightRoles()
      .some((role) => engine._nightSubmissions[role] === undefined);

    if (!stillWaiting) {
      const result = engine.resolveNight();
      syncChannelMembership(io, roomCode, engine);
      broadcastGameState(io, roomCode, engine);
      io.to(`lobby:${roomCode}`).emit('game:nightResolved', result);

      if (result.winCheck.over) {
        finalizeMatch(io, roomCode, session);
      } else {
        maybePromptChasseur(io, roomCode, engine);
      }
    }
  });

  /* -------------------------------------------------------------- */
  /* Day: move to vote, cast a vote, resolve lynch                    */
  /* -------------------------------------------------------------- */
  socket.on('game:startVote', ({ roomCode }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });
    session.engine.startVote();
    broadcastGameState(io, roomCode, session.engine);
    ack?.({ ok: true });
  });

  socket.on('game:vote', ({ roomCode, targetUserId }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });
    const { engine } = session;

    const voter = engine.findPlayer(user.userId);
    if (!voter || !voter.alive) return ack?.({ ok: false, error: 'NOT_ALIVE' });
    if (engine.phase !== 'day_vote') return ack?.({ ok: false, error: 'NOT_VOTE_PHASE' });

    session.votes = session.votes || {};
    session.votes[user.userId] = targetUserId;
    io.to(`lobby:${roomCode}`).emit('game:voteCast', { from: user.userId });
    ack?.({ ok: true });
  });

  socket.on('game:resolveLynch', ({ roomCode }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });
    const { engine } = session;

    const result = engine.resolveLynch(session.votes || {});
    session.votes = {};
    syncChannelMembership(io, roomCode, engine);
    broadcastGameState(io, roomCode, engine);
    io.to(`lobby:${roomCode}`).emit('game:lynchResolved', result);

    if (result.winCheck.over) {
      finalizeMatch(io, roomCode, session);
    } else {
      maybePromptChasseur(io, roomCode, engine);
    }
    ack?.({ ok: true });
  });

  socket.on('game:chasseurShot', ({ roomCode, targetUserId }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });
    const { engine } = session;

    if (engine.pendingChasseurShot !== user.userId) {
      return ack?.({ ok: false, error: 'NO_PENDING_SHOT' });
    }

    const result = engine.resolveChasseurShot(user.userId, targetUserId);
    syncChannelMembership(io, roomCode, engine);
    broadcastGameState(io, roomCode, engine);
    io.to(`lobby:${roomCode}`).emit('game:chasseurResolved', result);

    if (result?.winCheck.over) finalizeMatch(io, roomCode, session);
    ack?.({ ok: true });
  });

  /* -------------------------------------------------------------- */
  /* Chat: day / wolf / dead channels                                  */
  /* -------------------------------------------------------------- */
  socket.on('chat:send', ({ roomCode, channel, text }, ack) => {
    const session = getSession(roomCode);
    if (!session) return ack?.({ ok: false, error: 'NO_ACTIVE_SESSION' });
    const { engine } = session;

    const player = engine.findPlayer(user.userId);
    if (!player) return ack?.({ ok: false, error: 'NOT_IN_MATCH' });

    try {
      const message = prepareChatMessage(engine, player, { channel, text });
      io.to(channelName(roomCode, channel)).emit('chat:message', message);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  /* -------------------------------------------------------------- */
  /* Disconnect                                                        */
  /* -------------------------------------------------------------- */
  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (roomCode) unbindSocket(roomCode, user.userId);
  });
}

/** If the just-eliminated player was a Chasseur, notify them of their shot window. */
function maybePromptChasseur(io, roomCode, engine) {
  if (!engine.pendingChasseurShot) return;
  const session = getSession(roomCode);
  const socketId = session?.sockets.get(engine.pendingChasseurShot);
  if (!socketId) return;
  const socket = io.sockets.sockets.get(socketId);
  socket?.emit('game:chasseurPrompt', {
    alive: engine.alivePlayers().map((p) => p.userId),
  });
}

async function finalizeMatch(io, roomCode, session) {
  const { engine, roomId } = session;

  try {
    const match = await Match.create({
      room: roomId,
      roomCode,
      playerCount: engine.players.length,
      roleConfig: [], // populated from Room.roleConfig by caller if desired
      results: engine.toMatchResults(),
      events: engine.events,
      winningTeam: engine.winningTeam,
      endedAt: new Date(),
    });

    // Award simple XP: winners get more, everyone gets participation XP.
    for (const result of engine.toMatchResults()) {
      if (!result.user) continue;
      const xpGain = result.isWinner ? 150 : 40;
      await User.findByIdAndUpdate(result.user, {
        $inc: { 'stats.gamesPlayed': 1, 'stats.gamesWon': result.isWinner ? 1 : 0, xp: xpGain },
      });
    }

    await Room.findByIdAndUpdate(roomId, { status: 'finished', currentMatch: match._id });

    io.to(`lobby:${roomCode}`).emit('game:ended', {
      winningTeam: engine.winningTeam,
      matchId: match._id.toString(),
    });
  } catch (err) {
    console.error('[finalizeMatch] failed:', err);
  } finally {
    endSession(roomCode);
  }
}
