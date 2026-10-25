/**
 * GitHub accounts: a personal access token (classic or fine-grained), or "Sign in with
 * GitHub" through the device flow when CCM_GITHUB_CLIENT_ID names an OAuth app.
 * Tokens list repositories and are handed to session containers for clone and push.
 */
import { randomToken } from './crypto.ts';
import { config } from './config.ts';
import { BadRequest } from './http.ts';
import { getGithubToken, getSettings, setGithubOrgs, upsertGithubAccount, type GithubAccountInput } from './store.ts';
import type { GithubAccount, GithubPull, GithubRepo, SessionPr } from '#lib/types.ts';

const API = 'https://api.github.com';

/** A GitHub REST call, with the account's token or anonymously (public repos). */
async function gh<T>(token: string | undefined, path: string): Promise<{ data: T; headers: Headers }> {
	const res = await fetch(`${API}${path}`, {
		headers: {
			accept: 'application/vnd.github+json',
			...(token ? { authorization: `Bearer ${token}` } : {}),
			'x-github-api-version': '2022-11-28',
			'user-agent': 'cc-modern'
		},
		signal: AbortSignal.timeout(15_000)
	});
	if (res.status === 401) throw new BadRequest('GitHub rejected the token (expired or revoked?)');
	if (res.status === 404 && !token) throw new BadRequest('Repository not found (private? pick a GitHub account)');
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { message?: string };
		throw new BadRequest(`GitHub: ${body.message ?? res.statusText}`);
	}
	return { data: (await res.json()) as T, headers: res.headers };
}

const FULL_NAME = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const tokenOf = (account: GithubAccount | null) => (account ? getGithubToken(account.id) : undefined);

type GhUser = { id: number; login: string; name: string | null; avatar_url: string };
type GhRepo = {
	full_name: string;
	name: string;
	owner: { login: string };
	private: boolean;
	default_branch: string;
	description: string | null;
	pushed_at: string | null;
	html_url: string;
};

async function orgsOf(token: string): Promise<string[]> {
	try {
		const { data } = await gh<{ login: string }[]>(token, '/user/orgs?per_page=100');
		return data.map((o) => o.login);
	} catch {
		// Fine-grained tokens without org access can't list orgs; repos still work.
		return [];
	}
}

/** Checks a token and saves (or refreshes) the account it belongs to. */
export async function addGithubToken(token: string, kind: GithubAccount['kind'], opts: { label?: string | null; replace?: string } = {}): Promise<GithubAccount> {
	const t = token.trim();
	if (!t) throw new BadRequest('Paste a token');
	const { data: user, headers } = await gh<GhUser>(t, '/user');
	const input: GithubAccountInput = {
		login: user.login,
		name: user.name,
		avatarUrl: user.avatar_url,
		kind,
		token: t,
		scopes: headers.get('x-oauth-scopes'),
		orgs: await orgsOf(t),
		// Commits from sessions use the account's GitHub noreply address.
		gitName: user.name || user.login,
		gitEmail: `${user.id}+${user.login}@users.noreply.github.com`
	};
	const account = upsertGithubAccount(input, opts);
	repoCache.delete(account.id);
	return account;
}

export async function refreshOrgs(account: GithubAccount): Promise<string[]> {
	const token = getGithubToken(account.id);
	if (!token) return [];
	const orgs = await orgsOf(token);
	setGithubOrgs(account.id, orgs);
	return orgs;
}

const toRepo = (r: GhRepo): GithubRepo => ({
	fullName: r.full_name,
	owner: r.owner.login,
	name: r.name,
	private: r.private,
	defaultBranch: r.default_branch,
	description: r.description,
	pushedAt: r.pushed_at,
	url: r.html_url
});

const repoCache = new Map<string, { at: number; repos: GithubRepo[] }>();

/** Every repo the token can see (own, collaborator, org member), most recently pushed first. */
export async function listRepos(account: GithubAccount, refresh = false): Promise<GithubRepo[]> {
	const hit = repoCache.get(account.id);
	if (!refresh && hit && Date.now() - hit.at < 2 * 60_000) return hit.repos;
	const token = getGithubToken(account.id);
	if (!token) return [];
	const repos: GithubRepo[] = [];
	for (let page = 1; page <= 10; page++) {
		const { data } = await gh<GhRepo[]>(token, `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`);
		repos.push(...data.map(toRepo));
		if (data.length < 100) break;
	}
	repoCache.set(account.id, { at: Date.now(), repos });
	return repos;
}

