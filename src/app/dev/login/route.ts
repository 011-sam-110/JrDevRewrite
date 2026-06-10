import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { isJobRole, type JobRole } from '@/domain/identity';
import { getDb } from '@/infra/db/client';
import { ensureProfile } from '@/infra/db/profiles';
import { accounts, sessions, users } from '@/infra/db/schema';

/**
 * DEV-ONLY one-click login — no email, no magic link. Visit /dev/login to be
 * signed in as a fully-onboarded fake Sussex account so you can browse the whole
 * app. Returns 404 in production, so it never ships.
 *
 *   /dev/login                 → dev@sussex.ac.uk, role backend, → /dashboard
 *   /dev/login?role=frontend   → seed/switch the user's job role
 *   /dev/login?next=/pools     → land somewhere specific afterwards
 *   /dev/login?email=a@sussex.ac.uk → a second distinct test account
 *
 * It mirrors what Auth.js's Drizzle adapter does on a real sign-in: upserts the
 * user + a (mock) GitHub link so onboarding reads as complete, writes a database
 * session row, and sets the session cookie auth() reads. No provider flow.
 */
const SESSION_DAYS = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Hard gate: this endpoint must not exist in production.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const params = req.nextUrl.searchParams;
  const roleParam = params.get('role') ?? 'backend';
  const role: JobRole = isJobRole(roleParam) ? roleParam : 'backend';
  const email = (params.get('email') ?? 'dev@sussex.ac.uk').toLowerCase();
  const next = params.get('next') ?? '/dashboard';
  const username = `${email.split('@')[0] ?? 'dev'}-dev`;

  const db = getDb();

  // 1. Upsert the dev user, fully onboarded (role + github username set).
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  const userId = existing?.id ?? randomUUID();
  if (existing) {
    await db
      .update(users)
      .set({ jobRole: role, githubUsername: username })
      .where(eq(users.id, userId));
  } else {
    await db.insert(users).values({
      id: userId,
      email,
      emailVerified: new Date(),
      jobRole: role,
      githubUsername: username,
    });
  }

  // 2. Mock GitHub link so onboardingStatus reads "complete" (idempotent).
  await db
    .insert(accounts)
    .values({
      userId,
      type: 'oauth',
      provider: 'github',
      providerAccountId: `dev-${userId}`,
      scope: 'read:user',
    })
    .onConflictDoNothing();

  // 3. Materialize the profile (starter credits) so /pools shows a real balance.
  await ensureProfile(userId);

  // 4. Create a database session + set the cookie auth() reads.
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId, expires });

  // Cookie name + secure flag must match how Auth.js issues them (secure only
  // over https; on localhost http it's the unprefixed name).
  const secure = req.nextUrl.protocol === 'https:';
  const cookieName = secure ? '__Secure-authjs.session-token' : 'authjs.session-token';

  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    expires,
  });
  return res;
}
