import { json } from '@sveltejs/kit';
import { body, handler } from '#lib/server/http.ts';
import { parseLaunch } from '#lib/server/sessions/input.ts';
import { pokeLive } from '#lib/server/sessions/live.ts';
import { relaunchClaude } from '#lib/server/sessions/runtime.ts';
import type { RequestHandler } from './$types';

/** Restarts Claude in the running container: new conversation, continue, or resume one. */
export const POST: RequestHandler = handler(async ({ params, request }) => {
	const s = await relaunchClaude(params.id, parseLaunch(await body(request)));
	pokeLive();
	return json(s);
});
