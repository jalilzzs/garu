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

function compositionToArray(comp) {
  return [
    { role: 'villageois', count: comp.villageois },
    { role: 'loup_garou', count: comp.loupGarou },
    { role: 'voyante', count: comp.voyante },
    { role: 'sorciere', count: comp.sorciere },
    { role: 'chasseur', count: comp.chasseur },
    { role: 'loup_garou_noir', count: comp.loupGarouNoir },
  ].filter(r => r.count > 0);
}

function recommendComposition(playerCount) {
  const n = Math.max(4, Math.min(20, playerCount));
  const comp = emptyComposition();

  let wolfPack = Math.max(1, Math.round(n / 4));
  wolfPack = Math.min(wolfPack, 6);

  const hasVoyante = n >= 5;
  const hasSorciere = n >= 6;
  const hasChasseur = n >= 8;

  let loupGarouNoir = 0;

  if (wolfPack >= 2 && n >= 9) {
    loupGarouNoir = 1;
    wolfPack--;
  }

  comp.loupGarou = wolfPack;
  comp.loupGarouNoir = loupGarouNoir;
  comp.voyante = hasVoyante ? 1 : 0;
  comp.sorciere = hasSorciere ? 1 : 0;
  comp.chasseur = hasChasseur ? 1 : 0;

  const totalSpecial =
    comp.loupGarou +
    comp.loupGarouNoir +
    comp.voyante +
    comp.sorciere +
    comp.chasseur;

  comp.villageois = n - totalSpecial;

  return compositionToArray(comp);
}

function totalRoles(comp) {
  if (Array.isArray(comp)) {
    return comp.reduce((sum, r) => sum + r.count, 0);
  }

  return ROLE_KEYS.reduce((sum, k) => sum + (comp[k] || 0), 0);
}

function validateComposition(comp, playerCount) {
  if (Array.isArray(comp)) {
    const obj = {};

    for (const r of comp) {
      obj[r.role] = r.count;
    }

    comp = {
      villageois: obj.villageois || 0,
      loupGarou: obj.loup_garou || 0,
      voyante: obj.voyante || 0,
      sorciere: obj.sorciere || 0,
      chasseur: obj.chasseur || 0,
      loupGarouNoir: obj.loup_garou_noir || 0,
    };
  }

  const errors = [];
  const total = totalRoles(comp);

  if (total !== playerCount) {
    errors.push(
      `Role count (${total}) must equal player count (${playerCount}).`
    );
  }

  if ((comp.loupGarou || 0) + (comp.loupGarouNoir || 0) < 1) {
    errors.push('At least one wolf is required.');
  }

  if (
    (comp.loupGarou || 0) + (comp.loupGarouNoir || 0) >= playerCount
  ) {
    errors.push('Too many wolves.');
  }

  for (const key of [
    'voyante',
    'sorciere',
    'chasseur',
    'loupGarouNoir',
  ]) {
    if ((comp[key] || 0) > 1) {
      errors.push(`Only one ${key} allowed.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  ROLE_KEYS
