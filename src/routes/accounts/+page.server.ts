import type { PageServerLoad } from './$types';
import { deviceFlowEnabled } from '#lib/server/github.ts';
import { listAccounts, listGithubAccounts, listProfiles } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	accounts: listAccounts(),
	profiles: listProfiles(),
	githubAccounts: listGithubAccounts(),
	deviceFlow: deviceFlowEnabled()
});
