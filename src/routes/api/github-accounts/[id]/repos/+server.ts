import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { listRepos, lookupRepo, ownerRepos, searchRepos } from '#lib/server/github.ts';
import { getGithubAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** The token's repos; ?owner=… one owner's; ?search=… GitHub's search by name; ?repo=owner/name one repo. */
export const GET: RequestHandler = handler(async ({ params, url }) => {
	const a = getGithubAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	const repo = url.searchParams.get('repo');
	if (repo) return json(await lookupRepo(a, repo));
	const owner = url.searchParams.get('owner');
	if (owner) return json(await ownerRepos(a, owner));
	const search = url.searchParams.get('search');
	if (search) return json(await searchRepos(a, search));
	return json(await listRepos(a, url.searchParams.has('refresh')));
});
