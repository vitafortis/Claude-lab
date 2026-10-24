import { sseResponse } from '#lib/server/sse.ts';
import { subscribeLive } from '#lib/server/sessions/live.ts';
import { listSessions } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Server-Sent Events: the sessions and their live state after every poll. */
export const GET: RequestHandler = ({ request }) =>
	sseResponse(request.signal, (channel) => subscribeLive((live) => channel.send('live', { sessions: listSessions(), live })));
