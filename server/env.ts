// Bindings and secrets the API runs with. Declared in wrangler.toml (bindings, vars) and set as
// Pages secrets or .dev.vars (everything else).
export interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  SITE_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Bearer token for the curation routes under /api/admin (seeding, featured, takedown). */
  ADMIN_TOKEN?: string;
  /** '1' to store magic links in dev_links instead of emailing them (local development and tests). */
  DEV_MAGIC_LINKS?: string;
}

export const PLAN_QUOTA_BYTES: Record<string, number> = { free: 250 * 1024 * 1024, supporter: 5 * 1024 * 1024 * 1024 };
export const MAX_BLOB_BYTES = 50 * 1024 * 1024;
export const REVISIONS_KEPT = 20;
