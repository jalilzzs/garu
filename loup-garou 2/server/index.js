require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const passport = require('./config/passport');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const friendRoutes = require('./routes/friends');
const socketAuth = require('./sockets/socketAuth');
const { registerGameSocket } = require('./sockets/gameSocket');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// إضافة رابط الـ Frontend الجديد ورابط اللوكال
const ALLOWED_ORIGINS = [
  'https://loup-garou-dz-exsq.onrender.com',
  'http://localhost:5173',
  process.env.CLIENT_URL
].filter(Boolean);

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/friends', friendRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

io.use(socketAuth);
registerGameSocket(io);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

start();
