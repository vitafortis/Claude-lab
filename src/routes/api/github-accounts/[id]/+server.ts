import { json } from '@sveltejs/kit';
import { body, handler, NotFound, str } from '#lib/server/http.ts';
import { addGithubToken, refreshOrgs } from '#lib/server/github.ts';
import { deleteGithubAccount, getGithubAccount, listSessions, setGithubLabel } from '#lib/server/store.ts';
import { writeGithubCredentials } from '#lib/server/sessions/github.ts';
import type { RequestHandler } from './$types';

/** Re-reads the account's organizations. */
export const POST: RequestHandler = handler(async ({ params }) => {
	const a = getGithubAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	await refreshOrgs(a);
	return json(getGithubAccount(a.id));
});

/** Renames the connection and/or swaps in a new token; sessions and automations using it keep it. */
export const PATCH: RequestHandler = handler(async ({ params, request }) => {
	const a = getGithubAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	const b = await body(request);
	const label = 'label' in b ? (str(b, 'label', { max: 80 }) ?? null) : undefined;
	const token = str(b, 'token', { max: 400 });
	if (token) return json(await addGithubToken(token, 'pat', { label, replace: a.id }));
	if (label !== undefined) setGithubLabel(a.id, label);
	return json(getGithubAccount(a.id));
});

/** Forgets the token. Sessions using it keep running without GitHub access. */
export const DELETE: RequestHandler = handler(({ params }) => {
	const using = listSessions().filter((s) => s.githubAccountId === params.id);
	if (!deleteGithubAccount(params.id)) throw new NotFound('Account not found');
	// Running sessions lose it now, not at their next start.
	for (const s of using) writeGithubCredentials({ id: s.id, githubAccountId: null });
	return json({ ok: true });
});
