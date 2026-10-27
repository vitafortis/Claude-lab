#!/usr/bin/env node
// Smoke test against a running Orbital: sign in, start a session on a public repo,
// check the clone and the terminal, stop, start again (continuing the conversation), delete.
// It needs no real Claude credentials: Claude starts and reports that it isn't signed in.
//
//   ORB_URL=http://homelab:3050 ORB_EMAIL=you@example.com ORB_PASSWORD=… pnpm e2e
//
// Optional: ORB_E2E_REPO (default octocat/Hello-World).
import WebSocket from 'ws';

const BASE = (process.env.ORB_URL ?? 'http://localhost:3050').replace(/\/$/, '');
const REPO = process.env.ORB_E2E_REPO ?? 'octocat/Hello-World';
let cookie = '';

async function call(method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: { cookie, origin: BASE, ...(method === 'GET' ? {} : { 'content-type': 'application/json' }) },
		body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body)
	});
	const set = res.headers.get('set-cookie');
	if (set) cookie = set.split(';')[0];
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.message ?? ''}`);
	return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, timeoutMs = 120_000) {
	const end = Date.now() + timeoutMs;
	for (;;) {
		const v = await fn();
		if (v) return v;
		if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
		await sleep(1500);
	}
}

/** Opens a terminal socket, optionally types, and returns what the screen showed. */
function terminal(path, input) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}${path}`, { headers: { cookie, origin: BASE } });
		let out = '';
		ws.on('message', (d) => (out += d.toString()));
		ws.on('unexpected-response', (_q, res) => reject(new Error(`terminal: HTTP ${res.statusCode}`)));
		ws.on('error', reject);
		ws.on('open', () => {
			if (input) setTimeout(() => ws.send(JSON.stringify({ t: 'i', d: input })), 500);
			setTimeout(() => {
				ws.close();
				resolve(out.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Z0-9]|\x1b[=>78]/g, ''));
			}, 2500);
		});
	});
}

function step(name) {
	process.stdout.write(`• ${name}… `);
	return (detail = 'ok') => console.log(detail);
}

let done = step('sign in');
await call('POST', '/api/auth/login', { email: process.env.ORB_EMAIL, password: process.env.ORB_PASSWORD });
done();

done = step('check Docker and storage');
const status = await call('GET', '/api/status');
if (!status.docker.ok) throw new Error(status.docker.error);
if (!status.storage.ok) throw new Error(status.storage.error);
done(`Docker ${status.docker.version}, ${status.storage.kind === 'volume' ? `volume ${status.storage.name}` : status.storage.hostPath}`);

done = step('create a throwaway Claude account');
const account = await call('POST', '/api/model-accounts', { kind: 'subscription', name: 'e2e (no login)' });
done();

let session;
try {
	done = step(`start a session on ${REPO}`);
	session = await call('POST', '/api/sessions', { repo: REPO, accountId: account.id, name: 'orbital e2e', newBranch: 'e2e/smoke', prompt: 'hello' });
	await waitFor('the container', async () => (await call('GET', `/api/sessions/${session.id}`)).status === 'running');
	done();

	done = step('clone and branch (shell terminal)');
	const shell = await waitFor('the clone', async () => {
		const out = await terminal(`/ws/sessions/${session.id}/terminal?mode=shell`, 'git branch --show-current\r');
		return out.includes('e2e/smoke') ? out : null;
	});
	done(shell.includes('e2e/smoke') ? 'on e2e/smoke' : shell);

	done = step('Claude in the tmux pane');
	const pane = await waitFor('Claude Code', async () => {
		const out = await terminal(`/ws/sessions/${session.id}/terminal`);
		// tmux moves the cursor instead of printing spaces, so words can run together.
		return /Claude\s*Code/.test(out) ? out : null;
	});
	const version = /Claude\s*Code\s*v([\d.]+)/.exec(pane)?.[1];
	done(version ? `Claude Code ${version}` : 'ok');

	done = step('stop, then start and continue');
	await call('POST', `/api/sessions/${session.id}/stop`);
	await call('POST', `/api/sessions/${session.id}/start`);
	await waitFor('the restart', async () => (await call('GET', `/api/sessions/${session.id}`)).status === 'running');
	const conversations = await call('GET', `/api/sessions/${session.id}/conversations`);
	done(`${conversations.length} conversation(s) kept`);
} finally {
	if (session) {
		done = step('delete the session');
		await call('DELETE', `/api/sessions/${session.id}`);
		done();
	}
	await call('DELETE', `/api/model-accounts/${account.id}`).catch(() => {});
}
console.log('All good.');
