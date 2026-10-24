import type { PageServerLoad } from './$types';
import { getSettings, listAccounts, listGithubAccounts, listProfiles } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	accounts: listAccounts(),
	profiles: listProfiles(),
	githubAccounts: listGithubAccounts(),
	settings: getSettings()
});
