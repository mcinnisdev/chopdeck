// /beats/<handle>/: the feed page, titled for that person.
import type { Env } from '../../../server/env';

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const handle = String(ctx.params.handle ?? '');
  const page = await ctx.env.ASSETS.fetch(new URL('/beats/', ctx.request.url));
  const origin = new URL(ctx.request.url).origin;
  const title = `Beats by @${handle}`;
  const set = (attr: string, value: string) => ({ element(e: Element) { e.setAttribute(attr, value); } });
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(`${title} · Chop Deck`); } })
    .on('meta[name="description"]', set('content', `Everything @${handle} has published on Chop Deck.`))
    .on('link[rel="canonical"]', set('href', `${origin}/beats/${handle}/`))
    .on('meta[property="og:url"]', set('content', `${origin}/beats/${handle}/`))
    .on('meta[property="og:title"]', set('content', title))
    .transform(new Response(page.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } }));
};
