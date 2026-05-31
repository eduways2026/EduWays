// src/lib/auth/index.ts
// ─────────────────────────────────────────────────────────────────
// EduWays Auth Utilities
// - Password hashing with bcrypt
// - Session token generation & verification
// - Cookie helpers for SSR
// ─────────────────────────────────────────────────────────────────
import { cookies }  from 'next/headers';
import { db }        from '../db';
import { users, sessions } from '../db/schema';
import { eq, gt }    from 'drizzle-orm';
import * as crypto   from 'crypto';

// ── PASSWORD HASHING ──────────────────────────────────────────────
// Uses Web Crypto API (no native addons needed in Next.js edge/node)
const ITERATIONS = 100_000;
const KEY_LENGTH  = 32;
const DIGEST      = 'SHA-256';

export async function hashPassword(password: string): Promise<string> {
  const salt   = crypto.randomBytes(16).toString('hex');
  const hash   = await pbkdf2(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const attempt = await pbkdf2(password, salt);
  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
}

async function pbkdf2(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Buffer.from(salt, 'hex'), iterations: ITERATIONS, hash: DIGEST },
    keyMaterial, KEY_LENGTH * 8
  );
  return Buffer.from(bits).toString('hex');
}

// ── PASSWORD VALIDATION ───────────────────────────────────────────
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8)  return { valid: false, message: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one uppercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Password must contain at least one number' };
  return { valid: true };
}

// ── SESSION MANAGEMENT ────────────────────────────────────────────
const SESSION_COOKIE  = 'eduways_session';
const SESSION_EXPIRES = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string, request?: Request): Promise<string> {
  const token      = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + SESSION_EXPIRES);
  await db.insert(sessions).values({
    user_id:       userId,
    session_token: token,
    expires_at,
    ip_address:    request?.headers.get('x-forwarded-for') ?? undefined,
    user_agent:    request?.headers.get('user-agent')      ?? undefined,
  });
  return token;
}

export async function getSessionUser(token: string) {
  if (!token) return null;
  const now = new Date();
  const [row] = await db
    .select({ user: users, expires: sessions.expires_at })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(eq(sessions.session_token, token))
    .limit(1);
  if (!row || row.expires < now) return null;
  return row.user;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.session_token, token));
}

export async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(token);
}

export { SESSION_COOKIE, SESSION_EXPIRES };

// ── USERNAME VALIDATION ───────────────────────────────────────────
export function validateUsername(username: string): { valid: boolean; message?: string } {
  if (username.length < 3)  return { valid: false, message: 'Username must be at least 3 characters' };
  if (username.length > 30) return { valid: false, message: 'Username must be 30 characters or less' };
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return { valid: false, message: 'Username may only contain letters, numbers, and underscores' };
  return { valid: true };
}

// ── EMAIL VALIDATION ──────────────────────────────────────────────
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
