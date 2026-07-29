const Room = require('../models/Room');
const Match = require('../models/Match');
const { GameEngine, PHASES, WOLF_ROLES } = require('../game/GameEngine');
const { recommendComposition, validateComposition } = require('../game/roleBalancer');

// In-memory registry of live GameEngine instances, keyed by roomCode.
// Rooms/lobby data lives in Mongo; the *running match* state lives here
// for speed, and gets persisted to Match at key checkpoints.
const liveGames = new Map();

function registerGameSocket(io) {
  io.on('connection', (socket) => {
    const user = socket.user; // set by socketAuth middleware

    // ---------- LOBBY ----------

    socket.on('room:join', async ({ roomCode }, ack) => {
      try {
        const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
        if (!room) return ack?.({ ok: false, error: 'Room not found.' });
        if (room.status !== 'lobby') return ack?.({ ok: false, error: 'Game already in progress.' });
        if (room.players.length >= room.maxPlayers && !room.players.some(p => p.userId === user.userId)) {
          return ack?.({ ok: false, error: 'Room is full.' });
        }

        const existing = room.players.find((p) => p.userId === user.userId);
        if (existing) {
          existing.socketId = socket.id;
          existing.connected = true;
        } else {
          room.players.push({
            userId: user.userId,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isHost: false,
            isReady: false,
            socketId: socket.id,
            connected: true,
          });
        }
        await room.save();

        socket.join(roomCode.toUpperCase());
        socket.data.roomCode = roomCode.toUpperCase();

        io.to(roomCode.toUpperCase()).emit('room:update', publicRoomView(room));
        ack?.({ ok: true, room: publicRoomView(room) });
      } catch (err) {
        ack?.({ ok: false, error: 'Failed to join room.' });
      }
    });

    socket.on('room:setMaxPlayers', async ({ roomCode, maxPlayers }, ack) => {
      const room = await requireHost(roomCode, user.userId, ack);
      if (!room) return;
      room.maxPlayers = Math.max(4, Math.min(20, maxPlayers));
      // Re-run Smart Auto-Recommend whenever capacity changes.
      room.roleConfig = recommendComposition(room.players.length || room.maxPlayers);
      await room.save();
      io.to(roomCode.toUpperCase()).emit('room:update', publicRoomView(room));
      ack?.({ ok: true });
    });

    socket.on('room:setRoleConfig', async ({ roomCode, roleConfig }, ack) => {
      const room = await requireHost(roomCode, user.userId, ack);
      if (!room) return;
      const validation = validateComposition(roleConfig, room.players.length);
      if (!validation.valid) return ack?.({ ok: false, errors: validation.errors });
      room.roleConfig = roleConfig;
      await room.save();
      io.to(roomCode.toUpperCase()).emit('room:update', publicRoomView(room));
      ack?.({ ok: true });
    });

    socket.on('room:requestRecommend', async ({ roomCode }, ack) => {
      const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
      if (!room) return ack?.({ ok: false, error: 'Room not found.' });
      ack?.({ ok: true, recommended: recommendComposition(room.players.length) });
    });

    socket.on('room:invite', async ({ roomCode, targetUserId }) => {
      // Friend invite: relies on a presence map (targetUserId -> socketId) maintained
      // elsewhere (e.g. Redis in production); here we broadcast to a personal room
      // that each authenticated socket joins on connect (see below).
      io.to(`user:${targetUserId}`).emit('invite:received', {
        roomCode: roomCode.toUpperCase(),
        fromUserId: user.userId,
        fromDisplayName: user.displayName,
      });
    });

    socket.join(`user:${user.userId}`); // personal channel for invites/notifications

    socket.on('room:toggleReady', async ({ roomCode }, ack) => {
      const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
      if (!room) return ack?.({ ok: false, error: 'Room not found.' });
      const player = room.players.find((p) => p.userId === user.userId);
      if (!player) return ack?.({ ok: false, error: 'Not in this room.' });
      player.isReady = !player.isReady;
      await room.save();
      io.to(roomCode.toUpperCase()).emit('room:update', publicRoomView(room));
      ack?.({ ok: true });
    });

    // ---------- GAME START ----------

    socket.on('game:start', async ({ roomCode }, ack) => {
      const room = await requireHost(roomCode, user.userId, ack);
      if (!room) return;

      const validation = validateComposition(room.roleConfig, room.players.length);
      if (!validation.valid) return ack?.({ ok: false, errors: validation.errors });
      if (room.players.length < 4) return ack?.({ ok: false, error: 'Minimum 4 players required.' });

      const engine = new GameEngine({
        roomCode: room.roomCode,
        players: room.players.map((p) => ({ userId: p.userId, displayName: p.displayName })),
        roleConfig: room.roleConfig,
      });
      liveGames.set(room.roomCode, engine);

      room.status = 'in_progress';
      await room.save();

      const match = await Match.create({
        roomCode: room.roomCode,
        playerCount: room.players.length,
        players: engine.players.map((p) => ({ userId: p.userId, displayName: p.displayName, role: p.role })),
      });
      engine.matchId = match._id;

      // Privately push each player's own role.
      for (const p of room.players) {
        io.to(p.socketId).emit('game:yourRole', engine.getPrivateState(p.userId));
      }

      engine.startNight();
      io.to(room.roomCode).emit('game:phaseChange', engine.getPublicState());
      ack?.({ ok: true });

      scheduleNightResolution(io, room.roomCode);
    });

    // ---------- NIGHT ACTIONS ----------

    socket.on('game:nightAction', ({ roomCode, type, targetUserId }, ack) => {
      const engine = liveGames.get(roomCode.toUpperCase());
      if (!engine || engine.phase !== PHASES.NIGHT) return ack?.({ ok: false, error: 'Not night phase.' });
      const result = engine.submitNightAction(user.userId, type, targetUserId);
      ack?.(result);
    });

    // ---------- DAY VOTE ----------

    socket.on('game:vote', ({ roomCode, targetUserId }, ack) => {
      const engine = liveGames.get(roomCode.toUpperCase());
      if (!engine || engine.phase !== PHASES.DAY_VOTE) return ack?.({ ok: false, error: 'Not vote phase.' });
      const result = engine.submitVote(user.userId, targetUserId);
      ack?.(result);
      io.to(roomCode.toUpperCase()).emit('game:voteUpdate', { votes: engine.votes });
    });

    socket.on('game:hunterShot', ({ roomCode, targetUserId }, ack) => {
      const engine = liveGames.get(roomCode.toUpperCase());
      if (!engine) return ack?.({ ok: false, error: 'No active game.' });
      const result = engine.submitHunterShot(user.userId, targetUserId);
      ack?.(result);
      if (result.ok) io.to(roomCode.toUpperCase()).emit('game:phaseChange', engine.getPublicState());
    });

    // ---------- CHAT: phased + filtered ----------
    // channel: 'day' | 'wolf' | 'dead'
    socket.on('chat:send', ({ roomCode, channel, message }) => {
      const engine = liveGames.get(roomCode.toUpperCase());
      if (!engine) return;
      const player = engine.getPlayer(user.userId);
      if (!player) return;

      const payload = {
        channel,
        userId: user.userId,
        displayName: user.displayName,
        message: String(message).slice(0, 500),
        at: Date.now(),
      };

      if (channel === 'day') {
        // Only living players may speak in day chat, and only during day phases.
        if (!player.alive) return;
        if (![PHASES.DAY_DISCUSSION, PHASES.DAY_VOTE].includes(engine.phase)) return;
        io.to(roomCode.toUpperCase()).emit('chat:message', payload);
      } else if (channel === 'wolf') {
        if (!player.alive || !WOLF_ROLES.has(player.role)) return;
        if (engine.phase !== PHASES.NIGHT) return;
        // Deliver only to alive wolves, via their personal user-channel room.
        emitToUserIds(io, engine.aliveWolves().map((w) => w.userId), 'chat:message', payload);
      } else if (channel === 'dead') {
        if (player.alive) return; // only ghosts talk here
        emitToUserIds(
          io,
          engine.players.filter((p) => !p.alive).map((p) => p.userId),
          'chat:message',
          payload
        );
      }
    });

    socket.on('disconnect', async () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      const room = await Room.findOne({ roomCode });
      if (!room) return;
      const player = room.players.find((p) => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        await room.save();
        io.to(roomCode).emit('room:update', publicRoomView(room));
      }
    });
  });
}

