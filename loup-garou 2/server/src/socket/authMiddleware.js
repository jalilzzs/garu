import { verifyToken } from '../config/jwt.js';
import User from '../models/User.js';

/**
 * Attaches `socket.user` (a lean plain object: {id, userId, displayName})
 * after verifying the JWT passed in the connection handshake, either as
 * `auth: { token }` (socket.io-client's recommended way) or as an
 * `Authorization: Bearer <token>` header for non-browser clients.
 */
export function socketAuthMiddleware() {
  return async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('AUTH_REQUIRED'));
      }

      const payload = verifyToken(token);
      const user = await User.findById(payload.sub);
      if (!user) {
        return next(new Error('AUTH_USER_NOT_FOUND'));
      }

      socket.user = {
        id: user._id.toString(),
        userId: user.userId,
        displayName: user.displayName,
      };

      next();
    } catch (err) {
      next(new Error('AUTH_INVALID_TOKEN'));
    }
  };
}
