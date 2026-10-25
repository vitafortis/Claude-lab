/**
 * Terminal WebSockets. Each browser tab gets its own `docker exec` with a TTY: `tmux attach`
 * for the Claude pane (so Claude keeps running when the tab closes, and several tabs can
 * watch one session) or a plain login shell.
 *
 *   /ws/sessions/<id>/terminal?mode=claude|shell&cols=&rows=
 *   /ws/accounts/<id>/login?cols=&rows=
 *
 * Protocol: the server sends terminal output as binary frames. The browser sends JSON text
 * frames: {"t":"i","d":"…"} for input and {"t":"r","c":cols,"r":rows} to resize.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { authenticateToken, sessionTokenFromHeader } from '../auth.ts';
import { execTty } from '../docker.ts';
import { loginContainer } from '../accounts.ts';
import { runningContainer, workdir } from '../sessions/runtime.ts';

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

const ENV = ['TERM=xterm-256color', 'COLORTERM=truecolor', 'LANG=C.UTF-8'];

function reject(socket: Duplex, status: number, message: string) {
	socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`);
}

/** Same check as hooks.server.ts: the page that opens the socket must be ours. */
function sameOrigin(req: IncomingMessage): boolean {
	const origin = req.headers.origin;
	if (!origin) return true;
	let host = '';
	try {
		host = new URL(origin).host;
	} catch {}
	const allowed = [req.headers.host, req.headers['x-forwarded-host']].flat().filter(Boolean);
	return allowed.includes(host);
}

const clamp = (v: string | null, lo: number, hi: number, d: number) => {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

type Target = { container: string; cmd: string[]; workdir?: string };

async function resolveTarget(path: string, params: URLSearchParams): Promise<Target> {
	let m = /^\/ws\/sessions\/([0-9a-f-]{36})\/terminal$/.exec(path);
	if (m) {
		const { session, container } = await runningContainer(m[1]);
		const shell = params.get('mode') === 'shell';
		return { container, workdir: workdir(session), cmd: shell ? ['bash', '-l'] : ['tmux', 'attach-session', '-t', 'main'] };
	}
	m = /^\/ws\/accounts\/([0-9a-f-]{36})\/login$/.exec(path);
	if (m) {
		const container = await loginContainer(m[1]);
		if (!container) throw new Error('The sign-in container is not running');
		return { container, cmd: ['tmux', 'attach-session', '-t', 'main'] };
	}
	throw new Error('Not found');
}

export async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
	const url = new URL(req.url ?? '/', 'http://localhost');
	if (!sameOrigin(req)) return reject(socket, 403, 'Cross-origin request blocked');
	const { state } = authenticateToken(sessionTokenFromHeader(req.headers.cookie));
	if (state !== 'authenticated' && state !== 'disabled') return reject(socket, 401, 'Not signed in');

	let target: Target;
	try {
		target = await resolveTarget(url.pathname, url.searchParams);
	} catch (err) {
		return reject(socket, 409, err instanceof Error ? err.message : 'Unavailable');
	}

	const cols = clamp(url.searchParams.get('cols'), 20, 500, 120);
	const rows = clamp(url.searchParams.get('rows'), 5, 200, 32);

	wss.handleUpgrade(req, socket, head, (ws) => void bridge(ws, target, cols, rows));
}

async function bridge(ws: WebSocket, target: Target, cols: number, rows: number) {
	let tty: Awaited<ReturnType<typeof execTty>>;
	try {
		tty = await execTty(target.container, target.cmd, { user: 'node', env: ENV, workdir: target.workdir, cols, rows });
	} catch (err) {
		ws.close(1011, (err instanceof Error ? err.message : 'exec failed').slice(0, 120));
		return;
	}
	const { stream, resize } = tty;
	void resize(cols, rows);

	stream.on('data', (chunk: Buffer) => {
		if (ws.readyState !== ws.OPEN) return;
		ws.send(chunk, { binary: true });
		// A slow browser shouldn't make us buffer a whole build log in memory.
		if (ws.bufferedAmount > 4 * 1024 * 1024) {
			stream.pause();
			const resume = setInterval(() => {
				if (ws.readyState !== ws.OPEN || ws.bufferedAmount < 512 * 1024) {
					clearInterval(resume);
					stream.resume();
				}
			}, 50);
		}
	});
	const end = () => {
		if (ws.readyState === ws.OPEN) ws.close(1000, 'ended');
	};
	stream.on('end', end);
	stream.on('close', end);
	stream.on('error', end);

	ws.on('message', (data, isBinary) => {
		if (isBinary) {
			stream.write(data as Buffer);
			return;
		}
		let msg: { t?: string; d?: unknown; c?: unknown; r?: unknown };
		try {
			msg = JSON.parse(data.toString());
		} catch {
			return;
		}
		if (msg.t === 'i' && typeof msg.d === 'string') stream.write(msg.d);
		else if (msg.t === 'r') void resize(clamp(String(msg.c), 20, 500, cols), clamp(String(msg.r), 5, 200, rows));
		// The browser's heartbeat: an empty frame back tells it the line is still up.
		else if (msg.t === 'p') ws.send(Buffer.alloc(0), { binary: true });
	});
	// Closing the exec detaches this tmux client; Claude keeps running.
	ws.on('close', () => stream.destroy());
	ws.on('error', () => stream.destroy());
}