// ---------- helpers ----------

async function requireHost(roomCode, userId, ack) {
  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) {
    ack?.({ ok: false, error: 'Room not found.' });
    return null;
  }
  if (room.hostUserId !== userId) {
    ack?.({ ok: false, error: 'Only the host can do that.' });
    return null;
  }
  return room;
}

function publicRoomView(room) {
  return {
    roomCode: room.roomCode,
    hostUserId: room.hostUserId,
    maxPlayers: room.maxPlayers,
    status: room.status,
    roleConfig: room.roleConfig,
    players: room.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      isHost: p.isHost,
      isReady: p.isReady,
      connected: p.connected,
    })),
  };
}

/** Emits an event only to sockets belonging to the given userIds, via their personal room. */
function emitToUserIds(io, userIds, event, payload) {
  for (const uid of userIds) {
    io.to(`user:${uid}`).emit(event, payload);
  }
}

/**
 * Drives the night -> reveal -> discussion -> vote -> resolve loop on a timer.
 * In production this should be resilient to server restarts (e.g. persisted
 * deadlines + a recovery sweep on boot); shown here as a straightforward
 * setTimeout chain for clarity.
 */
function scheduleNightResolution(io, roomCode) {
  const engine = liveGames.get(roomCode);
  if (!engine) return;

  setTimeout(async () => {
    if (!liveGames.has(roomCode) || engine.phase !== PHASES.NIGHT) return;
    const results = engine.resolveNight();
    io.to(roomCode).emit('game:nightResults', results);
    io.to(roomCode).emit('game:phaseChange', engine.getPublicState());

    // Push updated private seer reveals only to the seer.
    for (const reveal of results.seerReveals) {
      io.to(`user:${reveal.seerUserId}`).emit('game:seerReveal', reveal);
    }

    if (engine.checkWinCondition()) {
      return finalizeGame(io, roomCode);
    }

    if (engine.pendingHunterShot) {
      // Wait for the hunter's shot before moving on; the client fires
      // 'game:hunterShot' which itself triggers day discussion afterward.
      setTimeout(() => proceedToDiscussion(io, roomCode), 20_000);
      return;
    }

    proceedToDiscussion(io, roomCode);
  }, engine.nightDurationMs);
}

