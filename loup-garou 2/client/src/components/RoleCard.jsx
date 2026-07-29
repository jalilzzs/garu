const ROLE_LABELS = {
  villageois: 'Villageois',
  loup_garou: 'Loup-Garou',
  loup_garou_noir: 'Loup-Garou Noir',
  voyante: 'La Voyante',
  sorciere: 'La Sorcière',
  chasseur: 'Le Chasseur',
  cupidon: 'Cupidon',
  petite_fille: 'Petite Fille',
  salvateur: 'Salvateur',
};

const ROLE_DESCRIPTIONS = {
  villageois: 'No special power. Help the village find the wolves.',
  loup_garou: 'Wake each night with the pack to choose a victim.',
  loup_garou_noir: 'A wolf with a one-time power: infect instead of kill.',
  voyante: "Inspect one player's true role each night.",
  sorciere: 'One healing potion, one poison potion — use them wisely.',
  chasseur: 'If you die, you fire one last shot.',
  cupidon: 'On night one, link two players as lovers.',
  petite_fille: "Peek during the wolves' night phase — carefully.",
  salvateur: 'Protect one player each night from the wolves.',
};

export default function RoleCard({ role }) {
  const label = ROLE_LABELS[role] || role;
  const desc = ROLE_DESCRIPTIONS[role] || '';
  const isWolf = role === 'loup_garou' || role === 'loup_garou_noir';

  return (
    <div className="glass-panel p-6 max-w-xs mx-auto text-center">
      <p className="font-display text-xs tracking-widest text-moonlight-300 uppercase mb-2">
        Your Role
      </p>
      <h2 className={`font-display text-2xl mb-3 ${isWolf ? 'text-blood-400' : 'text-embergold-400'}`}>
        {label}
      </h2>
      <p className="text-sm text-moonlight-300">{desc}</p>
    </div>
  );
}
