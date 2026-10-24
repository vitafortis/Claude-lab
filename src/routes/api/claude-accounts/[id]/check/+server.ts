import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { checkAccount } from '#lib/server/claude-accounts.ts';
import { getClaudeAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Runs `claude auth status` with the account's credentials. */
export const POST: RequestHandler = handler(async ({ params }) => {
	if (!getClaudeAccount(params.id)) throw new NotFound('Account not found');
	return json(await checkAccount(params.id));
});
