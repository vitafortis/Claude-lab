import { json } from '@sveltejs/kit';
import { BadRequest, body, handler, str } from '#lib/server/http.ts';
import { parseAccountFields } from '#lib/server/account-input.ts';
import { createAccount, listAccounts } from '#lib/server/store.ts';
import { isAccountKind } from '#lib/providers.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json(listAccounts());

/** Adds an account. Sign-in kinds then sign in through /login; the others bring their keys. */
export const POST: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	if (!isAccountKind(b.kind)) throw new BadRequest('Pick how this account connects');
	const name = str(b, 'name', { required: true, max: 80 })!;
	return json(createAccount({ name, kind: b.kind, ...parseAccountFields(b.kind, b) }), { status: 201 });
});
