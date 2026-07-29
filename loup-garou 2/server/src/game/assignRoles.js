import { validateRoleConfig } from './autoRecommend.js';

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Expands a roleConfig ([{role, count}]) into a flat shuffled deck of role
 * keys, then deals one to each seated player.
 *
 * Returns a map of userId -> role, plus the validation result so callers
 * can refuse to start an unbalanced game.
 */
export function assignRoles(seats, roleConfig) {
  const validation = validateRoleConfig(roleConfig, seats.length);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const deck = shuffle(
    roleConfig.flatMap(({ role, count }) => Array(count).fill(role))
  );

  const shuffledSeats = shuffle(seats);
  const assignment = {};

  shuffledSeats.forEach((seat, i) => {
    assignment[seat.userId] = deck[i];
  });

  return { ok: true, assignment };
}
