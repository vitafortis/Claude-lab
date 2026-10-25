import { json } from '@sveltejs/kit';
import { BadRequest, handler, NotFound } from '#lib/server/http.ts';
import { checkAccount, loginScreen, startLogin, stopLogin } from '#lib/server/accounts.ts';
import { getAccount } from '#lib/server/store.ts';
import { ACCOUNT_KINDS } from '#lib/providers.ts';
import type { RequestHandler } from './$types';

/** The sign-in link, other links and any one-time code, once the agent has printed them. */
export const GET: RequestHandler = handler(async ({ params }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	return json(await loginScreen(params.id));
});

/** Starts the sign-in container, or picks up the one already running; {restart: true} starts over. */
export const POST: RequestHandler = handler(async ({ params, request }) => {
	const a = getAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	if (!ACCOUNT_KINDS[a.kind].signIn) throw new BadRequest('This account uses a key, not a sign-in');
	const b = await request.json().catch(() => ({}));
	await startLogin(a.id, b?.restart === true);
	return json({ ok: true });
});

/** Closes the sign-in container and records whether the login worked. */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	await stopLogin(params.id);
	return json(await checkAccount(params.id));
});
