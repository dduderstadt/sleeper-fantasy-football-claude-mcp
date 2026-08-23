import { timingSafeEqual } from 'node:crypto';

function tokensMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware enforcing a static bearer token on every request.
 * This is the only thing standing between this server's Sleeper league
 * data and the open internet, so a missing/invalid token is always
 * rejected — there is no bypass.
 */
export function bearerAuth(expectedToken) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token || !tokensMatch(token, expectedToken)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: missing or invalid bearer token' },
        id: null,
      });
      return;
    }

    next();
  };
}
