const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), userId: user.userId, displayName: user.displayName },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
