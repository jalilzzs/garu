import { ROLES, roleTeam, TEAMS } from '../game/roles.js';

/**
 * Strict role-privacy filtering. Every broadcast of game state MUST pass
 * through here rather than being emitted as raw engine state — this is
 * the single choke point that prevents a client from ever receiving
 * another player's private role over the wire.
 *
 * Rules:
 * - A living player only ever sees their OWN role as a role string.
 *   Everyone else appears as role: null, team: null — UNLESS that other
 *   player is dead, in which case their role is revealed to all (standard
 *   Werewolf convention: death reveals your role to the table).
 * - Wolves (loup_garou / loup_garou_noir) see each other's roles and team
 *   while both are alive, so the pack can coordinate.
 * - A dead/spectating viewer sees every alive player's role (spectator
 *   omniscience), matching the "dead chat" channel's purpose.
 * - The Voyante's own inspection results are delivered separately as a
 *   one-off private event (see nightActions.js), never folded into the
 *   general roster broadcast.
 */

function isWolf(role) {
  return roleTeam(role) === TEAMS.WOLVES;
}

/**
 * @param {Array} players - engine.players (each has userId, role, alive)
 * @param {{userId: string, alive: boolean}} viewer - the player receiving this payload
 * @returns {Array} filtered roster safe to send to `viewer`
 */
export function filterRosterForViewer(players, viewer) {
  const viewerIsWolfAndAlive = viewer.alive && isWolf(viewer.role);
  const viewerIsSpectator = !viewer.alive;

  return players.map((p) => {
    const base = {
      userId: p.userId,
      displayName: p.displayName,
      alive: p.alive,
    };

    const revealRole =
      !p.alive || // dead players' roles are public knowledge
      p.userId === viewer.userId || // you always know your own role
      viewerIsSpectator || // dead/spectators see all
      (viewerIsWolfAndAlive && isWolf(p.role) && p.alive); // wolves see packmates

    if (revealRole) {
      return { ...base, role: p.role, team: roleTeam(p.role) };
    }
    return { ...base, role: null, team: null };
  });
}

/**
 * Builds the per-socket payload for a night-phase update, filtering the
 * roster and attaching only the prompts relevant to this viewer's role
 * (e.g. only the Voyante is told "choose someone to inspect").
 */
export function buildNightPayload(engine, viewer, activeRoles) {
  const roster = filterRosterForViewer(engine.players, viewer);

  const canAct =
    viewer.alive &&
    activeRoles.includes(viewer.role) &&
    // Cupidon only acts night 1; enforce here too so a stale client can't
    // be prompted again.
    !(viewer.role === 'cupidon' && engine.usedAbilities.cupidonUsed);

  return {
    phase: engine.phase,
    cycle: engine.cycle,
    roster,
    yourRole: viewer.role,
    canAct,
    promptedRole: canAct ? viewer.role : null,
  };
}

/** Day-phase payload: everyone gets the same roster (deaths are public). */
export function buildDayPayload(engine, viewer) {
  const roster = filterRosterForViewer(engine.players, viewer);
  return {
    phase: engine.phase,
    cycle: engine.cycle,
    roster,
    yourRole: viewer.role,
    alive: viewer.alive,
  };
}

export { isWolf };
