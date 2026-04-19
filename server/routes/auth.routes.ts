import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = Router();
const googleClient = new OAuth2Client(config.googleClientId);

const TOKEN_EXPIRY = '48h';

// POST /api/auth/login
// Accepts a Google ID token, verifies it, and returns a custom 48-hour JWT.
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: 'Missing credential' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }

    const customToken = jwt.sign(
      {
        email: payload.email,
        sub: payload.sub,
        name: payload.name,
        picture: payload.picture,
      },
      config.jwtSecret,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ token: customToken });
  } catch (err) {
    console.error('[auth/login] verifyIdToken failed:', err);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

export default router;
