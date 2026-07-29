import { ROLES, roleTeam, TEAMS } from './roles.js';
import { checkWinCondition } from './winConditions.js';

export const PHASES = {
  NIGHT: 'night',
  DAY_DISCUSSION: 'day_discussion',
  DAY_VOTE: 'day_vote',
  ENDED: 'ended',
};

/**
 * GameEngine holds the authoritative in-memory state for a single match and
 * resolves night actions in role order, applies day-phase lynching, and
 * evaluates win conditions after every death. It emits `events` (pushed to
 * an internal log) that the socket layer (Stage 5) reads to broadcast
 * role-appropriate, filtered updates to each client.
 *
 * This class has no direct socket/DB dependency so it can be unit tested
 * and reused independent of transport.
 */
export class GameEngine {
  /**
   * @param {Array<{userId: string, displayName: string, role: string}>} players
   */
  constructor(players) {
    this.cycle = 0;
    this.phase = PHASES.NIGHT;
    this.players = players.map((p) => ({
      ...p,
      alive: true,
      hasBeenInfected: false,
    }));

    // Per-game one-time ability tracking
    this.usedAbilities = {
      loupNoirInfectUsed: false,
      sorciereHealUsed: false,
      sorcierePoisonUsed: false,
      cupidonUsed: false,
    };

    this.lovers = null; // [userIdA, userIdB]
    this.protectedLastNight = null; // salvateur can't repeat-protect
    this.pendingChasseurShot = null; // userId of chasseur awaiting a shot after death
    this.events = [];
    this.winningTeam = null;

    this._nightSubmissions = {}; // role -> action payload for current night
  }

