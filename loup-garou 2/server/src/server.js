import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { socketAuthMiddleware } from './socket/authMiddleware.js';
import { registerGameHandlers } from './socket/gameHandlers.js';
import { registerFriendHandlers } from './socket/friendHandlers.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use(socketAuthMiddleware());

  io.on('connection', (socket) => {
    console.log('[socket] connected:', socket.id, socket.user?.userId);

    registerGameHandlers(io, socket);
    registerFriendHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', socket.id, reason);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
