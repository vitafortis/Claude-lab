import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { checkAccount } from '#lib/server/accounts.ts';
import { getAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Checks that the account works (its agent's status, or a small request). */
export const POST: RequestHandler = handler(async ({ params }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	return json(await checkAccount(params.id, true));
});
