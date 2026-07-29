import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useGameState } from '../hooks/useGameState.js';
import { useSoundManager } from '../hooks/useSoundManager.js';
import DayNightBackdrop from '../components/DayNightBackdrop.jsx';
import PlayerRoster from '../components/PlayerRoster.jsx';
import RoleCard from '../components/RoleCard.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function GamePage() {
  const { code } = useParams();
  const {
    gameState,
    chasseurPrompt,
    lastResolution,
    ended,
    messages,
    submitNightAction,
    castVote,
    fireChasseurShot,
    sendChat,
  } = useGameState(code);

  const { play, startTicking, stopTicking } = useSoundManager();
  const [selectedTarget, setSelectedTarget] = useState(null);
  const prevPhase = useRef(null);

  useEffect(() => {
    if (!gameState || gameState.phase === prevPhase.current) return;
    if (gameState.phase === 'night') play('wolfHowl');
    if (gameState.phase === 'day_discussion') play('morningBell');
    prevPhase.current = gameState.phase;
  }, [gameState, play]);

  useEffect(() => {
    if (gameState?.phase === 'day_vote') {
      startTicking(1000);
      return () => stopTicking();
    }
    stopTicking();
  }, [gameState?.phase, startTicking, stopTicking]);

  useEffect(() => {
    if (ended) play(ended.winningTeam ? 'victory' : 'defeat');
  }, [ended, play]);

  useEffect(() => {
    if (lastResolution?.type === 'lynch') play('lynch');
  }, [lastResolution, play]);

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center text-moonlight-300">
        Loading match...
      </div>
    );
  }

  const isNight = gameState.phase === 'night';
  const isVote = gameState.phase === 'day_vote';

  function handleNightConfirm() {
    if (!selectedTarget) return;
    submitNightAction({ target: selectedTarget }).then(() => setSelectedTarget(null));
  }

  function handleVoteConfirm() {
    if (!selectedTarget) return;
    castVote(selectedTarget);
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto space-y-6">
      <DayNightBackdrop phase={gameState.phase} />

      <div className="glass-panel p-4 text-center">
        <p className="font-display text-xl text-embergold-400">
          {isNight ? 'Night' : isVote ? 'Village Vote' : 'Day'} · Cycle {gameState.cycle}
        </p>
      </div>

      {ended ? (
        <div className="glass-panel p-8 text-center space-y-2">
          <h2 className="font-display text-3xl text-embergold-400">
            {ended.winningTeam === 'wolves'
              ? 'The Wolves Win'
              : ended.winningTeam === 'villagers'
              ? 'The Village Wins'
              : 'Game Over'}
          </h2>
        </div>
      ) : (
        <>
          <RoleCard role={gameState.yourRole} />

          {chasseurPrompt && (
            <div className="glass-panel p-4 space-y-3 border border-blood-500">
              <p className="text-sm text-blood-400 font-semibold">You have fallen — fire your final shot.</p>
              <PlayerRoster
                roster={chasseurPrompt.alive.map((id) => ({ userId: id, displayName: id, alive: true }))}
                selectable
                selectedId={selectedTarget}
                onSelect={setSelectedTarget}
              />
              <button
                onClick={() => fireChasseurShot(selectedTarget)}
                disabled={!selectedTarget}
                className="w-full py-2 rounded-lg bg-blood-500 hover:bg-blood-400 disabled:opacity-40"
              >
                Fire
              </button>
            </div>
          )}

          <PlayerRoster
            roster={gameState.roster}
            selectable={(isNight && gameState.canAct) || isVote}
            selectedId={selectedTarget}
            onSelect={setSelectedTarget}
          />

          {isNight && gameState.canAct && (
            <button
              onClick={handleNightConfirm}
              disabled={!selectedTarget}
              className="w-full py-3 rounded-xl bg-embergold-400 text-midnight-950 font-bold disabled:opacity-40"
            >
              Confirm Night Action
            </button>
          )}

          {isVote && gameState.alive && (
            <button
              onClick={handleVoteConfirm}
              disabled={!selectedTarget}
              className="w-full py-3 rounded-xl bg-embergold-400 text-midnight-950 font-bold disabled:opacity-40"
            >
              Cast Vote
            </button>
          )}

          <ChatPanel
            phase={gameState.phase}
            alive={gameState.alive ?? true}
            role={gameState.yourRole}
            messages={messages}
            onSend={sendChat}
          />
        </>
      )}
    </div>
  );
}
