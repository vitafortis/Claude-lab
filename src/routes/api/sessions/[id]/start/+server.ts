import { json } from '@sveltejs/kit';
import { body, handler, NotFound } from '#lib/server/http.ts';
import { parseLaunch } from '#lib/server/sessions/input.ts';
import { pokeLive } from '#lib/server/sessions/live.ts';
import { startSession } from '#lib/server/sessions/runtime.ts';
import { getSession } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Starts a stopped session: picks up the newest conversation unless told otherwise. */
export const POST: RequestHandler = handler(async ({ params, request }) => {
	const s = getSession(params.id);
	if (!s) throw new NotFound('Session not found');
	const launch = parseLaunch(await body(request));
	void startSession(s.id, launch)
		.catch(() => {})
		.finally(pokeLive);
	return json({ ...s, status: 'starting', error: null });
});
