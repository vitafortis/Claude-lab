<script lang="ts">
	import { onMount } from 'svelte';
	import '@xterm/xterm/css/xterm.css';
	import { LoaderCircle, Unplug } from '@lucide/svelte';
	import { copyText } from '#lib/client/clipboard.ts';

	let {
		path,
		onstate
	}: {
		/** The WebSocket path, e.g. /ws/sessions/<id>/terminal?mode=claude. */
		path: string;
		onstate?: (state: 'connecting' | 'open' | 'closed') => void;
	} = $props();

	let host: HTMLDivElement;
	let conn = $state<'connecting' | 'open' | 'closed'>('connecting');
	let reason = $state('');

	// The terminal stays dark in both themes; colours tuned for Claude Code's dark theme.
	const PALETTE = {
		foreground: '#e6e8ee',
		cursor: '#9ec1ff',
		cursorAccent: '#0d1117',
		selectionBackground: '#3b5b9a80',
		black: '#1b1f27',
		red: '#f2777a',
		green: '#8fd18b',
		yellow: '#f2c46d',
		blue: '#7aa8ff',
		magenta: '#c49cf2',
		cyan: '#6fd3e0',
		white: '#d5d9e2',
		brightBlack: '#5c6370',
		brightRed: '#ff9396',
		brightGreen: '#a8e6a3',
		brightYellow: '#ffd88a',
		brightBlue: '#9ec1ff',
		brightMagenta: '#d9b8ff',
		brightCyan: '#8de6f0',
		brightWhite: '#ffffff'
	};

	let ws: WebSocket | null = null;
	let send: (data: string) => void = () => {};
	let focusTerm: () => void = () => {};

	/** Types into the terminal as if from the keyboard. */
	export function input(data: string) {
		send(data);
	}

	export function focus() {
		focusTerm();
	}

	function setConn(s: typeof conn) {
		conn = s;
		onstate?.(s);
	}

	onMount(() => {
		let disposed = false;
		let retry = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let cleanup = () => {};

		void (async () => {
			const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { Unicode11Addon }] = await Promise.all([
				import('@xterm/xterm'),
				import('@xterm/addon-fit'),
				import('@xterm/addon-web-links'),
				import('@xterm/addon-unicode11')
			]);
			if (disposed) return;
			const bg = getComputedStyle(host).getPropertyValue('--term-bg').trim() || '#0d1117';
			const term = new Terminal({
				fontFamily: "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: matchMedia('(pointer: coarse)').matches ? 12 : 13,
				lineHeight: 1,
				cursorBlink: true,
				allowProposedApi: true,
				macOptionIsMeta: true,
				scrollback: 2000,
				theme: { ...PALETTE, background: bg }
			});
			const fit = new FitAddon();
			term.loadAddon(fit);
			term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, '_blank', 'noopener')));
			term.loadAddon(new Unicode11Addon());
			term.unicode.activeVersion = '11';
			term.open(host);
			// Fonts load after first paint; measure cells only once they're in.
			await document.fonts?.ready;
			fit.fit();
			focusTerm = () => term.focus();

			// Copy from tmux / Claude Code arrives as OSC 52.
			term.parser.registerOscHandler(52, (data) => {
				const b64 = data.split(';').pop() ?? '';
				try {
					const text = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
					if (text) void copyText(text, 'Copied from the terminal');
				} catch {}
				return true;
			});

			send = (data: string) => {
				if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d: data }));
			};
			term.onData((d) => send(d));
			term.onBinary((d) => send(d));

			const sendSize = () => {
				if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'r', c: term.cols, r: term.rows }));
			};
			const ro = new ResizeObserver(() => {
				if (!host.offsetWidth || !host.offsetHeight) return;
				fit.fit();
				sendSize();
			});
			ro.observe(host);

			const connect = () => {
				if (disposed) return;
				setConn('connecting');
				const proto = location.protocol === 'https:' ? 'wss' : 'ws';
				const sep = path.includes('?') ? '&' : '?';
				const sock = new WebSocket(`${proto}://${location.host}${path}${sep}cols=${term.cols}&rows=${term.rows}`);
				sock.binaryType = 'arraybuffer';
				ws = sock;
				sock.onopen = () => {
					retry = 0;
					reason = '';
					setConn('open');
					sendSize();
				};
				sock.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer));
				sock.onclose = (e) => {
					if (ws !== sock) return;
					ws = null;
					reason = e.reason && e.reason !== 'ended' ? e.reason : '';
					setConn('closed');
					if (disposed) return;
					// Back off up to 10 s; the session may be restarting.
					timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++));
				};
			};
			connect();

			cleanup = () => {
				ro.disconnect();
				ws?.close();
				term.dispose();
			};
		})();

		return () => {
			disposed = true;
			clearTimeout(timer);
			cleanup();
		};
	});
</script>

<div class="relative h-full min-h-0 w-full overflow-hidden bg-term" style="background: var(--term-bg)">
	<!-- Padding sits outside the host: the fit addon sizes rows from the host's own box. -->
	<div class="absolute inset-0 py-1.5 pl-2">
		<div bind:this={host} class="h-full w-full"></div>
	</div>
	{#if conn !== 'open'}
		<div class="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
			<span class="flex items-center gap-2 rounded-full border border-term-edge bg-term-chrome/90 px-3 py-1 text-xs text-[#c9cfda] shadow-surface-lg backdrop-blur">
				{#if conn === 'connecting'}
					<LoaderCircle class="size-3.5 animate-spin" />Connecting…
				{:else}
					<Unplug class="size-3.5" />{reason || 'Disconnected'} · retrying
				{/if}
			</span>
		</div>
	{/if}
</div>

<style>
	div :global(.xterm) {
		height: 100%;
	}
	div :global(.xterm-viewport) {
		scrollbar-width: thin;
		scrollbar-color: #3a4150 transparent;
	}
</style>
