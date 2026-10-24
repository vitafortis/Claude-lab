import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { refreshOrgs } from '#lib/server/github.ts';
import { deleteGithubAccount, getGithubAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Re-reads the account's organizations. */
export const POST: RequestHandler = handler(async ({ params }) => {
	const a = getGithubAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	await refreshOrgs(a);
	return json(getGithubAccount(a.id));
});

/** Forgets the token. Sessions using it keep running and lose GitHub access on their next start. */
export const DELETE: RequestHandler = handler(({ params }) => {
	if (!deleteGithubAccount(params.id)) throw new NotFound('Account not found');
	return json({ ok: true });
});
