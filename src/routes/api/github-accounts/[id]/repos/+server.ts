import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { listRepos } from '#lib/server/github.ts';
import { getGithubAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = handler(async ({ params, url }) => {
	const a = getGithubAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	return json(await listRepos(a, url.searchParams.has('refresh')));
});
