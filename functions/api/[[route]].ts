// Cloudflare Pages Function: every /api/* request goes to the Hono app in server/.
import { app } from '../../server/app';
import type { Env } from '../../server/env';

export const onRequest: PagesFunction<Env> = ctx => app.fetch(ctx.request, ctx.env, ctx as unknown as ExecutionContext);
