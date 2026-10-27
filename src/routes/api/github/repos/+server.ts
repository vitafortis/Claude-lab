import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { allRepos } from '#lib/server/github.ts';
import type { RequestHandler } from './$types';

/** Every token's repos in one list; ?owner=… one owner's; ?search=… GitHub's search by name. */
export const GET: RequestHandler = handler(async ({ url }) =>
	json(
		await allRepos({
			owner: url.searchParams.get('owner') ?? undefined,
			search: url.searchParams.get('search') ?? undefined,
			refresh: url.searchParams.has('refresh')
		})
	)
);
