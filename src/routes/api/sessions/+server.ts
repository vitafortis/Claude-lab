import { json } from '@sveltejs/kit';
import { body, handler } from '#lib/server/http.ts';
import { launchNewSession } from '#lib/server/sessions/create.ts';
import { parseSessionInput } from '#lib/server/sessions/input.ts';
import { listSessions } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(listSessions());

/** Creates a session and starts it in the background (the first start may pull the image). */
export const POST: RequestHandler = handler(async ({ request }) => json(await launchNewSession(parseSessionInput(await body(request))), { status: 201 }));
