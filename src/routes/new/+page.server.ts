import type { PageServerLoad } from './$types';
import { getSettings, listClaudeAccounts, listGithubAccounts } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	claudeAccounts: listClaudeAccounts(),
	githubAccounts: listGithubAccounts(),
	settings: getSettings()
});
