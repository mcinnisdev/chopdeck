import type { SyncState } from '@/disk/sync';

/** The account link's text on either panel: SIGN IN, or the handle and a one-word sync state. */
export function accountLabel(s: SyncState): string {
  if (!s.user) return s.status === 'booting' ? '' : 'SIGN IN';
  const who = s.user.handle ? `@${s.user.handle.toUpperCase()}` : 'ACCOUNT';
  const word = { booting: '', standalone: '', 'signed-out': '', idle: '', syncing: 'SYNCING', synced: 'SYNCED', offline: 'OFFLINE', error: 'SYNC ERROR' }[s.status];
  return word ? `${who} · ${word}` : who;
}
