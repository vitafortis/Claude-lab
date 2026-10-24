import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { body, handler } from '#lib/server/http.ts';
import { pokeLive } from '#lib/server/sessions/live.ts';
import { parseSessionInput } from '#lib/server/sessions/input.ts';
import { startSession } from '#lib/server/sessions/runtime.ts';
import { createSession, listSessions } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(listSessions());

/** Creates a session and starts it in the background (the first start may pull the image). */
export const POST: RequestHandler = handler(async ({ request }) => {
	const { prompt, ...input } = parseSessionInput(await body(request));
	const session = createSession(randomUUID(), input);
	void startSession(session.id, { mode: 'new', prompt })
		.catch(() => {})
		.finally(pokeLive);
	return json({ ...session, status: 'starting' }, { status: 201 });
});
