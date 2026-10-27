/**
 * A session's GitHub credentials, as files in its .orb folder (/session/.orb in the
 * container) rather than environment variables, which are fixed when the container is
 * created. Rewritten whenever the session's GitHub account or that account's token changes,
 * so a running session pushes with the current token without a restart:
 *
 *   github-token   read by git's credential helper (see GIT_ENV)
 *   gh/hosts.yml   gh's login (GH_CONFIG_DIR points there)
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGithubAccount, getGithubToken, listSessions } from '../store.ts';
import type { Session } from '../../types.ts';
import { metaDir } from './storage.ts';

const IN_CONTAINER = '/session/.orb';

// git config through the environment (GIT_CONFIG_COUNT), so it holds on any session image.
const GIT_CONFIG: [string, string][] = [
	[
		'credential.https://github.com.helper',
		`!f() { test "$1" = get || exit 0; t=$(cat ${IN_CONTAINER}/github-token 2>/dev/null); test -n "$t" || exit 0; echo username=x-access-token; echo "password=$t"; }; f`
	],
	// Remotes copied as SSH URLs go over https too, with the token: containers have no SSH key.
	['url.https://github.com/.insteadOf', 'git@github.com:'],
	['url.https://github.com/.insteadOf', 'ssh://git@github.com/']
];

/** Environment for session containers: where git and gh find the session's GitHub login. */
export const GIT_ENV = [
	`GH_CONFIG_DIR=${IN_CONTAINER}/gh`,
	`GIT_CONFIG_COUNT=${GIT_CONFIG.length}`,
	...GIT_CONFIG.flatMap(([k, v], i) => [`GIT_CONFIG_KEY_${i}=${k}`, `GIT_CONFIG_VALUE_${i}=${v}`])
];

function write(path: string, text: string) {
	writeFileSync(path, text, { mode: 0o600 });
	chmodSync(path, 0o600);
}

/** Writes (or, without a GitHub account, removes) the session's credential files. */
export function writeGithubCredentials(s: Pick<Session, 'id' | 'githubAccountId'>, opts: { remove?: boolean } = {}) {
	const dir = metaDir(s.id);
	if (!existsSync(dir)) return;
	const account = !opts.remove && s.githubAccountId ? getGithubAccount(s.githubAccountId) : undefined;
	const token = account ? getGithubToken(account.id) : undefined;
	const ghDir = join(dir, 'gh');
	if (!account || !token) {
		rmSync(join(dir, 'github-token'), { force: true });
		rmSync(join(ghDir, 'hosts.yml'), { force: true });
		return;
	}
	write(join(dir, 'github-token'), `${token}\n`);
	mkdirSync(ghDir, { recursive: true, mode: 0o700 });
	// gh's own layout when it keeps the token in its config file.
	write(
		join(ghDir, 'hosts.yml'),
		`github.com:\n    users:\n        ${account.login}:\n            oauth_token: ${token}\n    git_protocol: https\n    oauth_token: ${token}\n    user: ${account.login}\n`
	);
}

/** After a GitHub token changes: every running session using it gets the new one. */
export function refreshGithubCredentials(githubAccountId: string) {
	for (const s of listSessions()) {
		if (s.githubAccountId === githubAccountId && (s.status === 'running' || s.status === 'starting')) writeGithubCredentials(s);
	}
}
