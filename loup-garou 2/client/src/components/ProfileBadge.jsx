const RANK_COLORS = {
  Bronze: 'text-amber-600',
  Silver: 'text-slate-300',
  Gold: 'text-embergold-400',
  Platinum: 'text-cyan-300',
  Diamond: 'text-blue-300',
  Master: 'text-blood-400',
};

export default function ProfileBadge({ user }) {
  if (!user) return null;
  const rankColor = RANK_COLORS[user.rank] || 'text-moonlight-300';

  return (
    <div className="glass-panel p-4 flex items-center justify-between max-w-md w-full">
      <div>
        <p className="font-semibold">{user.displayName}</p>
        <p className="text-xs text-moonlight-300/70">{user.userId}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${rankColor}`}>{user.rank}</p>
        <p className="text-xs text-moonlight-300">Lv. {user.level} · {user.xp} XP</p>
      </div>
    </div>
  );
}
