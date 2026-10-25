/**
 * A small Docker Engine API client: JSON calls, multiplexed exec output, and hijacked
 * (raw TCP) exec streams for interactive terminals. Talks to a unix socket or tcp://host:port.
 */
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import type { Duplex } from 'node:stream';
import { config } from './config.ts';

export class DockerError extends Error {
	status: number;
	constructor(message: string, status = 0) {
		super(message);
		this.status = status;
	}
}

function target(): Pick<RequestOptions, 'socketPath' | 'host' | 'port'> {
	const h = config.dockerHost;
	if (h.startsWith('unix://')) return { socketPath: h.slice('unix://'.length) };
	const u = new URL(h.replace(/^tcp:\/\//, 'http://'));
	return { host: u.hostname, port: Number(u.port || 2375) };
}

type Query = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, query?: Query): string {
	if (!query) return path;
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, String(v));
	const s = qs.toString();
	return s ? `${path}?${s}` : path;
}

function friendly(err: NodeJS.ErrnoException): DockerError {
	if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
		return new DockerError(`Can't reach Docker at ${config.dockerHost}. Is the socket mounted?`);
	}
	if (err.code === 'EACCES') return new DockerError(`No permission to use the Docker socket at ${config.dockerHost}.`);
	return new DockerError(err.message);
}

/** Sends a request and resolves with the raw response (body unread). */
function send(method: string, path: string, opts: { query?: Query; body?: unknown; timeoutMs?: number } = {}): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const payload = opts.body === undefined ? undefined : Buffer.from(JSON.stringify(opts.body));
		const req = httpRequest(
			{
				...target(),
				method,
				path: withQuery(path, opts.query),
				headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}
			},
			resolve
		);
		req.on('error', (e) => reject(friendly(e)));
		if (opts.timeoutMs) req.setTimeout(opts.timeoutMs, () => req.destroy(new Error('Docker request timed out')));
		req.end(payload);
	});
}

async function readAll(res: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const c of res) chunks.push(c as Buffer);
	return Buffer.concat(chunks);
}

async function call<T>(method: string, path: string, opts: { query?: Query; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
	const res = await send(method, path, { timeoutMs: 30_000, ...opts });
	const raw = await readAll(res);
	const text = raw.toString('utf8');
	if ((res.statusCode ?? 500) >= 400) {
		let message = text;
		try {
			message = JSON.parse(text).message ?? text;
		} catch {}
		throw new DockerError(message.trim() || `Docker returned ${res.statusCode}`, res.statusCode);
	}
	if (!text) return undefined as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return text as T;
	}
}

// ── system ─────────────────────────────────────────────────────────────

export interface DockerVersion {
	Version: string;
	ApiVersion: string;
	Os: string;
	Arch: string;
}

export const version = () => call<DockerVersion>('GET', '/version', { timeoutMs: 5000 });

/** True when the daemon's API supports volume subpaths (Engine 26+, API 1.45). */
export function supportsSubpath(v: DockerVersion): boolean {
	const [maj, min] = v.ApiVersion.split('.').map(Number);
	return maj > 1 || (maj === 1 && min >= 45);
}

// ── containers ─────────────────────────────────────────────────────────

export interface ContainerSummary {
	Id: string;
	Names: string[];
	Image: string;
	/** Unix seconds. */
	Created: number;
	State: string;
	Status: string;
	Labels: Record<string, string>;
}

export interface ContainerInfo {
	Id: string;
	Name: string;
	State: { Status: string; Running: boolean; ExitCode: number; StartedAt: string; FinishedAt: string; Error: string };
	Config: { Image: string; Labels: Record<string, string> };
	Mounts: { Type: string; Name?: string; Source: string; Destination: string }[];
}

export function listContainers(labels: string[], all = true): Promise<ContainerSummary[]> {
	return call('GET', '/containers/json', { query: { all, filters: JSON.stringify({ label: labels }) } });
}

