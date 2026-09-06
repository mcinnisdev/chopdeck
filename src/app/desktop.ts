// The desktop app (Tauri) runs the same build as the website. This is the only file that knows the
// difference: a native save dialog instead of a browser download, links opened in the system browser,
// and the owner's manual in its own window. Everything Tauri-specific is imported lazily so the web
// bundle never carries it.
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Save bytes through the native dialog. Resolves false if the user cancelled. */
export async function desktopSave(name: string, bytes: Uint8Array): Promise<boolean> {
  const [{ save }, { writeFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const path = await save({ defaultPath: name, filters: ext ? [{ name: `${ext.toUpperCase()} file`, extensions: [ext] }] : undefined });
  if (!path) return false;
  await writeFile(path, bytes);
  return true;
}

/** Open a URL in the system browser. */
export async function desktopOpen(url: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

/** The manual in a second window, reusing it if it is already open. */
export async function desktopManual(hash = ''): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel('manual');
  if (existing) { await existing.setFocus(); return; }
  new WebviewWindow('manual', { url: `/manual/index.html${hash}`, title: "Chop Deck Owner's Manual", width: 1100, height: 860, minWidth: 700, minHeight: 500 });
}

/**
 * Route link clicks the way a desktop app should: web addresses to the system browser, the manual to
 * its own window. Installed once at power-on when running under Tauri.
 */
export function installDesktopLinks(): void {
  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (/^https?:\/\//.test(href)) { e.preventDefault(); e.stopPropagation(); void desktopOpen(href); return; }
    if (href.startsWith('/manual/') || href.startsWith('/manual/index.html')) { e.preventDefault(); e.stopPropagation(); void desktopManual(href.includes('#') ? href.slice(href.indexOf('#')) : ''); }
  }, true);
}
