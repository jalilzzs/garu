import { roleTeam, TEAMS } from './roles.js';

/**
 * Evaluates whether the game has ended given the current set of alive
 * players (each with a `role` and `userId`), and any active lovers pair.
 *
 * Returns { over: boolean, winningTeam: 'villagers' | 'wolves' | 'lovers' | null }
 */
export function checkWinCondition(alivePlayers, lovers = null) {
  if (alivePlayers.length === 0) {
    return { over: true, winningTeam: 'draw' };
  }

  // Lovers-only win: if the two lovers are the sole survivors and are on
  // opposing teams, they win together over their own factions.
  if (
    lovers &&
    alivePlayers.length === 2 &&
    alivePlayers.every((p) => lovers.includes(p.userId))
  ) {
    const teams = new Set(alivePlayers.map((p) => roleTeam(p.role)));
    if (teams.size === 2) {
      return { over: true, winningTeam: 'lovers' };
    }
  }

  const wolvesAlive = alivePlayers.filter((p) => roleTeam(p.role) === TEAMS.WOLVES).length;
  const villagersAlive = alivePlayers.length - wolvesAlive;

  if (wolvesAlive === 0) {
    return { over: true, winningTeam: 'villagers' };
  }

  if (wolvesAlive >= villagersAlive) {
    return { over: true, winningTeam: 'wolves' };
  }

  return { over: false, winningTeam: null };
}
