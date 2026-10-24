import { json } from '@sveltejs/kit';
import { BadRequest, body, handler, str } from '#lib/server/http.ts';
import { createClaudeAccount, listClaudeAccounts } from '#lib/server/store.ts';
import type { ClaudeAuthKind } from '#lib/types.ts';
import type { RequestHandler } from './$types';

const KINDS: ClaudeAuthKind[] = ['subscription', 'token', 'api_key'];

export const GET: RequestHandler = () => json(listClaudeAccounts());

/** Adds an account. Subscription accounts then sign in through /login; the others bring a secret. */
export const POST: RequestHandler = handler(async ({ request }) => {
	const b = await body(request);
	const kind = b.kind as ClaudeAuthKind;
	if (!KINDS.includes(kind)) throw new BadRequest('Pick how this account signs in');
	const name = str(b, 'name', { required: true, max: 80 })!;
	const secret = str(b, 'secret', { max: 4000 });
	if (kind === 'token' && !secret?.startsWith('sk-ant-oat')) throw new BadRequest('Paste the token `claude setup-token` printed (sk-ant-oat…)');
	if (kind === 'api_key' && !secret?.startsWith('sk-ant-')) throw new BadRequest('Paste an Anthropic API key (sk-ant-…)');
	return json(createClaudeAccount({ name, kind, secret: kind === 'subscription' ? undefined : secret! }), { status: 201 });
});
