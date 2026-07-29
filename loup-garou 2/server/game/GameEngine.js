const { v4: uuidv4 } = require('uuid');

/**
 * GameEngine holds authoritative in-memory state for a single running match.
 * Persisted snapshots are written to the Match model at key transitions.
 * This class never sends sockets directly — it returns plain result objects;
 * the socket layer decides what to broadcast to whom (payload filtering
 * happens there, using engine helpers like getPublicState / getPrivateState).
 */

const PHASES = {
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY_REVEAL: 'day_reveal', // announce night deaths
  DAY_DISCUSSION: 'day_discussion',
  DAY_VOTE: 'day_vote',
  FINISHED: 'finished',
};

const ROLES = {
  VILLAGEOIS: 'villageois',
  LOUP_GAROU: 'loup_garou',
  VOYANTE: 'voyante',
  SORCIERE: 'sorciere',
  CHASSEUR: 'chasseur',
  LOUP_GAROU_NOIR: 'loup_garou_noir',
};

const WOLF_ROLES = new Set([ROLES.LOUP_GAROU, ROLES.LOUP_GAROU_NOIR]);

class GameEngine {
  constructor({ roomCode, players, roleConfig, dayDurationMs = 90_000, nightDurationMs = 45_000, voteDurationMs = 45_000 }) {
    this.roomCode = roomCode;
    this.matchId = null;
    this.dayNumber = 0;
    this.phase = PHASES.LOBBY;
    this.dayDurationMs = dayDurationMs;
    this.nightDurationMs = nightDurationMs;
    this.voteDurationMs = voteDurationMs;
    this.phaseDeadline = null;

    this.players = this.assignRoles(players, roleConfig);
    this.sorciereCharges = { heal: 1, poison: 1 };
    this.nightActions = {}; // userId -> action payload for current night
    this.votes = {}; // userId -> targetUserId for current day vote
    this.pendingHunterShot = null; // userId of hunter who must fire
    this.winner = null;
    this.eventLog = [];
  }

  assignRoles(players, roleConfig) {
    const pool = [];
    for (const [key, count] of Object.entries(roleConfig)) {
      const roleName = camelToSnakeRole(key);
      for (let i = 0; i < count; i++) pool.push(roleName);
    }
    shuffle(pool);

    return players.map((p, i) => ({
      userId: p.userId,
      displayName: p.displayName,
      role: pool[i],
      alive: true,
      infected: false,
      protectedTonight: false,
    }));
  }

  getPlayer(userId) {
    return this.players.find((p) => p.userId === userId);
  }

  aliveWolves() {
    return this.players.filter((p) => p.alive && WOLF_ROLES.has(p.role));
  }

  aliveVillage() {
    return this.players.filter((p) => p.alive && !WOLF_ROLES.has(p.role));
  }

  // ---------- Phase transitions ----------

  startNight() {
    this.dayNumber += 1;
    this.phase = PHASES.NIGHT;
    this.nightActions = {};
    for (const p of this.players) p.protectedTonight = false;
    this.phaseDeadline = Date.now() + this.nightDurationMs;
    this.log('night_start', { dayNumber: this.dayNumber });
  }

  /**
   * Submit a night action. type: 'wolf_kill' | 'seer_check' | 'witch_heal' |
   * 'witch_poison' | 'wolf_noir_infect'
   */
  submitNightAction(userId, type, targetUserId) {
    const actor = this.getPlayer(userId);
    if (!actor || !actor.alive) return { ok: false, error: 'Actor not alive.' };

    if (type === 'witch_heal' && this.sorciereCharges.heal <= 0) {
      return { ok: false, error: 'No heal charge remaining.' };
    }
    if (type === 'witch_poison' && this.sorciereCharges.poison <= 0) {
      return { ok: false, error: 'No poison charge remaining.' };
    }

    this.nightActions[userId] = { type, targetUserId, actorRole: actor.role };
    return { ok: true };
  }

