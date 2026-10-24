import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { listConversations } from '#lib/server/sessions/transcripts.ts';
import { getSession } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** The session's saved conversations, newest first, for "resume a conversation". */
export const GET: RequestHandler = handler(({ params }) => {
	const s = getSession(params.id);
	if (!s) throw new NotFound('Session not found');
	return json(listConversations(s));
});
