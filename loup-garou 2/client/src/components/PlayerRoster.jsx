export default function PlayerRoster({ roster, selectable, selectedId, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {roster.map((p) => {
        const isDead = !p.alive;
        const isSelected = selectedId === p.userId;
        return (
          <button
            key={p.userId}
            disabled={!selectable || isDead}
            onClick={() => onSelect?.(p.userId)}
            className={`glass-panel p-3 text-left transition-all ${
              isDead ? 'opacity-40 grayscale' : ''
            } ${isSelected ? 'ring-2 ring-embergold-400' : ''} ${
              selectable && !isDead ? 'hover:ring-1 hover:ring-embergold-300 cursor-pointer' : 'cursor-default'
            }`}
          >
            <p className="font-semibold text-sm truncate">{p.displayName}</p>
            {p.role && (
              <p className={`text-xs mt-1 ${p.team === 'wolves' ? 'text-blood-400' : 'text-moonlight-300'}`}>
                {p.role.replace(/_/g, ' ')}
              </p>
            )}
            {isDead && <p className="text-xs mt-1 text-blood-500">Eliminated</p>}
          </button>
        );
      })}
    </div>
  );
}
