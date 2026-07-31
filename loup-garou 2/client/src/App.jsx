import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from './context/AuthContext.jsx';
import { setLanguage } from './i18n/index.js';
import LoginPage from './pages/LoginPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import GamePage from './pages/GamePage.jsx';
import ProfileBadge from './components/ProfileBadge.jsx';
import FriendsPanel from './components/FriendsPanel.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-moonlight-300">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function HomePage() {
  const { t, i18n } = useTranslation();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function createRoom() {
  setBusy(true);
  setError(null);

  try {
    const res = await fetch("https://loup-garou-kqz6.onrender.com/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        minPlayers: 4,
        maxPlayers: 12,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed");
    }

    navigate(`/lobby/${data.room.code}`);
  } catch (err) {
    setError(err.message);
  } finally {
    setBusy(false);
  }
}

  function joinRoom(e) {
    e.preventDefault();
    if (joinCode.trim()) navigate(`/lobby/${joinCode.trim().toUpperCase()}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 gap-6">
      <div className="glass-panel p-10 max-w-md w-full space-y-6 text-center">
        <h1 className="font-display text-3xl text-embergold-400">{t('app_title')}</h1>

        <ProfileBadge user={user} />

        <button
          onClick={createRoom}
          disabled={busy}
          className="w-full py-3 rounded-xl bg-blood-500 hover:bg-blood-400 font-semibold shadow-glow disabled:opacity-50"
        >
          {busy ? '...' : 'Create Room'}
        </button>

        <form onSubmit={joinRoom} className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Room code"
            className="flex-1 bg-midnight-900/60 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-embergold-400"
          />
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm">
            Join
          </button>
        </form>

        {error && <p className="text-xs text-blood-400">{error}</p>}

        <div className="flex items-center justify-between text-xs text-moonlight-300">
          <div className="flex gap-3">
            <button className={i18n.language === 'en' ? 'text-embergold-300' : ''} onClick={() => setLanguage('en')}>
              EN
            </button>
            <span>/</span>
            <button className={i18n.language === 'ar' ? 'text-embergold-300' : ''} onClick={() => setLanguage('ar')}>
              AR
            </button>
          </div>
          <button onClick={logout} className="underline">
            Log out
          </button>
        </div>
      </div>

      <FriendsPanel />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/lobby/:code"
        element={
          <RequireAuth>
            <LobbyPage />
          </RequireAuth>
        }
      />
      <Route
        path="/game/:code"
        element={
          <RequireAuth>
            <GamePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
