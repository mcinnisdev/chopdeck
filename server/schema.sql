-- Chop Deck account database (Cloudflare D1 / SQLite).
-- Apply locally:  npm run db:local     Apply to production:  npm run db:remote
-- Every statement is idempotent so the file can be re-run.

-- ---------- Better Auth core tables (camelCase columns are its defaults) ----------
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  handle TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free'
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_userId ON session(userId);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId ON account(userId);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE,
  updatedAt DATE
);
CREATE INDEX IF NOT EXISTS verification_identifier ON verification(identifier);

-- ---------- Chop Deck ----------
-- Content-addressed sound blobs: one row per SHA-256, bytes live in R2 under blobs/<hash>.
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  uploader_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  license TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS blobs_uploader ON blobs(uploader_id);

-- One project per user in phase 7 (the machine's whole state). Manifests reference sounds by hash.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  manifest TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  parent_beat_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS project_blobs (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hash TEXT NOT NULL REFERENCES blobs(hash),
  PRIMARY KEY (project_id, hash)
);
CREATE INDEX IF NOT EXISTS project_blobs_hash ON project_blobs(hash);
CREATE TABLE IF NOT EXISTS project_revs (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  manifest TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, revision)
);

-- Published kits: a program (sixteen pads with their note parameters) and the sounds it uses, by hash.
CREATE TABLE IF NOT EXISTS kits (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  license TEXT NOT NULL,
  manifest TEXT NOT NULL,
  pads TEXT NOT NULL DEFAULT '[]',
  sounds INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  takedown INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS kits_owner ON kits(owner_id);
CREATE INDEX IF NOT EXISTS kits_created ON kits(created_at);
CREATE TABLE IF NOT EXISTS kit_blobs (
  kit_id TEXT NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  hash TEXT NOT NULL REFERENCES blobs(hash),
  PRIMARY KEY (kit_id, hash)
);
CREATE INDEX IF NOT EXISTS kit_blobs_hash ON kit_blobs(hash);

-- Published samples: one sound each (a record, a break, a hit) for people to chop. The blob is a .SND.
CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  hash TEXT NOT NULL REFERENCES blobs(hash),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  license TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  rate INTEGER NOT NULL DEFAULT 44100,
  channels INTEGER NOT NULL DEFAULT 1,
  bytes INTEGER NOT NULL DEFAULT 0,
  peaks TEXT NOT NULL DEFAULT '[]',
  downloads INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  takedown INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS samples_owner ON samples(owner_id);
CREATE INDEX IF NOT EXISTS samples_hash ON samples(hash);
CREATE INDEX IF NOT EXISTS samples_created ON samples(created_at);

-- Development only: magic links land here when no email provider is configured.
CREATE TABLE IF NOT EXISTS dev_links (
  email TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
