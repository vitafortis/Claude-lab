import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { aiSummary } from '#lib/server/sessions/live.ts';
import type { RequestHandler } from './$types';

/** A plain-language summary from a small model, run with the session's own Claude account. */
export const POST: RequestHandler = handler(async ({ params }) => json(await aiSummary(params.id)));
