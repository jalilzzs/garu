import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'change_me_super_secret';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      userId: user.userId,
      displayName: user.displayName,
      isGuest: user.isGuest,
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

/** Express middleware: requires a valid Bearer JWT, attaches req.auth. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Missing or malformed Authorization header' });
  }

  try {
    req.auth = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}
