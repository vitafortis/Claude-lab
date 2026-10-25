import type { PageServerLoad } from './$types';
import { loginsInProgress } from '#lib/server/accounts.ts';
import { listAccounts, listGithubAccounts } from '#lib/server/store.ts';

export const load: PageServerLoad = async () => ({
	accounts: listAccounts().map(({ id, name, kind, status }) => ({ id, name, kind, status })),
	signingIn: await loginsInProgress(),
	githubAccounts: listGithubAccounts().length
});
