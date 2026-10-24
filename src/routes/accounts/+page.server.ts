import type { PageServerLoad } from './$types';
import { deviceFlowEnabled } from '#lib/server/github.ts';
import { listClaudeAccounts, listGithubAccounts } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	claudeAccounts: listClaudeAccounts(),
	githubAccounts: listGithubAccounts(),
	deviceFlow: deviceFlowEnabled()
});
