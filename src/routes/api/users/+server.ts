import { json } from '@sveltejs/kit';
import { handler, requireAdmin } from '#lib/server/http.ts';
import { listUsers } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = handler(({ locals }) => {
	requireAdmin(locals);
	return json(listUsers());
});
