import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useFriends } from '../hooks/useFriends.js';

export default function FriendsPanel({ currentRoomCode }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const {
    incomingRequests,
    incomingInvites,
    notice,
    sendFriendRequest,
    respondToRequest,
    sendRoomInvite,
    dismissInvite,
  } = useFriends();

  const [friends, setFriends] = useState([]);
  const [addUserId, setAddUserId] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/users/me/friends', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => data.ok && setFriends(data.friends));
  }, [token]);

  async function handleAddFriend(e) {
    e.preventDefault();
    if (!addUserId.trim()) return;
    const res = await sendFriendRequest(addUserId.trim());
    setStatus(res.ok ? 'Request sent.' : res.error);
    setAddUserId('');
  }

  return (
    <div className="glass-panel p-6 space-y-4 max-w-md w-full">
      <h2 className="font-display text-lg text-embergold-400">Friends</h2>

      <form onSubmit={handleAddFriend} className="flex gap-2">
        <input
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          placeholder="Add by User ID (e.g. LG-AB12CD34)"
          className="flex-1 bg-midnight-900/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-embergold-400"
        />
        <button type="submit" className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm">
          Add
        </button>
      </form>
      {status && <p className="text-xs text-moonlight-300">{status}</p>}

      {incomingRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-moonlight-300">Friend Requests</p>
          {incomingRequests.map((r) => (
            <div key={r.requestId} className="flex items-center justify-between bg-midnight-900/50 rounded-lg px-3 py-2 text-sm">
              <span>{r.from.displayName}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => respondToRequest(r.requestId, true)}
                  className="px-2 py-1 rounded bg-embergold-400 text-midnight-950 text-xs font-semibold"
                >
                  Accept
                </button>
                <button
                  onClick={() => respondToRequest(r.requestId, false)}
                  className="px-2 py-1 rounded bg-white/10 text-xs"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {incomingInvites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-moonlight-300">Room Invites</p>
          {incomingInvites.map((inv) => (
            <div key={inv.inviteId} className="flex items-center justify-between bg-midnight-900/50 rounded-lg px-3 py-2 text-sm">
              <span>{inv.from.displayName} invited you to {inv.roomCode}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    dismissInvite(inv.inviteId);
                    navigate(`/lobby/${inv.roomCode}`);
                  }}
                  className="px-2 py-1 rounded bg-embergold-400 text-midnight-950 text-xs font-semibold"
                >
                  Join
                </button>
                <button onClick={() => dismissInvite(inv.inviteId)} className="px-2 py-1 rounded bg-white/10 text-xs">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {notice && <p className="text-xs text-embergold-300">{notice}</p>}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-moonlight-300">
          {friends.length === 0 ? 'No friends yet' : 'Your Friends'}
        </p>
        {friends.map((f) => (
          <div key={f.userId} className="flex items-center justify-between bg-midnight-900/50 rounded-lg px-3 py-2 text-sm">
            <span>{f.displayName}</span>
            {currentRoomCode && (
              <button
                onClick={() => sendRoomInvite(f.userId, currentRoomCode)}
                className="text-xs text-embergold-300 underline"
              >
                Invite to room
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
