/**
 * Model accounts. Sign-in kinds (Claude subscription, ChatGPT, Google) sign in once from a
 * short-lived container whose terminal opens in the browser; the credentials land in the
 * account's config folder, which every session of that account mounts. The other kinds
 * pass their secrets as environment variables instead (see providers.ts).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';
import { containerLogs, createContainer, exec, inspectContainer, listContainers, removeContainer, startContainer, waitContainer } from './docker.ts';
import { BadRequest } from './http.ts';
import { agentSetup } from './providers.ts';
import { getAccount, getAccountSecrets, getSettings, setAccountStatus } from './store.ts';
import { ensureImage, LABELS, parseEnvLines, removeOwned } from './sessions/runtime.ts';
import { abs, accountRel, backing, ensureDirs, mountSpec } from './sessions/storage.ts';
import { extractLinks, findDeviceCode } from '#lib/pane.ts';
import { ACCOUNT_KINDS } from '#lib/providers.ts';
import type { ModelAccount } from '#lib/types.ts';

const loginName = (accountId: string) => `claude-login-${accountId.slice(0, 8)}`;

async function baseSpec(accountId: string, extra: { env?: string[]; cmd?: string[]; kind: string }) {
	const settings = getSettings();
	const b = await backing();
	ensureDirs(accountRel(accountId));
	const agent = agentSetup(accountId);
	await ensureImage(agent.image);
	return {
		Image: agent.image,
		Cmd: extra.cmd,
		Env: ['HOME=/home/node', 'CCM_REPO_DIR=/workspace', ...parseEnvLines(settings.extraEnv), ...agent.env, ...(extra.env ?? [])],
		Labels: { [LABELS.instance]: config.instance, [LABELS.kind]: extra.kind, [LABELS.account]: accountId },
		HostConfig: {
			Mounts: [mountSpec(b, accountRel(accountId), agent.mount)],
			NetworkMode: settings.network || undefined,
			RestartPolicy: { Name: 'no' }
		}
	};
}

/** Starts (or restarts) the sign-in container; its terminal is at /ws/accounts/<id>/login. */
export async function startLogin(accountId: string): Promise<string> {
	const name = loginName(accountId);
	await removeOwned(name);
	const id = await createContainer(name, await baseSpec(accountId, { kind: 'login', env: ['CCM_PANE_CMD=ccm-login'] }));
	await startContainer(id);
	return id;
}

export async function loginContainer(accountId: string): Promise<string | null> {
	const info = await inspectContainer(loginName(accountId));
	return info?.State.Running && info.Config.Labels?.[LABELS.instance] === config.instance ? info.Id : null;
}

export async function stopLogin(accountId: string) {
	await removeOwned(loginName(accountId));
}

/** Reads `claude auth status` JSON: {loggedIn, authMethod, email?, subscriptionType?, …}. */
export function parseAuthStatus(output: string, exitCode: number): { status: ModelAccount['status']; email: string | null; plan: string | null } {
	let data: Record<string, unknown> = {};
	const start = output.indexOf('{');
	if (start !== -1) {
		try {
			data = JSON.parse(output.slice(start, output.lastIndexOf('}') + 1));
		} catch {}
	}
	const find = (obj: unknown, keys: string[]): string | null => {
		if (!obj || typeof obj !== 'object') return null;
		for (const [k, v] of Object.entries(obj)) {
			if (keys.includes(k) && typeof v === 'string' && v) return v;
		}
		for (const v of Object.values(obj)) {
			const hit = find(v, keys);
			if (hit) return hit;
		}
		return null;
	};
	const loggedIn = typeof data.loggedIn === 'boolean' ? data.loggedIn : exitCode === 0;
	if (!loggedIn) return { status: 'signed_out', email: null, plan: null };
	return {
		status: 'signed_in',
		email: find(data, ['email', 'emailAddress']),
		// The plan name only; the kind of account already says how it signs in.
		plan: find(data, ['subscriptionType', 'plan'])
	};
}

// The sign-in links each agent prints: Claude's authorize URL, Codex's device page, Google's.
const LOGIN_URL = /^https:\/\/(?:\S*oauth\/authorize|auth\.openai\.com\/|accounts\.google\.com\/o\/oauth2)/;

/**
 * What the sign-in terminal shows that's hard to copy on a phone: the sign-in link (wrapped
 * lines joined), any other links, and a one-time code to type at the provider.
 */
export async function loginScreen(accountId: string): Promise<{ url: string | null; links: string[]; code: string | null }> {
	const container = await loginContainer(accountId);
	if (!container) return { url: null, links: [], code: null };
	const r = await exec(container, ['tmux', 'capture-pane', '-p', '-J', '-t', 'main', '-S', '-200'], { user: 'node' });
	const lines = r.stdout.split('\n');
	const links = extractLinks(lines);
	return { url: links.findLast((l) => LOGIN_URL.test(l)) ?? null, links, code: findDeviceCode(lines) };
}

