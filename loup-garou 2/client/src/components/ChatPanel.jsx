import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export default function ChatPanel({ phase, alive, role, messages, onSend }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const isWolf = role === 'loup_garou' || role === 'loup_garou_noir';
  const isNight = phase === 'night';

  const activeChannel = useMemo(() => {
    if (!alive) return 'dead';
    if (isNight) return isWolf ? 'wolves' : null;
    return 'day';
  }, [alive, isNight, isWolf]);

  const channelLabel = {
    day: t('villagers_chat'),
    wolves: t('wolves_chat'),
    dead: t('dead_chat'),
  }[activeChannel];

  const visibleMessages = messages.filter((m) => m.channel === activeChannel);

  function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || !activeChannel) return;
    onSend(activeChannel, draft.trim());
    setDraft('');
  }

  return (
    <div className="glass-panel flex flex-col h-80 w-full max-w-md">
      <div className="px-4 py-2 border-b border-white/10">
        <p className="text-xs uppercase tracking-widest text-moonlight-300">
          {activeChannel ? channelLabel : 'Chat unavailable right now'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 text-sm">
        {visibleMessages.map((m, i) => (
          <p key={i}>
            <span className="text-embergold-300 font-medium">{m.displayName}: </span>
            <span className="text-moonlight-200">{m.text}</span>
          </p>
        ))}
        {visibleMessages.length === 0 && (
          <p className="text-moonlight-300/60 italic">No messages yet.</p>
        )}
      </div>

      {activeChannel && (
        <form onSubmit={handleSubmit} className="flex gap-2 p-2 border-t border-white/10">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Say something..."
            className="flex-1 bg-midnight-900/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-embergold-400"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-blood-500 hover:bg-blood-400 text-sm font-medium"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
