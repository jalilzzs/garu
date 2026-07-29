import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { setLanguage } from '../i18n/index.js';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { loginAsGuest } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleGuest(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginAsGuest(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-panel p-10 max-w-sm w-full space-y-6 text-center">
        <h1 className="font-display text-3xl text-embergold-400">{t('app_title')}</h1>

        <div className="space-y-2">
          <a href="/api/auth/google" className="block w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium">
            Continue with Google
          </a>
          <a href="/api/auth/facebook" className="block w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium">
            Continue with Facebook
          </a>
          <a href="/api/auth/apple" className="block w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium">
            Continue with Apple
          </a>
        </div>

        <div className="text-xs text-moonlight-300/60 uppercase tracking-widest">or</div>

        <form onSubmit={handleGuest} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Choose a name (optional)"
            maxLength={24}
            className="w-full bg-midnight-900/60 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-embergold-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-blood-500 hover:bg-blood-400 transition-colors font-semibold shadow-glow disabled:opacity-50"
          >
            {busy ? '...' : t('guest_login')}
          </button>
        </form>

        {error && <p className="text-xs text-blood-400">{error}</p>}

        <div className="flex justify-center gap-3 text-xs text-moonlight-300">
          <button className={i18n.language === 'en' ? 'text-embergold-300' : ''} onClick={() => setLanguage('en')}>
            EN
          </button>
          <span>/</span>
          <button className={i18n.language === 'ar' ? 'text-embergold-300' : ''} onClick={() => setLanguage('ar')}>
            AR
          </button>
        </div>
      </div>
    </div>
  );
}
