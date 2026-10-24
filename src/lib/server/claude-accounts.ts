/**
 * Claude accounts. A subscription account signs in once with `claude auth login`, run in a
 * short-lived container whose terminal opens in the browser; the credentials land in the
 * account's config folder, which every session of that account mounts. Token and API key
 * accounts pass their secret as an environment variable instead.
 */
import { rmSync } from 'node:fs';
import { config } from './config.ts';
import { containerLogs, createContainer, exec, inspectContainer, listContainers, removeContainer, startContainer, waitContainer } from './docker.ts';
import { getClaudeAccount, getSettings, setClaudeAuthStatus } from './store.ts';
import { claudeEnv, ensureImage, LABELS, parseEnvLines } from './sessions/runtime.ts';
import { abs, accountRel, backing, ensureDirs, mountSpec } from './sessions/storage.ts';
import type { ClaudeAccount } from '#lib/types.ts';

const loginName = (accountId: string) => `ccm-login-${accountId.slice(0, 8)}`;

async function baseSpec(accountId: string, extra: { env?: string[]; cmd?: string[]; kind: string }) {
	const settings = getSettings();
	const b = await backing();
	ensureDirs(accountRel(accountId));
	await ensureImage(settings.sessionImage);
	return {
		Image: settings.sessionImage,
		Cmd: extra.cmd,
		Env: ['HOME=/home/node', 'CLAUDE_CONFIG_DIR=/claude', 'CCM_REPO_DIR=/workspace', ...parseEnvLines(settings.extraEnv), ...claudeEnv(accountId), ...(extra.env ?? [])],
		Labels: { [LABELS.instance]: config.instance, [LABELS.kind]: extra.kind, [LABELS.account]: accountId },
		HostConfig: {
			Mounts: [mountSpec(b, accountRel(accountId), '/claude')],
			NetworkMode: settings.network || undefined,
			RestartPolicy: { Name: 'no' }
		}
	};
}

/** Starts (or restarts) the sign-in container; its terminal is at /ws/accounts/<id>/login. */
export async function startLogin(accountId: string): Promise<string> {
	const name = loginName(accountId);
	await removeContainer(name);
	const id = await createContainer(name, await baseSpec(accountId, { kind: 'login', env: ['CCM_PANE_CMD=ccm-login'] }));
	await startContainer(id);
	return id;
}

export async function loginContainer(accountId: string): Promise<string | null> {
	const info = await inspectContainer(loginName(accountId));
	return info?.State.Running ? info.Id : null;
}

export async function stopLogin(accountId: string) {
	await removeContainer(loginName(accountId));
}

/** Reads `claude auth status` JSON: {loggedIn, authMethod, email?, subscriptionType?, …}. */
export function parseAuthStatus(output: string, exitCode: number): { status: ClaudeAccount['status']; email: string | null; plan: string | null } {
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
		plan: find(data, ['subscriptionType', 'plan']) ?? find(data, ['authMethod'])
	};
}

/** The sign-in link `claude auth login` printed (read joined, since it wraps in the terminal). */
export async function loginUrl(accountId: string): Promise<string | null> {
	const container = await loginContainer(accountId);
	if (!container) return null;
	const r = await exec(container, ['tmux', 'capture-pane', '-p', '-J', '-t', 'main', '-S', '-200'], { user: 'node' });
	const urls = r.stdout.match(/https:\/\/\S*oauth\/authorize\S+/g);
	return urls ? urls[urls.length - 1] : null;
}

/** Runs `claude auth status` for an account in a throwaway container and saves the result. */
export async function checkAccount(accountId: string): Promise<ClaudeAccount> {
	if (!getClaudeAccount(accountId)) throw new Error('Account not found');
	const id = await createContainer(`ccm-check-${accountId.slice(0, 8)}-${Date.now().toString(36)}`, await baseSpec(accountId, { kind: 'check', cmd: ['claude', 'auth', 'status'] }));
	try {
		await startContainer(id);
		const code = await waitContainer(id, 60_000);
		const out = await containerLogs(id, 200);
		setClaudeAuthStatus(accountId, parseAuthStatus(out, code));
	} finally {
		await removeContainer(id);
	}
	return getClaudeAccount(accountId)!;
}

/** Removes an account's containers and its config folder (login, settings, transcripts). */
export async function purgeAccount(accountId: string) {
	await stopLogin(accountId);
	for (const c of await listContainers([`${LABELS.instance}=${config.instance}`, `${LABELS.account}=${accountId}`])) await removeContainer(c.Id);
	rmSync(abs(accountRel(accountId)), { recursive: true, force: true });
}
