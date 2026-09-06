// /beats/<handle>/<slug>: the built beat page with its share tags filled in server-side, so links
// unfurl with the beat's own title, card and audio before any JavaScript runs.
import type { Env } from '../../../server/env';

interface Row { title: string; description: string; bpm: number; duration_ms: number; preview_hash: string; cover_hash: string | null; created_at: string; handle: string }

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const handle = String(ctx.params.handle ?? ''), slug = String(ctx.params.slug ?? '');
  const page = await ctx.env.ASSETS.fetch(new URL('/beat/', ctx.request.url));
  const row = await ctx.env.DB.prepare('SELECT b.title, b.description, b.bpm, b.duration_ms, b.preview_hash, b.cover_hash, b.created_at, u.handle FROM beats b JOIN user u ON u.id = b.owner_id WHERE u.handle = ? AND b.slug = ? AND b.takedown = 0').bind(handle, slug).first<Row>().catch(() => null);
  if (!row) return new Response(page.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  const origin = new URL(ctx.request.url).origin;
  const url = `${origin}/beats/${row.handle}/${slug}`;
  const title = `${row.title} by @${row.handle}`;
  const description = row.description.trim() || `A beat made on Chop Deck at ${row.bpm.toFixed(1)} bpm. Play it, open it on the machine, remix it.`;
  const image = row.cover_hash ? `${origin}/api/blobs/${row.cover_hash}` : `${origin}/og.png`;
  const audio = `${origin}/api/blobs/${row.preview_hash}`;
  const set = (attr: string, value: string) => ({ element(e: Element) { e.setAttribute(attr, value); } });
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'MusicRecording', name: row.title, byArtist: { '@type': 'Person', name: `@${row.handle}`, url: `${origin}/beats/${row.handle}/` }, url, image, audio, duration: `PT${Math.round(row.duration_ms / 1000)}S`, datePublished: row.created_at, description });
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(`${title} · Chop Deck`); } })
    .on('meta[name="description"]', set('content', description))
    .on('link[rel="canonical"]', set('href', url))
    .on('meta[property="og:url"]', set('content', url))
    .on('meta[property="og:title"]', set('content', title))
    .on('meta[property="og:description"]', set('content', description))
    .on('meta[property="og:image"]', set('content', image))
    .on('meta[name="twitter:title"]', set('content', title))
    .on('meta[name="twitter:description"]', set('content', description))
    .on('meta[name="twitter:image"]', set('content', image))
    .on('head', { element(e) { e.append(`<meta property="og:audio" content="${audio}" /><meta property="og:audio:type" content="audio/mpeg" /><script type="application/ld+json">${ld.replace(/</g, '\\u003c')}</script>`, { html: true }); } })
    .transform(new Response(page.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } }));
};
