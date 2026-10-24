import type { PageServerLoad } from './$types';
import { DEFAULT_PROMPT, linearInfo } from '#lib/server/linear.ts';
import { listClaudeAccounts, listGithubAccounts, listLinearRules, listLinearRuns, listSessions } from '#lib/server/store.ts';

export const load: PageServerLoad = () => ({
	linear: linearInfo(),
	rules: listLinearRules(),
	runs: listLinearRuns(),
	defaultPrompt: DEFAULT_PROMPT,
	claudeAccounts: listClaudeAccounts(),
	githubAccounts: listGithubAccounts(),
	sessionNames: Object.fromEntries(listSessions().map((s) => [s.id, s.name]))
});
