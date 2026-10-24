import type { PageServerLoad } from './$types';
import { listAccounts, listGithubAccounts } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	accounts: listAccounts().length,
	githubAccounts: listGithubAccounts().length
});