/** Runs a command with the account's credentials in a throwaway container. */
async function runChecked(accountId: string, cmd: string[], timeoutMs = 60_000): Promise<{ code: number; out: string }> {
	const id = await createContainer(`claude-check-${accountId.slice(0, 8)}-${Date.now().toString(36)}`, await baseSpec(accountId, { kind: 'check', cmd }));
	try {
		await startContainer(id);
		const code = await waitContainer(id, timeoutMs);
		return { code, out: await containerLogs(id, 200) };
	} finally {
		await removeContainer(id);
	}
}

type Status = { status: ModelAccount['status']; email: string | null; plan: string | null; error?: string };

/** Lists models with the key: proves it works without spending anything. */
async function checkKey(url: string, headers: Record<string, string>, label: string): Promise<Status> {
	let res: Response;
	try {
		res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
	} catch (err) {
		return { status: 'unknown', email: null, plan: null, error: `Couldn't reach ${label}: ${err instanceof Error ? err.message : err}` };
	}
	if (res.ok) return { status: 'signed_in', email: null, plan: 'API key' };
	if (res.status === 401 || res.status === 403 || res.status === 400) return { status: 'signed_out', email: null, plan: null, error: `${label} rejected the key (HTTP ${res.status})` };
	return { status: 'unknown', email: null, plan: null, error: `${label} answered HTTP ${res.status}` };
}

/** Gemini CLI keeps its Google sign-in in the account folder (GEMINI_CLI_HOME/.gemini). */
function googleStatus(accountId: string): Status {
	const dir = join(abs(accountRel(accountId)), '.gemini');
	if (!existsSync(join(dir, 'oauth_creds.json'))) return { status: 'signed_out', email: null, plan: null };
	let email: string | null = null;
	try {
		email = JSON.parse(readFileSync(join(dir, 'google_accounts.json'), 'utf8')).active ?? null;
	} catch {}
	return { status: 'signed_in', email, plan: 'Google account' };
}

async function accountStatus(a: ModelAccount): Promise<Status> {
	const secrets = getAccountSecrets(a.id);
	switch (a.kind) {
		case 'subscription':
		case 'token':
		case 'api_key': {
			const r = await runChecked(a.id, ['claude', 'auth', 'status']);
			return parseAuthStatus(r.out, r.code);
		}
		case 'bedrock':
		case 'vertex':
		case 'foundry':
		case 'gateway': {
			// Claude Code takes these credentials on trust until a request: send a tiny one.
			const r = await runChecked(a.id, ['claude', '-p', '--model', 'haiku', '--max-turns', '1', '--no-session-persistence', 'Reply with OK.'], 120_000);
			if (r.code === 0) return { status: 'signed_in', email: null, plan: ACCOUNT_KINDS[a.kind].label };
			const why = r.out.trim().split('\n').slice(-3).join(' ').slice(0, 400);
			return { status: 'signed_out', email: null, plan: null, error: why || `Claude Code exited with status ${r.code}` };
		}
		case 'chatgpt': {
			const r = await runChecked(a.id, ['codex', 'login', 'status']);
			const plan = /Logged in using ([^\n]+)/i.exec(r.out)?.[1]?.trim() ?? 'ChatGPT';
			return r.code === 0 && !/not logged in/i.test(r.out) ? { status: 'signed_in', email: null, plan } : { status: 'signed_out', email: null, plan: null };
		}
		case 'openai_api_key':
			return checkKey('https://api.openai.com/v1/models', { authorization: `Bearer ${secrets.apiKey ?? ''}` }, 'OpenAI');
		case 'google':
			return googleStatus(a.id);
		case 'gemini_api_key':
			return checkKey('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': secrets.apiKey ?? '' }, 'Google AI Studio');
	}
}

/**
 * Checks that the account works and saves the result. With `strict`, a failure the person
 * should hear about (a rejected key, a provider error) is thrown after saving.
 */
export async function checkAccount(accountId: string, strict = false): Promise<ModelAccount> {
	const a = getAccount(accountId);
	if (!a) throw new Error('Account not found');
	const { error, ...status } = await accountStatus(a);
	setAccountStatus(accountId, status);
	if (strict && error) throw new BadRequest(error);
	return getAccount(accountId)!;
}

/** Removes an account's containers and its config folder (login, settings, transcripts). */
export async function purgeAccount(accountId: string) {
	await stopLogin(accountId);
	for (const c of await listContainers([`${LABELS.instance}=${config.instance}`, `${LABELS.account}=${accountId}`])) await removeContainer(c.Id);
	rmSync(abs(accountRel(accountId)), { recursive: true, force: true });
}