export async function inspectContainer(id: string): Promise<ContainerInfo | null> {
	try {
		return await call<ContainerInfo>('GET', `/containers/${encodeURIComponent(id)}/json`);
	} catch (err) {
		if (err instanceof DockerError && err.status === 404) return null;
		throw err;
	}
}

export async function createContainer(name: string, spec: Record<string, unknown>): Promise<string> {
	const r = await call<{ Id: string }>('POST', '/containers/create', { query: { name }, body: spec });
	return r.Id;
}

export const startContainer = (id: string) => call<void>('POST', `/containers/${encodeURIComponent(id)}/start`);

export async function stopContainer(id: string, seconds = 10) {
	try {
		await call<void>('POST', `/containers/${encodeURIComponent(id)}/stop`, { query: { t: seconds }, timeoutMs: (seconds + 15) * 1000 });
	} catch (err) {
		// 304: already stopped; 404: already gone.
		if (!(err instanceof DockerError && (err.status === 304 || err.status === 404))) throw err;
	}
}

export async function removeContainer(id: string) {
	try {
		await call<void>('DELETE', `/containers/${encodeURIComponent(id)}`, { query: { force: true } });
	} catch (err) {
		// 404: gone; 409: AutoRemove is already removing it.
		if (!(err instanceof DockerError && (err.status === 404 || err.status === 409))) throw err;
	}
}

/** Waits for a container to exit and returns its exit code. */
export async function waitContainer(id: string, timeoutMs = 60_000): Promise<number> {
	const r = await call<{ StatusCode: number }>('POST', `/containers/${encodeURIComponent(id)}/wait`, { timeoutMs });
	return r.StatusCode;
}

/** The last lines a container printed (stdout and stderr), for start-up errors. */
export async function containerLogs(id: string, tail = 50): Promise<string> {
	const res = await send('GET', `/containers/${encodeURIComponent(id)}/logs`, { query: { stdout: true, stderr: true, tail }, timeoutMs: 10_000 });
	const raw = await readAll(res);
	const { stdout, stderr } = demux(raw);
	return (stdout + stderr).trim();
}

// ── images ─────────────────────────────────────────────────────────────

export async function imageExists(ref: string): Promise<boolean> {
	try {
		await call('GET', `/images/${encodeURIComponent(ref)}/json`);
		return true;
	} catch (err) {
		if (err instanceof DockerError && err.status === 404) return false;
		throw err;
	}
}

export async function imageCreated(ref: string): Promise<string | null> {
	try {
		const r = await call<{ Created: string; Id: string }>('GET', `/images/${encodeURIComponent(ref)}/json`);
		return r.Created;
	} catch (err) {
		if (err instanceof DockerError && err.status === 404) return null;
		throw err;
	}
}

/** Splits `repo[:tag]` (a registry port is not a tag). */
export function parseImageRef(ref: string): { fromImage: string; tag: string } {
	const at = ref.indexOf('@');
	if (at !== -1) return { fromImage: ref.slice(0, at), tag: ref.slice(at + 1) };
	const slash = ref.lastIndexOf('/');
	const colon = ref.lastIndexOf(':');
	if (colon > slash) return { fromImage: ref.slice(0, colon), tag: ref.slice(colon + 1) };
	return { fromImage: ref, tag: 'latest' };
}

/** Pulls an image; resolves when done. Docker reports pull errors inside the progress stream. */
export async function pullImage(ref: string, onProgress?: (status: string) => void): Promise<void> {
	const res = await send('POST', '/images/create', { query: parseImageRef(ref), timeoutMs: 30 * 60_000 });
	if ((res.statusCode ?? 500) >= 400) {
		const text = (await readAll(res)).toString('utf8');
		let message = text;
		try {
			message = JSON.parse(text).message ?? text;
		} catch {}
		throw new DockerError(message.trim(), res.statusCode);
	}
	let buffered = '';
	let error: string | null = null;
	for await (const chunk of res) {
		buffered += chunk.toString('utf8');
		let nl: number;
		while ((nl = buffered.indexOf('\n')) !== -1) {
			const line = buffered.slice(0, nl).trim();
			buffered = buffered.slice(nl + 1);
			if (!line) continue;
			try {
				const ev = JSON.parse(line) as { status?: string; error?: string };
				if (ev.error) error = ev.error;
				else if (ev.status) onProgress?.(ev.status);
			} catch {}
		}
	}
	if (error) throw new DockerError(error);
}

