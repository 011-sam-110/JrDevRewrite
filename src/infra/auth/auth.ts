import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import type { EmailConfig } from 'next-auth/providers/email';
import { checkEmailEligibility } from '@/domain/identity';
import { getDb } from '@/infra/db/client';
import { accounts, sessions, users, verificationTokens } from '@/infra/db/schema';
import { getEmailClient } from '@/infra/email';

/**
 * Sussex magic-link provider. Custom EmailConfig (not the Nodemailer provider)
 * so delivery goes through our mockable infra/email adapter — the dev client
 * logs the link instead of needing SMTP credentials.
 */
const sussexMagicLink: EmailConfig = {
  id: 'sussex',
  type: 'email',
  name: 'Sussex email',
  from: 'Junior Dev <signin@juniordev.local>',
  maxAge: 60 * 60, // links live 1 hour
  options: {},

  // Runs before the token is stored, so eligibility + normalization are
  // enforced at the auth boundary itself — a crafted POST straight to the
  // auth endpoint (skipping our form action) still can't enrol gmail.com or
  // mint duplicate accounts via AB123@ / ab123+tag@ variants.
  normalizeIdentifier(identifier) {
    const result = checkEmailEligibility(identifier);
    if (!result.eligible) {
      throw new Error(`Email not eligible (${result.reason}): only @sussex.ac.uk can sign in.`);
    }
    return result.normalized;
  },

  async sendVerificationRequest({ identifier, url }) {
    await getEmailClient().send({
      to: identifier,
      subject: 'Your Junior Dev sign-in link',
      text: `Sign in to Junior Dev:\n\n${url}\n\nThis link is valid for 1 hour and can be used once.`,
    });
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  trustHost: true,
  // The real GitHub OAuth provider joins this list when credentials land
  // (Needs from Sampo); the mock connect path doesn't go through Auth.js.
  providers: [sussexMagicLink],
  pages: {
    signIn: '/',
    verifyRequest: '/check-email',
    error: '/', // Auth.js appends ?error=<code>; the landing page renders it
  },
  callbacks: {
    // Belt-and-braces re-check of the enrolment gate (normalizeIdentifier is
    // the primary enforcement; defense in depth costs one pure function call).
    signIn({ user }) {
      return checkEmailEligibility(user.email ?? '').eligible;
    },
    // Database sessions: expose the user id so server code can load identity.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
