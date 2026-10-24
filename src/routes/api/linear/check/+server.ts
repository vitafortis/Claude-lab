import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { checkRules } from '#lib/server/linear.ts';
import type { RequestHandler } from './$types';

/** Checks the rules now instead of waiting for the next minute. */
export const POST: RequestHandler = handler(async () => json({ started: await checkRules() }));
