import { json } from '@sveltejs/kit';
import { BadRequest, handler } from '#lib/server/http.ts';
import { listPulls } from '#lib/server/github.ts';
import { getGithubAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Open pull requests of owner/name, for "check out a pull request". */
export const GET: RequestHandler = handler(async ({ url }) => {
	const repo = url.searchParams.get('repo');
	if (!repo) throw new BadRequest('"repo" is required');
	const accountId = url.searchParams.get('account');
	return json(await listPulls(accountId ? (getGithubAccount(accountId) ?? null) : null, repo));
});
