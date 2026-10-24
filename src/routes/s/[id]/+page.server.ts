import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSession, listAccounts, listGithubAccounts } from '#lib/server/store.ts';

export const load: PageServerLoad = ({ params }) => {
	const session = getSession(params.id);
	if (!session) error(404, 'Session not found');
	return { session, accounts: listAccounts(), githubAccounts: listGithubAccounts() };
};
