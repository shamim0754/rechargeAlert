import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type AuthUser = { sub: string; role: 'user' | 'admin'; username?: string };

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

function secret(): string {
  return process.env.JWT_SECRET || 'dev-secret';
}

export function signToken(payload: AuthUser): string {
  return jwt.sign(payload, secret(), { expiresIn: '30d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Sign in required.' });
    return;
  }
  try {
    req.auth = jwt.verify(header.slice(7), secret()) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Invalid or expired token.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Admin only.' });
      return;
    }
    next();
  });
}
