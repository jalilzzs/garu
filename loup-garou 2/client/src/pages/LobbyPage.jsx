import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import FriendsPanel from '../components/FriendsPanel.jsx';

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

function roleConfigToMap(roleConfig) {
  const map = {};
  for (const { role, count } of roleConfig || []) map[role] = count;
  return map;
}

export default function LobbyPage() {
  const { code } = useParams();
  const { token, user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [savingRoles, setSavingRoles] = useState(false);

  const isHost = room && user && room.host === user.userId;

  const fetchRoom = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}`);
    const data = await res.json();
    if (data.ok) setRoom(data.room);
    else setError(data.error);
  }, [code]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('lobby:join', { roomCode: code });
    const onUpdate = (updatedRoom) => setRoom(updatedRoom);
    const onStarted = () => navigate(`/game/${code}`);
    socket.on('lobby:update', onUpdate);
    socket.on('game:started', onStarted);
    return () => {
      socket.off('lobby:update', onUpdate);
      socket.off('game:started', onStarted);
    };
  }, [socket, code, navigate]);

  async function joinRoom() {
    const res = await fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) setRoom(data.room);
    else setError(data.error);
  }

  async function handleRoleCountChange(role, delta) {
    if (!room) return;
    const current = roleConfigToMap(room.roleConfig);
    const nextCount = Math.max(0, (current[role] || 0) + delta);
    const nextConfig = Object.entries({ ...current, [role]: nextCount })
      .filter(([, c]) => c > 0)
      .map(([r, c]) => ({ role: r, count: c }));

    setSavingRoles(true);
    const res = await fetch(`/api/rooms/${code}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roleConfig: nextConfig }),
    });
    const data = await res.json();
    setSavingRoles(false);
    if (data.ok) setRoom(data.room);
    else setError(data.details?.join(', ') || data.error);
  }

  async function revertToAuto() {
    const res = await fetch(`/api/rooms/${code}/roles/auto`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) setRoom(data.room);
  }

  function startGame() {
    socket.emit('game:start', { roomCode: code }, (ack) => {
      if (!ack.ok) setError(ack.details?.join(', ') || ack.error);
    });
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center text-moonlight-300">
        {error ? <p className="text-blood-400">{error}</p> : 'Loading lobby...'}
      </div>
    );
  }

  const roleMap = roleConfigToMap(room.roleConfig);
  const totalAssigned = Object.values(roleMap).reduce((a, b) => a + b, 0);
  const alreadySeated = room.seats.some((s) => s.userId === user?.userId);

  return (
    <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto space-y-6">
      <div className="glass-panel p-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-moonlight-300">Room Code</p>
          <h1 className="font-display text-3xl text-embergold-400">{room.code}</h1>
        </div>
        <p className="text-sm text-moonlight-300">
          {room.seats.length}/{room.maxPlayers} players
        </p>
      </div>

      {!alreadySeated && (
        <button onClick={joinRoom} className="w-full py-3 rounded-xl bg-blood-500 hover:bg-blood-400 font-semibold">
          Join Room
        </button>
      )}

      <div className="glass-panel p-6">
        <h2 className="font-display text-lg mb-3">Players</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {room.seats.map((s) => (
            <div key={s.userId} className="bg-midnight-900/50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              {s.isHost && <span className="text-embergold-400 text-xs">★</span>}
              {s.displayName}
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">Role Composition</h2>
          {room.autoRecommended && (
            <span className="text-xs text-embergold-300 uppercase tracking-widest">Smart Auto-Recommend</span>
          )}
        </div>

        <div className="space-y-2">
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <div key={role} className="flex items-center justify-between text-sm">
              <span>{label}</span>
              {isHost ? (
                <div className="flex items-center gap-3">
                  <button onClick={() => handleRoleCountChange(role, -1)} disabled={savingRoles} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20">
                    −
                  </button>
                  <span className="w-4 text-center">{roleMap[role] || 0}</span>
                  <button onClick={() => handleRoleCountChange(role, 1)} disabled={savingRoles} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20">
                    +
                  </button>
                </div>
              ) : (
                <span>{roleMap[role] || 0}</span>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-moonlight-300/70 mt-3">
          Assigned: {totalAssigned} / {room.seats.length} seated players
        </p>

        {isHost && !room.autoRecommended && (
          <button onClick={revertToAuto} className="mt-3 text-xs text-embergold-300 underline">
            Revert to Smart Auto-Recommend
          </button>
        )}
      </div>

      {error && <p className="text-sm text-blood-400">{error}</p>}

      {isHost && (
        <button
          onClick={startGame}
          disabled={room.seats.length < room.minPlayers || totalAssigned !== room.seats.length}
          className="w-full py-3 rounded-xl bg-embergold-400 text-midnight-950 font-bold disabled:opacity-40"
        >
          Start Game
        </button>
      )}

      <FriendsPanel currentRoomCode={room.code} />
    </div>
  );
}
