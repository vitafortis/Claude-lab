import { json } from '@sveltejs/kit';
import { body, Conflict, handler, NotFound, str } from '#lib/server/http.ts';
import { purgeAccount } from '#lib/server/claude-accounts.ts';
import { deleteClaudeAccount, getClaudeAccount, sessionsUsingClaudeAccount, updateClaudeAccount } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = handler(async ({ params, request }) => {
	const a = getClaudeAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	const b = await body(request);
	const name = str(b, 'name', { max: 80 });
	const secret = a.kind === 'subscription' ? null : str(b, 'secret', { max: 4000 });
	updateClaudeAccount(a.id, { name: name ?? undefined, secret: secret ?? undefined });
	return json(getClaudeAccount(a.id));
});

/** Deletes the account and its config folder (sign-in, settings, transcripts). */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	if (!getClaudeAccount(params.id)) throw new NotFound('Account not found');
	const n = sessionsUsingClaudeAccount(params.id);
	if (n) throw new Conflict(`${n} session${n === 1 ? ' uses' : 's use'} this account. Delete them or switch them to another account first.`);
	await purgeAccount(params.id);
	deleteClaudeAccount(params.id);
	return json({ ok: true });
});
