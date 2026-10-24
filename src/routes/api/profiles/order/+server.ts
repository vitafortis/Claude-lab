import { json } from '@sveltejs/kit';
import { BadRequest, body, handler } from '#lib/server/http.ts';
import { listProfiles, reorderProfiles } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Sets the matching order: {ids: [...]} with every profile once. */
export const PUT: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string') : [];
	const known = new Set(listProfiles().map((p) => p.id));
	if (ids.length !== known.size || !ids.every((id) => known.has(id)) || new Set(ids).size !== ids.length) throw new BadRequest('List every profile once');
	reorderProfiles(ids);
	return json(listProfiles());
});
