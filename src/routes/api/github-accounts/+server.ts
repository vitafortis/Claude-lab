import { json } from '@sveltejs/kit';
import { body, handler, str } from '#lib/server/http.ts';
import { addGithubToken, deviceFlowEnabled } from '#lib/server/github.ts';
import { listGithubAccounts } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json({ accounts: listGithubAccounts(), deviceFlow: deviceFlowEnabled() });

/** Adds an account from a personal access token (or refreshes the token of a saved one). */
export const POST: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	return json(await addGithubToken(str(b, 'token', { required: true, max: 400 })!, 'pat'), { status: 201 });
});
