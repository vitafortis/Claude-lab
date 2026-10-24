import { json } from '@sveltejs/kit';
import { BadRequest, handler, NotFound } from '#lib/server/http.ts';
import { checkAccount, loginUrl, startLogin, stopLogin } from '#lib/server/claude-accounts.ts';
import { getClaudeAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** The sign-in link, once `claude auth login` has printed it. */
export const GET: RequestHandler = handler(async ({ params }) => {
	if (!getClaudeAccount(params.id)) throw new NotFound('Account not found');
	return json({ url: await loginUrl(params.id) });
});

/** Starts the sign-in container; the browser then opens its terminal. */
export const POST: RequestHandler = handler(async ({ params }) => {
	const a = getClaudeAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	if (a.kind !== 'subscription') throw new BadRequest('Only subscription accounts sign in here');
	await startLogin(a.id);
	return json({ ok: true });
});

/** Closes the sign-in container and records whether the login worked. */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	if (!getClaudeAccount(params.id)) throw new NotFound('Account not found');
	await stopLogin(params.id);
	return json(await checkAccount(params.id));
});
