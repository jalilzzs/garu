import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import roomRoutes from './routes/room.routes.js';
import { configurePassport } from './config/passport.js';

export function createApp() {
  const app = express();
  const passport = configurePassport();

  app.use(
    cors({
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'loup-garou-server', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/rooms', roomRoutes);

  // Central error handler
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  });

  return app;
}