// ── exec ───────────────────────────────────────────────────────────────

/** Splits Docker's multiplexed stdout/stderr stream (8-byte frame headers). */
export function demux(buf: Buffer): { stdout: string; stderr: string } {
	const out: Buffer[] = [];
	const err: Buffer[] = [];
	let i = 0;
	while (i + 8 <= buf.length) {
		const kind = buf[i];
		const size = buf.readUInt32BE(i + 4);
		const frame = buf.subarray(i + 8, i + 8 + size);
		(kind === 2 ? err : out).push(frame);
		i += 8 + size;
	}
	return { stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') };
}

export interface ExecOptions {
	user?: string;
	env?: string[];
	workdir?: string;
	timeoutMs?: number;
}

/** Runs a command in a running container and collects its output. */
export async function exec(container: string, cmd: string[], opts: ExecOptions = {}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const { Id } = await call<{ Id: string }>('POST', `/containers/${encodeURIComponent(container)}/exec`, {
		body: { Cmd: cmd, AttachStdout: true, AttachStderr: true, Tty: false, User: opts.user, Env: opts.env, WorkingDir: opts.workdir }
	});
	const res = await send('POST', `/exec/${Id}/start`, { body: { Detach: false, Tty: false }, timeoutMs: opts.timeoutMs ?? 30_000 });
	if ((res.statusCode ?? 500) >= 400) throw new DockerError((await readAll(res)).toString('utf8'), res.statusCode);
	const { stdout, stderr } = demux(await readAll(res));
	const info = await call<{ ExitCode: number | null }>('GET', `/exec/${Id}/json`);
	return { exitCode: info.ExitCode ?? -1, stdout, stderr };
}

/**
 * Starts an interactive exec with a TTY and returns the raw, bidirectional stream
 * (keystrokes in, terminal output out) plus a resize function.
 */
export async function execTty(
	container: string,
	cmd: string[],
	opts: ExecOptions & { cols?: number; rows?: number } = {}
): Promise<{ stream: Duplex; resize: (cols: number, rows: number) => Promise<void> }> {
	const { Id } = await call<{ Id: string }>('POST', `/containers/${encodeURIComponent(container)}/exec`, {
		body: {
			Cmd: cmd,
			AttachStdin: true,
			AttachStdout: true,
			AttachStderr: true,
			Tty: true,
			User: opts.user,
			Env: opts.env,
			WorkingDir: opts.workdir,
			ConsoleSize: opts.rows && opts.cols ? [opts.rows, opts.cols] : undefined
		}
	});
	const stream = await new Promise<Duplex>((resolve, reject) => {
		const payload = Buffer.from(JSON.stringify({ Detach: false, Tty: true }));
		const req = httpRequest({
			...target(),
			method: 'POST',
			path: `/exec/${Id}/start`,
			headers: { 'content-type': 'application/json', 'content-length': payload.length, connection: 'Upgrade', upgrade: 'tcp' }
		});
		req.on('upgrade', (_res, socket, head) => {
			if (head.length) socket.unshift(head);
			resolve(socket);
		});
		req.on('response', async (res) => reject(new DockerError((await readAll(res)).toString('utf8') || 'Exec did not upgrade', res.statusCode)));
		req.on('error', (e) => reject(friendly(e)));
		req.end(payload);
	});
	const resize = async (cols: number, rows: number) => {
		await call<void>('POST', `/exec/${Id}/resize`, { query: { h: rows, w: cols } }).catch(() => {});
	};
	return { stream, resize };
}
