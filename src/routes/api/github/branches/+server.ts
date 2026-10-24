import { json } from '@sveltejs/kit';
import { BadRequest, handler } from '#lib/server/http.ts';
import { listBranches } from '#lib/server/github.ts';
import { getGithubAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Branches of owner/name, through the given account (or anonymously, for public repos). */
export const GET: RequestHandler = handler(async ({ url }) => {
	const repo = url.searchParams.get('repo');
	if (!repo) throw new BadRequest('"repo" is required');
	const accountId = url.searchParams.get('account');
	return json(await listBranches(accountId ? (getGithubAccount(accountId) ?? null) : null, repo));
});
