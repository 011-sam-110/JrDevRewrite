import type { DefaultSession } from 'next-auth';

/* Module augmentation: with database sessions we always copy user.id into the
   session (see callbacks.session), so the type promises it. */
declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}