  /** Resolves all submitted night actions into deaths / conversions. */
  resolveNight() {
    const actions = Object.values(this.nightActions);
    const results = { deaths: [], converted: null, seerReveals: [] };

    // Wolf votes: majority target among loup_garou (regular pack), noir kills separately if used to kill
    const wolfKillVotes = actions.filter((a) => a.type === 'wolf_kill');
    const noirInfect = actions.find((a) => a.type === 'wolf_noir_infect');
    const witchHeal = actions.find((a) => a.type === 'witch_heal');
    const witchPoison = actions.find((a) => a.type === 'witch_poison');
    const seerCheck = actions.find((a) => a.type === 'seer_check');

    let wolfTarget = null;
    if (wolfKillVotes.length > 0) {
      wolfTarget = majorityTarget(wolfKillVotes);
    }

    // Loup-Garou Noir one-time infect: converts instead of kills, takes priority
    // over a regular wolf kill on the same target.
    if (noirInfect) {
      const target = this.getPlayer(noirInfect.targetUserId);
      if (target && target.alive) {
        target.role = ROLES.LOUP_GAROU; // converted, joins the pack as a regular wolf
        target.infected = true;
        results.converted = target.userId;
        this.log('noir_infect', { targetUserId: target.userId });
      }
      // Noir power is one-time; caller should mark it used on the player record.
      const noirPlayer = this.getPlayer(Object.keys(this.nightActions).find(
        (uid) => this.nightActions[uid] === noirInfect
      ));
      if (noirPlayer) noirPlayer.noirPowerUsed = true;
    }

    if (wolfTarget && wolfTarget !== results.converted) {
      const target = this.getPlayer(wolfTarget);
      if (target && target.alive) {
        target.protectedTonight = witchHeal && witchHeal.targetUserId === wolfTarget;
        if (!target.protectedTonight) {
          target.alive = false;
          results.deaths.push({ userId: target.userId, reason: 'wolf_kill' });
          this.log('wolf_kill', { targetUserId: target.userId });
        } else {
          this.sorciereCharges.heal -= 1;
          this.log('witch_heal_used', { targetUserId: target.userId });
        }
      }
    }

    if (witchPoison) {
      const target = this.getPlayer(witchPoison.targetUserId);
      if (target && target.alive) {
        target.alive = false;
        this.sorciereCharges.poison -= 1;
        results.deaths.push({ userId: target.userId, reason: 'witch_poison' });
        this.log('witch_poison_used', { targetUserId: target.userId });
      }
    }

    if (seerCheck) {
      const target = this.getPlayer(seerCheck.targetUserId);
      if (target) {
        results.seerReveals.push({
          seerUserId: Object.keys(this.nightActions).find(
            (uid) => this.nightActions[uid] === seerCheck
          ),
          targetUserId: target.userId,
          isWolf: WOLF_ROLES.has(target.role),
        });
      }
    }

    // Hunter chain-death: if a hunter died tonight, they get to fire before day discussion.
    const deadHunter = results.deaths
      .map((d) => this.getPlayer(d.userId))
      .find((p) => p && p.role === ROLES.CHASSEUR);
    if (deadHunter) this.pendingHunterShot = deadHunter.userId;

    this.phase = PHASES.DAY_REVEAL;
    return results;
  }

  /** Hunter's revenge shot, usable after being killed (night or vote). */
  submitHunterShot(hunterUserId, targetUserId) {
    if (this.pendingHunterShot !== hunterUserId) {
      return { ok: false, error: 'No pending hunter shot for this player.' };
    }
    const target = this.getPlayer(targetUserId);
    if (!target || !target.alive) return { ok: false, error: 'Invalid target.' };
    target.alive = false;
    this.pendingHunterShot = null;
    this.log('hunter_shot', { hunterUserId, targetUserId });
    return { ok: true, killed: targetUserId };
  }

