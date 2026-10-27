import { json } from '@sveltejs/kit';
import { BadRequest, handler, NotFound } from '#lib/server/http.ts';
import { checkToken } from '#lib/server/github.ts';
import { getGithubAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** GitHub's own answers for this token (and ?repo=owner/name), for telling why a repo is missing. */
export const GET: RequestHandler = handler(async ({ params, url }) => {
	const a = getGithubAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	const repo = url.searchParams.get('repo')?.trim() || null;
	if (repo && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new BadRequest('Enter the repository as owner/name');
	return json(await checkToken(a, repo));
});
