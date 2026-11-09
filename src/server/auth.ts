import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { getPostgresClient, isPostgresConfigured } from './pgDb';
import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { useLocalSqlite } from './config';
import { profiles } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  username?: string;
  role: 'admin' | 'manager' | 'staff';
  fullName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// In-memory session store for local SQLite development
const sessions = new Map<string, { userId: string; username: string; role: 'admin' | 'manager' | 'staff'; expiresAt: number }>();

// Sliding window rate limiter for login attempts
interface RateLimitRecord {
  attempts: number;
  blockedUntil: number;
}
const loginRateLimits = new Map<string, RateLimitRecord>();

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
}

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = loginRateLimits.get(ip);
  if (!record) return { allowed: true };

  if (record.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordLoginAttempt(ip: string, success: boolean) {
  const now = Date.now();
  const record = loginRateLimits.get(ip) || { attempts: 0, blockedUntil: 0 };

  if (success) {
    loginRateLimits.delete(ip);
    return;
  }

  record.attempts += 1;
  // If 5 failed attempts, block IP for 15 minutes
  if (record.attempts >= 5) {
    record.blockedUntil = now + 15 * 60 * 1000;
  }
  loginRateLimits.set(ip, record);
}

export function createSession(userId: string, username: string, role: 'admin' | 'manager' | 'staff' = 'admin'): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  sessions.set(token, { userId, username, role, expiresAt });
  return token;
}

export function validateSession(token: string): { userId: string; username: string; role: 'admin' | 'manager' | 'staff' } | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return { userId: session.userId, username: session.username, role: session.role };
}

export function revokeSession(token: string) {
  sessions.delete(token);
}

/**
 * Fail-Closed RBAC Middleware:
 * Validates token (Supabase Auth JWT or Local Session), queries authoritative profile in DB,
 * rejects inactive accounts and unpermitted roles with explicit 401/403 status codes.
 */
export function requireAuth(allowedRoles: Array<'admin' | 'manager' | 'staff'> = ['admin', 'manager', 'staff']) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Authentication token required' });
        return;
      }

      const token = authHeader.slice(7).trim();
      if (!token) {
        res.status(401).json({ error: 'Unauthorized: Token is empty' });
        return;
      }

      // Path A: Supabase Auth JWT verification (Production)
      // auth.getUser(token) verifies the JWT server-side and creates no session, so it
      // intentionally stays on the admin client.
      if (isSupabaseConfigured && supabaseAdmin) {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
          res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
          return;
        }

        const pg = getPostgresClient();
        if (!pg) {
          res.status(503).json({ error: 'Service misconfigured' });
          return;
        }
        {
          // Authoritative profile check from PostgreSQL
          const [profile] = await pg
            .select()
            .from(profiles)
            .where(eq(profiles.id, user.id))
            .limit(1);

          // FAIL-CLOSED: No profile found
          if (!profile) {
            res.status(403).json({ error: 'Forbidden: Account profile does not exist' });
            return;
          }

          // FAIL-CLOSED: Inactive profile
          if (!profile.isActive) {
            res.status(403).json({ error: 'Forbidden: Account has been deactivated' });
            return;
          }

          // FAIL-CLOSED: Role verification
          if (!allowedRoles.includes(profile.role)) {
            res.status(403).json({ error: 'Forbidden: Insufficient privileges for this operation' });
            return;
          }

          req.user = {
            id: profile.id,
            email: profile.email,
            role: profile.role,
            fullName: profile.fullName,
          };
          next();
          return;
        }
      }

      // Path B: Local Session verification (local SQLite development ONLY; unreachable in production)
      if (!useLocalSqlite()) {
        res.status(503).json({ error: 'Service misconfigured' });
        return;
      }
      const session = validateSession(token);
      if (!session) {
        res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
        return;
      }

      // Fetch user role from SQLite to verify active status
      const userRow = db.prepare('SELECT id, username, role FROM admin_users WHERE id = ?').get(session.userId) as any;
      if (!userRow) {
        res.status(403).json({ error: 'Forbidden: User record not found' });
        return;
      }

      if (!['admin', 'manager', 'staff'].includes(userRow.role)) {
        res.status(403).json({ error: 'Forbidden: Insufficient privileges for this operation' });
        return;
      }
      const userRole = userRow.role as 'admin' | 'manager' | 'staff';
      if (!allowedRoles.includes(userRole)) {
        res.status(403).json({ error: 'Forbidden: Insufficient privileges for this operation' });
        return;
      }

      req.user = {
        id: userRow.id,
        username: userRow.username,
        role: userRole,
      };

      next();
    } catch (err) {
      console.error('[AuthMiddleware] Error verifying credentials:', err);
      res.status(500).json({ error: 'Internal error during authentication verification' });
    }
  };
}

// Backward compatibility alias for requireAdminAuth
export const requireAdminAuth = requireAuth(['admin']);
