import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

export function useFriends() {
  const { socket } = useSocket();
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const onRequestReceived = (data) => setIncomingRequests((prev) => [...prev, data]);
    const onRequestResolved = (data) =>
      setNotice(`${data.by.displayName} ${data.accepted ? 'accepted' : 'declined'} your friend request.`);
    const onInviteReceived = (data) => setIncomingInvites((prev) => [...prev, data]);

    socket.on('friend:requestReceived', onRequestReceived);
    socket.on('friend:requestResolved', onRequestResolved);
    socket.on('invite:roomReceived', onInviteReceived);

    return () => {
      socket.off('friend:requestReceived', onRequestReceived);
      socket.off('friend:requestResolved', onRequestResolved);
      socket.off('invite:roomReceived', onInviteReceived);
    };
  }, [socket]);

  const sendFriendRequest = useCallback(
    (targetUserId) => new Promise((resolve) => socket.emit('friend:request', { targetUserId }, resolve)),
    [socket]
  );

  const respondToRequest = useCallback(
    (requestId, accept) => {
      setIncomingRequests((prev) => prev.filter((r) => r.requestId !== requestId));
      return new Promise((resolve) => socket.emit('friend:respond', { requestId, accept }, resolve));
    },
    [socket]
  );

  const sendRoomInvite = useCallback(
    (targetUserId, roomCode) =>
      new Promise((resolve) => socket.emit('invite:room', { targetUserId, roomCode }, resolve)),
    [socket]
  );

  const dismissInvite = useCallback((inviteId) => {
    setIncomingInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
  }, []);

  return {
    incomingRequests,
    incomingInvites,
    notice,
    sendFriendRequest,
    respondToRequest,
    sendRoomInvite,
    dismissInvite,
  };
}
