import { json } from '@sveltejs/kit';
import { body, handler, NotFound, str } from '#lib/server/http.ts';
import { typeIntoLogin } from '#lib/server/accounts.ts';
import { getAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Types a pasted code into the sign-in terminal and presses Enter. */
export const POST: RequestHandler = handler(async ({ params, request }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	const text = str(await body(request), 'text', { required: true, max: 4000 })!.replace(/[\r\n]+/g, '');
	await typeIntoLogin(params.id, text);
	return json({ ok: true });
});
