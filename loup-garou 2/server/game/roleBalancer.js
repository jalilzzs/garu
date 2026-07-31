const ROLE_KEYS = [
  'villageois',
  'loup_garou',
  'voyante',
  'sorciere',
  'chasseur',
  'loup_garou_noir',
];

function recommendComposition(playerCount) {
  const n = Math.max(4, Math.min(20, playerCount));

  let wolves = Math.max(1, Math.round(n / 4));
  wolves = Math.min(wolves, 6);

  const roles = [];

  if (wolves >= 2 && n >= 9) {
    roles.push({
      role: 'loup_garou_noir',
      count: 1,
    });
    wolves--;
  }

  roles.push({
    role: 'loup_garou',
    count: wolves,
  });

  if (n >= 5) {
    roles.push({
      role: 'voyante',
      count: 1,
    });
  }

  if (n >= 6) {
    roles.push({
      role: 'sorciere',
      count: 1,
    });
  }

  if (n >= 8) {
    roles.push({
      role: 'chasseur',
      count: 1,
    });
  }

  const used = roles.reduce((s, r) => s + r.count, 0);

  roles.unshift({
    role: 'villageois',
    count: n - used,
  });

  return roles;
}

function totalRoles(roleConfig) {
  return roleConfig.reduce((s, r) => s + r.count, 0);
}

function validateComposition(roleConfig, playerCount) {
  const errors = [];

  if (totalRoles(roleConfig) !== playerCount) {
    errors.push('Invalid role count');
  }

  const wolves = roleConfig
    .filter(
      r => r.role === 'loup_garou' || r.role === 'loup_garou_noir'
    )
    .reduce((s, r) => s + r.count, 0);

  if (wolves < 1) {
    errors.push('At least one wolf required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  ROLE_KEYS,
  recommendComposition,
  validateComposition,
  totalRoles,
};
