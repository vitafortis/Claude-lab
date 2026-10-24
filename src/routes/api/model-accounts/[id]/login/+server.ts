import { json } from '@sveltejs/kit';
import { BadRequest, handler, NotFound } from '#lib/server/http.ts';
import { checkAccount, loginUrl, startLogin, stopLogin } from '#lib/server/accounts.ts';
import { getAccount } from '#lib/server/store.ts';
import { ACCOUNT_KINDS } from '#lib/providers.ts';
import type { RequestHandler } from './$types';

/** The sign-in link, once the agent has printed it. */
export const GET: RequestHandler = handler(async ({ params }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	return json({ url: await loginUrl(params.id) });
});

/** Starts the sign-in container; the browser then opens its terminal. */
export const POST: RequestHandler = handler(async ({ params }) => {
	const a = getAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	if (!ACCOUNT_KINDS[a.kind].signIn) throw new BadRequest('This account uses a key, not a sign-in');
	await startLogin(a.id);
	return json({ ok: true });
});

/** Closes the sign-in container and records whether the login worked. */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	await stopLogin(params.id);
	return json(await checkAccount(params.id));
});
