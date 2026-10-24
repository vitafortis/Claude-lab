import { json } from '@sveltejs/kit';
import { body, Conflict, handler, NotFound, str } from '#lib/server/http.ts';
import { purgeAccount } from '#lib/server/accounts.ts';
import { parseAccountFields } from '#lib/server/account-input.ts';
import { deleteAccount, getAccount, getAccountSecrets, sessionsUsingAccount, setAccountStatus, updateAccount } from '#lib/server/store.ts';
import { ACCOUNT_KINDS } from '#lib/providers.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = handler(async ({ params, request }) => {
	const a = getAccount(params.id);
	if (!a) throw new NotFound('Account not found');
	const b = await body(request);
	const name = str(b, 'name', { max: 80 });
	// Settings and keys change together; without "fields" only the name changes.
	const fields = b.fields ? parseAccountFields(a.kind, b, { account: a, secrets: getAccountSecrets(a.id) }) : null;
	updateAccount(a.id, { name: name ?? undefined, config: fields?.config, secrets: fields?.secrets });
	if (fields) setAccountStatus(a.id, { status: ACCOUNT_KINDS[a.kind].signIn ? a.status : 'unknown', email: a.email, plan: a.plan });
	return json(getAccount(a.id));
});

/** Deletes the account and its config folder (sign-in, settings, transcripts). */
export const DELETE: RequestHandler = handler(async ({ params }) => {
	if (!getAccount(params.id)) throw new NotFound('Account not found');
	const n = sessionsUsingAccount(params.id);
	if (n) throw new Conflict(`${n} session${n === 1 ? ' uses' : 's use'} this account. Delete them or switch them to another account first.`);
	await purgeAccount(params.id);
	deleteAccount(params.id);
	return json({ ok: true });
});
