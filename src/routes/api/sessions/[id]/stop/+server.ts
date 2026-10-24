import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { pokeLive } from '#lib/server/sessions/live.ts';
import { stopSession } from '#lib/server/sessions/runtime.ts';
import type { RequestHandler } from './$types';

/** Stops the container; the repo, home folder and conversations stay for the next start. */
export const POST: RequestHandler = handler(async ({ params }) => {
	const s = await stopSession(params.id);
	pokeLive();
	return json(s);
});
