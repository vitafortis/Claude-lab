import type { PageServerLoad } from './$types';
import { listClaudeAccounts, listGithubAccounts } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	claudeAccounts: listClaudeAccounts().length,
	githubAccounts: listGithubAccounts().length
});
