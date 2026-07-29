/**
 * Smart Auto-Recommend
 * ---------------------
 * Suggests a balanced role composition for a given player count (4-20).
 *
 * Design principles:
 * - Wolves should be roughly 20-30% of the lobby, rounded to keep the
 *   village favored but not trivially so.
 * - Special village roles (Voyante, Sorciere, Chasseur) are introduced as
 *   soon as the lobby is large enough to support them without overloading
 *   power roles relative to plain villagers.
 * - Loup-Garou Noir replaces one regular wolf once the wolf count is high
 *   enough to support a special wolf without making the pack overpowered
 *   (from 8+ players).
 * - Cupidon and Salvateur are sprinkled in at higher counts (12+, 16+) to
 *   keep larger games interesting.
 * - Remaining seats are filled with Villageois.
 */

const WOLF_RATIO = 0.25;

export function recommendRoles(playerCount) {
  const count = Math.max(4, Math.min(20, playerCount));

  const roles = {
    villageois: 0,
    loup_garou: 0,
    loup_garou_noir: 0,
    voyante: 0,
    sorciere: 0,
    chasseur: 0,
    cupidon: 0,
    salvateur: 0,
    petite_fille: 0,
  };

  // 1. Wolf pack size
  let wolfCount = Math.max(1, Math.round(count * WOLF_RATIO));
  // Cap wolves so they never reach/exceed half the lobby.
  wolfCount = Math.min(wolfCount, Math.floor(count / 2) - 1 || 1);

  if (count >= 8) {
    roles.loup_garou_noir = 1;
    roles.loup_garou = wolfCount - 1;
  } else {
    roles.loup_garou = wolfCount;
  }

  // 2. Core village power roles, gated by lobby size
  if (count >= 5) roles.voyante = 1;
  if (count >= 6) roles.sorciere = 1;
  if (count >= 7) roles.chasseur = 1;

  // 3. Larger-game specials
  if (count >= 12) roles.cupidon = 1;
  if (count >= 14) roles.salvateur = 1;
  if (count >= 16) roles.petite_fille = 1;

  // 4. Fill remaining seats with plain villagers
  const assigned = Object.values(roles).reduce((a, b) => a + b, 0);
  roles.villageois = Math.max(0, count - assigned);

  // Convert to the RoleConfig array shape used by the Room model,
  // dropping zero-count entries.
  const roleConfig = Object.entries(roles)
    .filter(([, c]) => c > 0)
    .map(([role, c]) => ({ role, count: c }));

  return {
    playerCount: count,
    roleConfig,
    wolfCount,
    villageCount: count - wolfCount,
  };
}

/** Validates a host's manual role config against the player count. */
export function validateRoleConfig(roleConfig, playerCount) {
  const errors = [];
  const total = roleConfig.reduce((sum, r) => sum + r.count, 0);

  if (total !== playerCount) {
    errors.push(`Role count (${total}) does not match player count (${playerCount}).`);
  }

  const wolves = roleConfig
    .filter((r) => r.role === 'loup_garou' || r.role === 'loup_garou_noir')
    .reduce((sum, r) => sum + r.count, 0);

  if (wolves < 1) {
    errors.push('At least one wolf is required.');
  }
  if (wolves >= playerCount / 2) {
    errors.push('Wolves cannot make up half or more of the players.');
  }

  const singletonRoles = ['voyante', 'sorciere', 'chasseur', 'cupidon', 'salvateur', 'petite_fille', 'loup_garou_noir'];
  for (const role of singletonRoles) {
    const entry = roleConfig.find((r) => r.role === role);
    if (entry && entry.count > 1) {
      errors.push(`Role "${role}" cannot have more than 1 copy.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
