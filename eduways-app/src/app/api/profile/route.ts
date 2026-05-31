// src/app/api/profile/route.ts
// GET /api/profile — returns the logged-in user's profile + saved pathways
import { NextResponse }  from 'next/server';
import { getAuthUser }   from '@/lib/auth';
import { db }            from '@/lib/db';
import { studentProfiles, savedPathways } from '@/lib/db/schema';
import { eq, asc }       from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.user_id, user.id)).limit(1);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const pathways = await db.select().from(savedPathways)
    .where(eq(savedPathways.user_id, user.id))
    .orderBy(asc(savedPathways.pathway_rank));

  return NextResponse.json({
    user:     { id: user.id, email: user.email, username: user.username },
    profile,
    pathways,
  });
}