  log(type, actor, target, detail = null) {
    this.events.push({
      phase: this.phase.startsWith('day') ? 'day' : 'night',
      cycle: this.cycle,
      type,
      actor,
      target,
      detail,
      at: new Date(),
    });
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  findPlayer(userId) {
    return this.players.find((p) => p.userId === userId);
  }

  aliveByRole(role) {
    return this.alivePlayers().filter((p) => p.role === role);
  }

  /** Roles that still have a living actor and thus wake up this game. */
  activeNightRoles() {
    return Object.values(ROLES)
      .filter((r) => r.nightOrder !== null)
      .sort((a, b) => a.nightOrder - b.nightOrder)
      .filter((r) => this.aliveByRole(r.key).length > 0)
      .map((r) => r.key);
  }

  /* ---------------------------------------------------------------- */
  /* Night phase                                                        */
  /* ---------------------------------------------------------------- */

  startNight() {
    this.phase = PHASES.NIGHT;
    this.cycle += 1;
    this._nightSubmissions = {};
    this.log('game_start', null, null, { note: `Night ${this.cycle} begins` });
    return { activeRoles: this.activeNightRoles() };
  }

  /**
   * Submits a night action for a role. Called once per active role per
   * night by the socket layer once that role's player(s) have acted.
   *
   * action shapes:
   *  - cupidon:      { targetA, targetB }
   *  - voyante:      { target }
   *  - salvateur:    { target }
   *  - loup_garou / loup_garou_noir: { target, infect?: boolean }
   *  - sorciere:     { healTarget?: string, poisonTarget?: string }
   */
  submitNightAction(role, action) {
    this._nightSubmissions[role] = action;
  }

  /**
   * Resolves all submitted night actions in role order and returns the
   * outcome (who died, who was infected, etc). Should be called once all
   * active roles have submitted (or their action window has timed out).
   */
  resolveNight() {
    const outcome = { deaths: [], infected: null, seerResult: null };

    // Cupidon (night 1 only)
    const cupidonAction = this._nightSubmissions.cupidon;
    if (cupidonAction && !this.usedAbilities.cupidonUsed && this.cycle === 1) {
      this.lovers = [cupidonAction.targetA, cupidonAction.targetB];
      this.usedAbilities.cupidonUsed = true;
      this.log('game_start', 'cupidon', null, { lovers: this.lovers, note: 'Lovers linked' });
    }

    // Voyante inspection
    const voyanteAction = this._nightSubmissions.voyante;
    if (voyanteAction?.target) {
      const target = this.findPlayer(voyanteAction.target);
      if (target) {
        outcome.seerResult = { target: target.userId, role: target.role };
        this.log('seer_check', 'voyante', target.userId, { revealedRole: target.role });
      }
    }

    // Salvateur protection
    const salvateurAction = this._nightSubmissions.salvateur;
    let protectedTarget = null;
    if (salvateurAction?.target && salvateurAction.target !== this.protectedLastNight) {
      protectedTarget = salvateurAction.target;
      this.protectedLastNight = protectedTarget;
    }

    // Wolves (regular + noir) choose one victim; noir may infect instead of kill
    const wolfAction = this._nightSubmissions.loup_garou_noir || this._nightSubmissions.loup_garou;
    let wolfVictim = null;
    let didInfect = false;

    if (wolfAction?.target) {
      wolfVictim = wolfAction.target;
      if (
        wolfAction.infect &&
        this._nightSubmissions.loup_garou_noir &&
        !this.usedAbilities.loupNoirInfectUsed
      ) {
        didInfect = true;
        this.usedAbilities.loupNoirInfectUsed = true;
      }
    }

    // Sorciere heal/poison
    const sorciereAction = this._nightSubmissions.sorciere;
    let healedTarget = null;
    let poisonedTarget = null;

    if (sorciereAction?.healTarget && !this.usedAbilities.sorciereHealUsed) {
      healedTarget = sorciereAction.healTarget;
      this.usedAbilities.sorciereHealUsed = true;
    }
    if (sorciereAction?.poisonTarget && !this.usedAbilities.sorcierePoisonUsed) {
      poisonedTarget = sorciereAction.poisonTarget;
      this.usedAbilities.sorcierePoisonUsed = true;
    }

    // Resolve the wolf action against protection/heal, or apply infection
    if (wolfVictim) {
      if (didInfect) {
        const victim = this.findPlayer(wolfVictim);
        if (victim) {
          victim.role = 'loup_garou';
          victim.hasBeenInfected = true;
          outcome.infected = wolfVictim;
          this.log('infect', 'loup_garou_noir', wolfVictim);
        }
      } else {
        const saved = wolfVictim === protectedTarget || wolfVictim === healedTarget;
        if (!saved) {
          this._kill(wolfVictim, 'kill', 'loup_garou', outcome);
        } else {
          this.log('heal', 'salvateur_or_sorciere', wolfVictim, { saved: true });
        }
      }
    }

    // Poison always lands regardless of protection
    if (poisonedTarget) {
      this._kill(poisonedTarget, 'poison', 'sorciere', outcome);
    }

    this._nightSubmissions = {};
    this.phase = PHASES.DAY_DISCUSSION;

    return { ...outcome, winCheck: this._evaluateWin() };
  }

  /* ---------------------------------------------------------------- */
  /* Day phase                                                          */
  /* ---------------------------------------------------------------- */

  startVote() {
    this.phase = PHASES.DAY_VOTE;
  }

  /**
   * Applies the outcome of a day vote — the player with the most votes is
   * lynched. `votes` is a map of voterUserId -> targetUserId.
   */
  resolveLynch(votes) {
    const tally = {};
    for (const target of Object.values(votes)) {
      tally[target] = (tally[target] || 0) + 1;
    }

    let lynched = null;
    let max = 0;
    for (const [userId, count] of Object.entries(tally)) {
      if (count > max) {
        max = count;
        lynched = userId;
      }
    }

    const outcome = { lynched: null, deaths: [] };
    if (lynched) {
      outcome.lynched = lynched;
      this._kill(lynched, 'lynch', null, outcome);
      this.log('lynch', null, lynched, { votes: tally });
    }

    this.phase = PHASES.NIGHT;
    return { ...outcome, winCheck: this._evaluateWin() };
  }

  /**
   * Applies the Chasseur's revenge shot after they die. Must be called by
   * the socket layer once the dying Chasseur's player selects a target
   * (or a short timeout auto-skips it).
   */
  resolveChasseurShot(shooterUserId, targetUserId) {
    if (this.pendingChasseurShot !== shooterUserId) return null;
    this.pendingChasseurShot = null;

    const outcome = { deaths: [] };
    this._kill(targetUserId, 'hunter_shot', shooterUserId, outcome);
    this.log('hunter_shot', shooterUserId, targetUserId);
    return { ...outcome, winCheck: this._evaluateWin() };
  }

  /* ---------------------------------------------------------------- */
  /* Internal helpers                                                   */
  /* ---------------------------------------------------------------- */

  _kill(userId, cause, actor, outcome) {
    const player = this.findPlayer(userId);
    if (!player || !player.alive) return;

    player.alive = false;
    outcome.deaths.push({ userId, cause });
    this.log(cause, actor, userId);

    // Chasseur death-trigger
    if (player.role === 'chasseur') {
      this.pendingChasseurShot = userId;
    }

    // Lovers grief-death
    if (this.lovers?.includes(userId)) {
      const otherId = this.lovers.find((id) => id !== userId);
      const other = this.findPlayer(otherId);
      if (other?.alive) {
        other.alive = false;
        outcome.deaths.push({ userId: otherId, cause: 'grief' });
        this.log('kill', 'grief', otherId, { note: 'Died of grief for lover' });
      }
    }
  }

  _evaluateWin() {
    const result = checkWinCondition(this.alivePlayers(), this.lovers);
    if (result.over) {
      this.phase = PHASES.ENDED;
      this.winningTeam = result.winningTeam;
      this.log('game_end', null, null, { winningTeam: result.winningTeam });
    }
    return result;
  }

  /** Public snapshot safe to persist to Match.results at game end. */
  toMatchResults() {
    return this.players.map((p) => {
      const isLoverWin = this.winningTeam === 'lovers' && !!this.lovers?.includes(p.userId);
      const isTeamWin = roleTeam(p.role) === this.winningTeam;
      return {
        user: p.user, // Mongo ObjectId, attached by caller
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        convertedToWolf: p.hasBeenInfected,
        survived: p.alive,
        isWinner: Boolean(isTeamWin || isLoverWin),
      };
    });
  }
}