export async function listBranches(account: GithubAccount | null, fullName: string): Promise<string[]> {
	if (!FULL_NAME.test(fullName)) throw new BadRequest('Invalid repository');
	const branches: string[] = [];
	for (let page = 1; page <= 5; page++) {
		const { data } = await gh<{ name: string }[]>(tokenOf(account), `/repos/${fullName}/branches?per_page=100&page=${page}`);
		branches.push(...data.map((b) => b.name));
		if (data.length < 100) break;
	}
	return branches;
}

type GhPull = {
	number: number;
	title: string;
	user: { login: string } | null;
	draft: boolean;
	state: 'open' | 'closed';
	merged_at: string | null;
	head: { ref: string; repo: { full_name: string } | null };
	updated_at: string;
	html_url: string;
};

const toPull = (p: GhPull): GithubPull => ({
	number: p.number,
	title: p.title,
	author: p.user?.login ?? null,
	draft: p.draft,
	headRef: p.head.ref,
	headRepo: p.head.repo?.full_name ?? null,
	updatedAt: p.updated_at,
	url: p.html_url
});

/** Open pull requests, most recently updated first, for "check out a pull request". */
export async function listPulls(account: GithubAccount | null, fullName: string): Promise<GithubPull[]> {
	if (!FULL_NAME.test(fullName)) throw new BadRequest('Invalid repository');
	const { data } = await gh<GhPull[]>(tokenOf(account), `/repos/${fullName}/pulls?state=open&sort=updated&direction=desc&per_page=50`);
	return data.map(toPull);
}

export async function getPull(account: GithubAccount | null, fullName: string, number: number): Promise<GithubPull> {
	if (!FULL_NAME.test(fullName)) throw new BadRequest('Invalid repository');
	const { data } = await gh<GhPull>(tokenOf(account), `/repos/${fullName}/pulls/${number}`);
	return toPull(data);
}

/** The newest pull request opened from `branch` of the repo, if any. */
export async function findPrForBranch(account: GithubAccount | null, fullName: string, branch: string): Promise<SessionPr | null> {
	const owner = fullName.split('/')[0];
	const q = new URLSearchParams({ head: `${owner}:${branch}`, state: 'all', per_page: '1' });
	const { data } = await gh<GhPull[]>(tokenOf(account), `/repos/${fullName}/pulls?${q}`);
	const p = data[0];
	if (!p) return null;
	return { number: p.number, url: p.html_url, state: p.merged_at ? 'merged' : p.state === 'closed' ? 'closed' : p.draft ? 'draft' : 'open' };
}

// ── device flow ────────────────────────────────────────────────────────

type Pending = { deviceCode: string; interval: number; expiresAt: number };
const pending = new Map<string, Pending>();

const clientId = () => getSettings().githubClientId || config.githubClientId;

export const deviceFlowEnabled = () => !!clientId();

async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cc-modern' },
		body: new URLSearchParams(form),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new BadRequest(`GitHub: ${res.statusText}`);
	return (await res.json()) as T;
}

export async function startDeviceFlow() {
	if (!clientId()) throw new BadRequest('Add a GitHub OAuth app under Settings to sign in with GitHub, or add a personal access token.');
	const r = await postForm<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number; error_description?: string }>(
		'https://github.com/login/device/code',
		{ client_id: clientId()!, scope: 'repo read:org workflow' }
	);
	if (!r.device_code) throw new BadRequest(r.error_description ?? 'GitHub did not start the sign-in');
	const handle = randomToken(16);
	pending.set(handle, { deviceCode: r.device_code, interval: r.interval, expiresAt: Date.now() + r.expires_in * 1000 });
	return { handle, userCode: r.user_code, verificationUri: r.verification_uri, interval: r.interval, expiresIn: r.expires_in };
}

/** One poll: `pending` until the user approves, then the saved account. */
export async function pollDeviceFlow(handle: string): Promise<{ state: 'pending' | 'done' | 'expired' | 'denied'; account?: GithubAccount; interval?: number }> {
	const p = pending.get(handle);
	if (!p || Date.now() > p.expiresAt) {
		pending.delete(handle);
		return { state: 'expired' };
	}
	const r = await postForm<{ access_token?: string; error?: string; interval?: number }>('https://github.com/login/oauth/access_token', {
		client_id: clientId()!,
		device_code: p.deviceCode,
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
	});
	if (r.access_token) {
		pending.delete(handle);
		return { state: 'done', account: await addGithubToken(r.access_token, 'oauth') };
	}
	if (r.error === 'slow_down') p.interval = r.interval ?? p.interval + 5;
	if (r.error === 'authorization_pending' || r.error === 'slow_down') return { state: 'pending', interval: p.interval };
	pending.delete(handle);
	return { state: r.error === 'access_denied' ? 'denied' : 'expired' };
}
