/**
 * Smart Auto-Recommend
 * Suggests a balanced role composition for a given player count (4-20).
 *
 * Design principles:
 * - Wolves should be ~20-30% of the lobby, rounded, min 1.
 * - Special roles (Voyante, Sorcière, Chasseur) are introduced at player-count
 *   thresholds so small games stay simple and large games stay interesting.
 * - Loup-Garou Noir replaces one regular wolf slot once the wolf pack is big
 *   enough to afford losing a "pure kill" wolf (needs pack size >= 2 and
 *   player count >= 9), since its power is converting rather than killing.
 * - Remaining slots are filled with Villageois.
 */

const ROLE_KEYS = [
  'villageois',
  'loupGarou',
  'voyante',
  'sorciere',
  'chasseur',
  'loupGarouNoir',
];

function emptyComposition() {
  return ROLE_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {});
}

function recommendComposition(playerCount) {
  const n = Math.max(4, Math.min(20, playerCount));
  const comp = emptyComposition();

  // 1. Wolf pack size: roughly 1 wolf per 4 players, min 1, max 6.
  let wolfPack = Math.max(1, Math.round(n / 4));
  wolfPack = Math.min(wolfPack, 6);

  // 2. Special village roles unlock by threshold.
  const hasVoyante = n >= 5;
  const hasSorciere = n >= 6;
  const hasChasseur = n >= 8;

  // 3. Loup-Garou Noir: convert one wolf slot once pack >= 2 and n >= 9.
  let loupGarouNoir = 0;
  if (wolfPack >= 2 && n >= 9) {
    loupGarouNoir = 1;
    wolfPack -= 1;
  }

  comp.loupGarou = wolfPack;
  comp.loupGarouNoir = loupGarouNoir;
  comp.voyante = hasVoyante ? 1 : 0;
  comp.sorciere = hasSorciere ? 1 : 0;
  comp.chasseur = hasChasseur ? 1 : 0;

  const specialTotal =
    comp.loupGarou + comp.loupGarouNoir + comp.voyante + comp.sorciere + comp.chasseur;

  comp.villageois = Math.max(0, n - specialTotal);

  return comp;
}

function totalRoles(comp) {
  return ROLE_KEYS.reduce((sum, k) => sum + (comp[k] || 0), 0);
}

/**
 * Validates a host's manual role configuration against the player count.
 * Returns { valid, errors[] }.
 */
function validateComposition(comp, playerCount) {
  const errors = [];
  const total = totalRoles(comp);

  if (total !== playerCount) {
    errors.push(`Role count (${total}) must equal player count (${playerCount}).`);
  }
  if ((comp.loupGarou || 0) + (comp.loupGarouNoir || 0) < 1) {
    errors.push('At least one wolf (Loup-Garou or Loup-Garou Noir) is required.');
  }
  if ((comp.loupGarou || 0) + (comp.loupGarouNoir || 0) >= playerCount) {
    errors.push('Wolves cannot equal or outnumber the total player count.');
  }
  for (const key of ['voyante', 'sorciere', 'chasseur', 'loupGarouNoir']) {
    if ((comp[key] || 0) > 1) {
      errors.push(`Only one ${key} is allowed per game.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  ROLE_KEYS,
  recommendComposition,
  validateComposition,
  totalRoles,
};
