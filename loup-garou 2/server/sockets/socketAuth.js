const { verifyToken } = require('../config/jwt');
const User = require('../src/models/User');

module.exports = async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized: no token.'));
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) return next(new Error('Unauthorized: user not found.'));
    socket.user = {
      id: user._id.toString(),
      userId: user.userId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
    next();
  } catch (err) {
    next(new Error('Unauthorized: invalid token.'));
  }
};
