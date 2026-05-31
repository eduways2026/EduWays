// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                    from 'next/headers';
import { db }                         from '@/lib/db';
import { users }                      from '@/lib/db/schema';
import {
  verifyPassword, createSession,
  SESSION_COOKIE, SESSION_EXPIRES, validateEmail,
} from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Look up user
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user) {
      // Generic message — don't reveal whether email exists
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Create session
    const token = await createSession(user.id, req);

    // Update last login
    await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, user.id));

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_EXPIRES / 1000,
      path:     '/',
    });

    return NextResponse.json({ success: true, redirect: '/dashboard' });
  } catch (err) {
    console.error('[/api/auth/login] Error:', err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