function proceedToDiscussion(io, roomCode) {
  const engine = liveGames.get(roomCode);
  if (!engine || engine.phase === PHASES.FINISHED) return;

  engine.startDayDiscussion();
  io.to(roomCode).emit('game:phaseChange', engine.getPublicState());

  setTimeout(() => {
    if (!liveGames.has(roomCode)) return;
    engine.startVote();
    io.to(roomCode).emit('game:phaseChange', engine.getPublicState());

    setTimeout(async () => {
      if (!liveGames.has(roomCode)) return;
      const { eliminated } = engine.resolveVote();
      io.to(roomCode).emit('game:voteResult', { eliminated });
      io.to(roomCode).emit('game:phaseChange', engine.getPublicState());

      if (engine.checkWinCondition()) {
        return finalizeGame(io, roomCode);
      }

      if (engine.pendingHunterShot) {
        setTimeout(() => {
          engine.startNight();
          io.to(roomCode).emit('game:phaseChange', engine.getPublicState());
          scheduleNightResolution(io, roomCode);
        }, 20_000);
        return;
      }

      engine.startNight();
      io.to(roomCode).emit('game:phaseChange', engine.getPublicState());
      scheduleNightResolution(io, roomCode);
    }, engine.voteDurationMs);
  }, engine.dayDurationMs);
}

async function finalizeGame(io, roomCode) {
  const engine = liveGames.get(roomCode);
  if (!engine) return;

  io.to(roomCode).emit('game:over', {
    winner: engine.winner,
    finalRoles: engine.players.map((p) => ({ userId: p.userId, role: p.role, alive: p.alive })),
  });

  await Match.findByIdAndUpdate(engine.matchId, {
    winner: engine.winner,
    endedAt: new Date(),
    players: engine.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      role: p.role,
      alive: p.alive,
      infected: p.infected,
    })),
  });

  await Room.findOneAndUpdate({ roomCode }, { status: 'finished' });
  liveGames.delete(roomCode);

  await awardPostGameXp(engine);
}

async function awardPostGameXp(engine) {
  const User = require('../models/User');
  for (const p of engine.players) {
    const won =
      (engine.winner === 'wolves' && WOLF_ROLES.has(p.role)) ||
      (engine.winner === 'village' && !WOLF_ROLES.has(p.role));
    const xpGain = won ? 150 : 50;

    const user = await User.findOne({ userId: p.userId });
    if (!user) continue;
    user.addXp(xpGain);
    user.stats.gamesPlayed += 1;
    if (won) user.stats.gamesWon += 1;
    if (WOLF_ROLES.has(p.role) && won) user.stats.wolfWins += 1;
    if (!WOLF_ROLES.has(p.role) && won) user.stats.villageWins += 1;
    await user.save();
  }
}

module.exports = { registerGameSocket, liveGames };