  startDayDiscussion() {
    this.phase = PHASES.DAY_DISCUSSION;
    this.phaseDeadline = Date.now() + this.dayDurationMs;
    this.log('day_discussion_start', { dayNumber: this.dayNumber });
  }

  startVote() {
    this.phase = PHASES.DAY_VOTE;
    this.votes = {};
    this.phaseDeadline = Date.now() + this.voteDurationMs;
    this.log('vote_start', { dayNumber: this.dayNumber });
  }

  submitVote(voterUserId, targetUserId) {
    const voter = this.getPlayer(voterUserId);
    if (!voter || !voter.alive) return { ok: false, error: 'Voter not alive.' };
    this.votes[voterUserId] = targetUserId;
    return { ok: true };
  }

  resolveVote() {
    const targets = Object.values(this.votes);
    if (targets.length === 0) return { eliminated: null };
    const eliminatedUserId = majorityTarget(targets.map((t) => ({ targetUserId: t })));
    const player = this.getPlayer(eliminatedUserId);
    if (player) {
      player.alive = false;
      this.log('vote_elimination', { targetUserId: eliminatedUserId });
      if (player.role === ROLES.CHASSEUR) this.pendingHunterShot = player.userId;
    }
    return { eliminated: eliminatedUserId };
  }

  checkWinCondition() {
    const wolves = this.aliveWolves().length;
    const village = this.aliveVillage().length;
    if (wolves === 0) {
      this.winner = 'village';
      this.phase = PHASES.FINISHED;
      return 'village';
    }
    if (wolves >= village) {
      this.winner = 'wolves';
      this.phase = PHASES.FINISHED;
      return 'wolves';
    }
    return null;
  }

  log(type, data) {
    this.eventLog.push({ type, data, at: Date.now(), dayNumber: this.dayNumber });
  }

  // ---------- Payload filtering (privacy) ----------

  /** Public state safe to broadcast to everyone (no roles revealed). */
  getPublicState() {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      dayNumber: this.dayNumber,
      phaseDeadline: this.phaseDeadline,
      players: this.players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        alive: p.alive,
      })),
      winner: this.winner,
      pendingHunterShot: this.pendingHunterShot,
    };
  }

  /** Private view for a specific user: own role always visible; wolves see each other. */
  getPrivateState(userId) {
    const self = this.getPlayer(userId);
    if (!self) return null;

    const isWolf = WOLF_ROLES.has(self.role);
    return {
      yourRole: self.role,
      alive: self.alive,
      sorciereCharges: self.role === ROLES.SORCIERE ? { ...this.sorciereCharges } : undefined,
      packMembers: isWolf
        ? this.players
            .filter((p) => WOLF_ROLES.has(p.role) && p.userId !== userId)
            .map((p) => ({ userId: p.userId, displayName: p.displayName, alive: p.alive }))
        : undefined,
      noirPowerAvailable:
        self.role === ROLES.LOUP_GAROU_NOIR && !self.noirPowerUsed ? true : undefined,
    };
  }
}

// ---------- helpers ----------

function camelToSnakeRole(key) {
  const map = {
    villageois: ROLES.VILLAGEOIS,
    loupGarou: ROLES.LOUP_GAROU,
    voyante: ROLES.VOYANTE,
    sorciere: ROLES.SORCIERE,
    chasseur: ROLES.CHASSEUR,
    loupGarouNoir: ROLES.LOUP_GAROU_NOIR,
  };
  return map[key] || ROLES.VILLAGEOIS;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function majorityTarget(actionsWithTarget) {
  const counts = {};
  for (const a of actionsWithTarget) {
    counts[a.targetUserId] = (counts[a.targetUserId] || 0) + 1;
  }
  let best = null;
  let bestCount = -1;
  for (const [target, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = target;
      bestCount = count;
    }
  }
  return best;
}

module.exports = { GameEngine, PHASES, ROLES, WOLF_ROLES };
