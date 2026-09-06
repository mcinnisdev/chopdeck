// Sign-in: Better Auth over D1, passwordless. Magic links by email plus Google and GitHub when
// their client ids are configured. Sessions are cookies on chopdeck.com; the machine and the pages
// share the origin, so both see the same session.
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { Env } from './env';

export type Auth = ReturnType<typeof makeAuth>;

async function deliverMagicLink(env: Env, email: string, url: string): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'Chop Deck <hello@mail.chopdeck.com>',
        to: [email],
        subject: 'Your Chop Deck sign-in link',
        text: `Press this link to sign in to Chop Deck:\n\n${url}\n\nIt works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
      }),
    });
    if (!res.ok) throw new Error(`email failed: ${res.status}`);
    return;
  }
  if (env.DEV_MAGIC_LINKS === '1') {
    await env.DB.prepare('INSERT INTO dev_links (email, url) VALUES (?, ?)').bind(email, url).run();
    return;
  }
  throw new Error('no email provider configured');
}

export function makeAuth(env: Env) {
  const db = new Kysely<Record<string, Record<string, unknown>>>({ dialect: new D1Dialect({ database: env.DB }) });
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  return betterAuth({
    appName: 'Chop Deck',
    baseURL: env.SITE_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: { db, type: 'sqlite' },
    trustedOrigins: [env.SITE_URL],
    user: {
      additionalFields: {
        handle: { type: 'string', required: false, input: false },
        plan: { type: 'string', required: false, defaultValue: 'free', input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    // D1 refuses the PRAGMA queries Kysely's introspection uses; the schema is ours (schema.sql), so skip the check
    advanced: { database: { validateSchema: false } },
    socialProviders,
    plugins: [magicLink({ expiresIn: 60 * 15, sendMagicLink: async ({ email, url }) => { await deliverMagicLink(env, email, url); } })],
  });
}

export interface SessionUser { id: string; email: string; name: string; handle: string | null; plan: string }

/** The signed-in user for a request, or null. */
export async function sessionUser(auth: Auth, req: Request): Promise<SessionUser | null> {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return null;
  const u = s.user as unknown as { id: string; email: string; name: string; handle?: string | null; plan?: string | null };
  return { id: u.id, email: u.email, name: u.name, handle: u.handle ?? null, plan: u.plan ?? 'free' };
}
