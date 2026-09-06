// Remix lineage: the beat this browser's project was started from, kept until the next publish.
// A tiny module so the machine's sync does not pull the beat renderer in.
const REMIX_KEY = 'chopdeck.remixOf';
export function setRemixOf(beatId: string | null) { try { if (beatId) localStorage.setItem(REMIX_KEY, beatId); else localStorage.removeItem(REMIX_KEY); } catch { /* private mode */ } }
export function getRemixOf(): string | null { try { return localStorage.getItem(REMIX_KEY); } catch { return null; } }
