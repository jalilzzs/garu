import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

/**
 * Subscribes to the live match's socket events and exposes a single
 * `gameState` object (already filtered per-viewer by the server — see
 * server/src/socket/payloadFilter.js) plus action dispatchers.
 */
export function useGameState(roomCode) {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState(null);
  const [chasseurPrompt, setChasseurPrompt] = useState(null);
  const [lastResolution, setLastResolution] = useState(null);
  const [ended, setEnded] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!socket || !roomCode) return;

    const onState = (payload) => setGameState(payload);
    const onNightResolved = (result) => setLastResolution({ type: 'night', ...result });
    const onLynchResolved = (result) => setLastResolution({ type: 'lynch', ...result });
    const onChasseurResolved = (result) => setLastResolution({ type: 'chasseur', ...result });
    const onChasseurPrompt = (data) => setChasseurPrompt(data);
    const onEnded = (data) => setEnded(data);
    const onMessage = (msg) => setMessages((prev) => [...prev, msg]);

    socket.on('game:state', onState);
    socket.on('game:nightResolved', onNightResolved);
    socket.on('game:lynchResolved', onLynchResolved);
    socket.on('game:chasseurResolved', onChasseurResolved);
    socket.on('game:chasseurPrompt', onChasseurPrompt);
    socket.on('game:ended', onEnded);
    socket.on('chat:message', onMessage);

    socket.emit('game:resume', { roomCode }, (ack) => {
      if (ack?.ok) setGameState(ack.state);
    });

    return () => {
      socket.off('game:state', onState);
      socket.off('game:nightResolved', onNightResolved);
      socket.off('game:lynchResolved', onLynchResolved);
      socket.off('game:chasseurResolved', onChasseurResolved);
      socket.off('game:chasseurPrompt', onChasseurPrompt);
      socket.off('game:ended', onEnded);
      socket.off('chat:message', onMessage);
    };
  }, [socket, roomCode]);

  const submitNightAction = useCallback(
    (action) => new Promise((resolve) => socket.emit('game:nightAction', { roomCode, action }, resolve)),
    [socket, roomCode]
  );

  const startVote = useCallback(
    () => new Promise((resolve) => socket.emit('game:startVote', { roomCode }, resolve)),
    [socket, roomCode]
  );

  const castVote = useCallback(
    (targetUserId) => new Promise((resolve) => socket.emit('game:vote', { roomCode, targetUserId }, resolve)),
    [socket, roomCode]
  );

  const resolveLynch = useCallback(
    () => new Promise((resolve) => socket.emit('game:resolveLynch', { roomCode }, resolve)),
    [socket, roomCode]
  );

  const fireChasseurShot = useCallback(
    (targetUserId) =>
      new Promise((resolve) => socket.emit('game:chasseurShot', { roomCode, targetUserId }, resolve)),
    [socket, roomCode]
  );

  const sendChat = useCallback(
    (channel, text) =>
      new Promise((resolve) => socket.emit('chat:send', { roomCode, channel, text }, resolve)),
    [socket, roomCode]
  );

  return {
    gameState,
    chasseurPrompt,
    lastResolution,
    ended,
    messages,
    submitNightAction,
    startVote,
    castVote,
    resolveLynch,
    fireChasseurShot,
    sendChat,
  };
}
