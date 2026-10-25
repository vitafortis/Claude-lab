import { json } from '@sveltejs/kit';
import { body, handler, str } from '#lib/server/http.ts';
import { addGithubToken, deviceFlowEnabled } from '#lib/server/github.ts';
import { listGithubAccounts } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json({ accounts: listGithubAccounts(), deviceFlow: deviceFlowEnabled() });

/** Adds a personal access token, with an optional name (the same token again updates the saved one). */
export const POST: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	const label = str(b, 'label', { max: 80 }) ?? null;
	return json(await addGithubToken(str(b, 'token', { required: true, max: 400 })!, 'pat', { label }), { status: 201 });
});
