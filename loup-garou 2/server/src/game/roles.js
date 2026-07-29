export const TEAMS = {
  VILLAGE: 'villagers',
  WOLVES: 'wolves',
};

/**
 * Role registry. `nightOrder` determines resolution sequence each night.
 * `oncePerGame` roles (Chasseur's shot is death-triggered, Loup-Garou Noir's
 * infection is a one-time swap) are flagged so the engine can enforce it.
 */
export const ROLES = {
  villageois: {
    key: 'villageois',
    team: TEAMS.VILLAGE,
    nightOrder: null,
    description: 'No special power. Wins by helping eliminate all wolves.',
  },
  loup_garou: {
    key: 'loup_garou',
    team: TEAMS.WOLVES,
    nightOrder: 3,
    description: 'Wakes each night with the wolf pack to choose a victim.',
  },
  loup_garou_noir: {
    key: 'loup_garou_noir',
    team: TEAMS.WOLVES,
    nightOrder: 3,
    oncePerGame: true,
    description:
      'Wolf variant. Once per game, may infect the chosen victim instead of killing them, converting them into a wolf.',
  },
  voyante: {
    key: 'voyante',
    team: TEAMS.VILLAGE,
    nightOrder: 1,
    description: "Each night, may inspect one player's true role.",
  },
  sorciere: {
    key: 'sorciere',
    team: TEAMS.VILLAGE,
    nightOrder: 4,
    description:
      "Has one healing potion (save the wolves' victim) and one poison potion (kill any player), usable once each across the game.",
  },
  chasseur: {
    key: 'chasseur',
    team: TEAMS.VILLAGE,
    nightOrder: null,
    oncePerGame: true,
    description: 'When eliminated (by vote or by wolves), immediately fires a shot killing one other player.',
  },
  cupidon: {
    key: 'cupidon',
    team: TEAMS.VILLAGE,
    nightOrder: 0,
    oncePerGame: true,
    description: 'On the first night only, links two players as lovers. If one dies, the other dies of grief.',
  },
  petite_fille: {
    key: 'petite_fille',
    team: TEAMS.VILLAGE,
    nightOrder: null,
    description: 'May secretly peek during the wolves\u2019 night phase, at some risk of detection.',
  },
  salvateur: {
    key: 'salvateur',
    team: TEAMS.VILLAGE,
    nightOrder: 2,
    description: 'Each night, protects one player (not the same player twice in a row) from being killed.',
  },
};

export function roleTeam(roleKey) {
  return ROLES[roleKey]?.team || TEAMS.VILLAGE;
}
