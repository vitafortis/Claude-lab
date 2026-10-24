<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		ChevronDown,
		CircleAlert,
		Copy,
		CornerDownLeft,
		ExternalLink,
		FilePlus2,
		GitBranch,
		History,
		Keyboard,
		ListTodo,
		LoaderCircle,
		MoreHorizontal,
		PanelRightClose,
		PanelRightOpen,
		Play,
		RotateCcw,
		Send,
		Sparkles,
		Square,
		SquareTerminal,
		TerminalSquare,
		Trash2
	} from '@lucide/svelte';
	import Conversations from '#lib/components/Conversations.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import StateBadge from '#lib/components/StateBadge.svelte';
	import StateDot from '#lib/components/StateDot.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import Terminal from '#lib/components/Terminal.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { copyText } from '#lib/client/clipboard.ts';
	import { ago } from '#lib/client/format.ts';
	import { deleteSession, relaunchClaude, startSession, stopSession, type Launch } from '#lib/client/sessions.ts';
	import { sessions, toast, upsertSession } from '#lib/client/state.svelte.ts';
	import { displayState } from '#lib/session-state.ts';
	import { CLAUDE_AUTH_LABEL, PERMISSION_MODES, type Conversation, type Session } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const s = $derived(sessions.list.find((x) => x.id === data.session.id) ?? data.session);
	const live = $derived(sessions.live[s.id]);
	const view = $derived(displayState(s, live));
	const running = $derived(s.status === 'running');
	const sum = $derived(live?.summary ?? null);
	const git = $derived(live?.git ?? null);
	const account = $derived(data.claudeAccounts.find((a) => a.id === s.claudeAccountId));
	const rcAvailable = $derived(account?.kind === 'subscription');

	let mode = $state<'claude' | 'shell'>('claude');
	let panel = $state(true);
	let term = $state<Terminal>();
	let compose = $state('');
	let showKeys = $state(false);
	let busy = $state(false);
	let summarizing = $state(false);

	$effect(() => {
		// Narrow screens start with the panel closed and the key bar open.
		if (matchMedia('(max-width: 1023px)').matches) panel = false;
		if (matchMedia('(pointer: coarse)').matches) showKeys = true;
	});

	async function act(fn: () => Promise<unknown>) {
		busy = true;
		try {
			await fn();
		} finally {
			busy = false;
		}
	}

	function launch(l: Launch) {
		return act(() => (running ? relaunchClaude(s, l) : startSession(s, l)));
	}

	function resume(c: Conversation) {
		void launch({ mode: 'resume', conversationId: c.id });
	}

	async function summarize() {
		summarizing = true;
		try {
			const r = await api.post<{ text: string; at: string }>(`/api/sessions/${s.id}/summary`);
			if (sessions.live[s.id]) sessions.live[s.id].aiSummary = r;
		} catch (err) {
			toast('error', 'No summary', errorMessage(err));
		}
		summarizing = false;
	}

	async function patch(body: Partial<Session>) {
		try {
			upsertSession(await api.patch<Session>(`/api/sessions/${s.id}`, body));
			toast('success', 'Saved', running ? 'Applies when Claude restarts.' : undefined);
		} catch (err) {
			toast('error', "Couldn't save", errorMessage(err));
		}
	}

	// Keys for touch screens, as terminal input sequences.
	const KEYS: { label: string; seq: string; title: string }[] = [
		{ label: 'Esc', seq: '\x1b', title: 'Escape: interrupt Claude or close a menu' },
		{ label: 'Tab', seq: '\t', title: 'Tab' },
		{ label: '⇧Tab', seq: '\x1b[Z', title: 'Shift+Tab: cycle permission modes' },
		{ label: '↑', seq: '\x1b[A', title: 'Up' },
		{ label: '↓', seq: '\x1b[B', title: 'Down' },
		{ label: '^C', seq: '\x03', title: 'Ctrl+C' },
		{ label: '⏎', seq: '\r', title: 'Enter' }
	];

	function sendCompose(e: SubmitEvent) {
		e.preventDefault();
		if (!compose) {
			term?.input('\r');
			return;
		}
		// Bracketed paste keeps multi-line messages together; Enter then submits.
		term?.input(`\x1b[200~${compose}\x1b[201~`);
		setTimeout(() => term?.input('\r'), 50);
		compose = '';
	}

	const restartItems = $derived([
		{ label: 'Continue newest conversation', hint: 'Restart Claude and pick up where it left off', icon: RotateCcw, onclick: () => launch({ mode: 'continue' }) },
		{ label: 'New conversation', hint: 'Fresh context, same repo and branch', icon: FilePlus2, onclick: () => launch({ mode: 'new' }) },
		'separator' as const,
		{ label: running ? 'Stop session' : 'Start session', hint: running ? 'Keeps the repo and conversations' : 'Continue the newest conversation', icon: running ? Square : Play, onclick: () => act(() => (running ? stopSession(s) : startSession(s))) },
		{ label: 'Delete session', icon: Trash2, danger: true, onclick: () => deleteSession(s) }
	]);
</script>

<svelte:head><title>{s.name} · cc·modern</title></svelte:head>

<div class="flex h-full min-h-0 flex-col">
	<!-- Header -->
	<header class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
		<StateDot state={view} />
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-[0.9375rem] leading-tight font-semibold tracking-tight">{s.name}</h1>
			<p class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
				<span class="truncate">{s.repoFullName ?? s.repoUrl}</span>
				{#if git?.branch ?? s.newBranch ?? s.baseBranch}
					<GitBranch class="size-3 shrink-0" /><span class="truncate font-mono text-[0.6875rem]">{git?.branch ?? s.newBranch ?? s.baseBranch}</span>
				{/if}
			</p>
		</div>
		<span class="max-sm:hidden"><StateBadge state={view} /></span>

		{#if running}
			<div class="flex rounded-lg border border-border bg-background p-0.5 text-xs">
				<button class="flex items-center gap-1.5 rounded-md px-2.5 py-1 {mode === 'claude' ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'}" onclick={() => (mode = 'claude')}><TerminalSquare class="size-3.5" /><span class="max-sm:hidden">Claude</span></button>
				<button class="flex items-center gap-1.5 rounded-md px-2.5 py-1 {mode === 'shell' ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'}" onclick={() => (mode = 'shell')}><SquareTerminal class="size-3.5" /><span class="max-sm:hidden">Shell</span></button>
			</div>
		{/if}
		{#if s.rcUrl && running}
			<a class="btn btn-secondary btn-sm" href={s.rcUrl} target="_blank" rel="noopener" title="Open this session in claude.ai (Remote Control)"><ExternalLink />Remote</a>
		{/if}
		<Menu items={restartItems}>
			{#snippet trigger({ toggle })}
				<button class="btn btn-secondary btn-sm" onclick={toggle} disabled={busy}>
					{#if busy}<LoaderCircle class="animate-spin" />{:else}<MoreHorizontal />{/if}<span class="max-sm:hidden">Session</span><ChevronDown />
				</button>
			{/snippet}
		</Menu>
		<button class="btn btn-ghost btn-icon btn-sm" title={panel ? 'Hide details' : 'Show details'} onclick={() => (panel = !panel)}>
			{#if panel}<PanelRightClose />{:else}<PanelRightOpen />{/if}
		</button>
	</header>

	<div class="relative flex min-h-0 flex-1">
		<!-- Terminal, or what to do when there isn't one -->
		<div class="flex min-w-0 flex-1 flex-col">
			{#if running && s.containerId}
				<div class="min-h-0 flex-1">
					{#key `${s.containerId}:${mode}`}
						<Terminal bind:this={term} path="/ws/sessions/{s.id}/terminal?mode={mode}" />
					{/key}
				</div>
				<form class="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-term-edge px-2 py-1.5" style="background: var(--term-chrome)" onsubmit={sendCompose}>
					<button type="button" class="btn btn-ghost btn-icon btn-sm text-[#aab2c0] hover:bg-white/5 hover:text-white" title="Show keys" onclick={() => (showKeys = !showKeys)}><Keyboard /></button>
					{#if showKeys}
						{#each KEYS as k (k.label)}
							<button type="button" class="h-7 min-w-8 rounded-md border border-term-edge px-2 font-mono text-xs text-[#d5d9e2] hover:bg-white/5" title={k.title} onclick={() => term?.input(k.seq)}>
								{#if k.label === '↑'}<ArrowUp class="mx-auto size-3.5" />{:else if k.label === '↓'}<ArrowDown class="mx-auto size-3.5" />{:else if k.label === '⏎'}<CornerDownLeft class="mx-auto size-3.5" />{:else}{k.label}{/if}
							</button>
						{/each}
					{/if}
					<input
						class="h-7 min-w-40 flex-1 rounded-md border border-term-edge bg-black/20 px-2.5 text-[0.8125rem] text-[#e6e8ee] outline-none placeholder:text-[#7d8594] focus:border-primary/60"
						placeholder={mode === 'claude' ? 'Message Claude… (or type in the terminal)' : 'Run a command…'}
						bind:value={compose}
					/>
					<button class="btn btn-sm h-7 border border-term-edge text-[#d5d9e2] hover:bg-white/5" title="Send"><Send /></button>
				</form>
			{:else}
				<div class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6" style="background: var(--term-bg)">
					{#if live?.tail?.length}
						<pre class="pointer-events-none absolute inset-x-0 top-0 max-h-full overflow-hidden px-4 py-3 font-mono text-[0.6875rem] leading-[1.15rem] text-[#c9cfda] opacity-25 select-none">{live.tail.join('\n')}</pre>
					{/if}
					<div class="relative w-full max-w-md rounded-2xl border border-term-edge p-6 text-[#e6e8ee] shadow-surface-lg" style="background: var(--term-chrome)">
						{#if s.status === 'starting'}
							<p class="flex items-center gap-2.5 font-medium"><LoaderCircle class="size-4 animate-spin text-primary" />Starting…</p>
							<p class="mt-1.5 text-[0.8125rem] text-[#9aa3b2]">Creating the container. The first start also pulls the session image, which can take a minute.</p>
						{:else}
							{#if s.status === 'error'}
								<p class="flex items-center gap-2 font-medium text-danger"><CircleAlert class="size-4" />The session failed to start</p>
								{#if s.error}<pre class="mt-2 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-[0.6875rem] whitespace-pre-wrap text-[#f2b8ba]">{s.error}</pre>{/if}
							{:else}
								<p class="font-medium">Session stopped</p>
								<p class="mt-1 text-[0.8125rem] text-[#9aa3b2]">The repo, its changes and every conversation are kept. Start it to get the terminal back.</p>
							{/if}
							<div class="mt-4 flex flex-wrap gap-2">
								<button class="btn btn-primary" disabled={busy} onclick={() => launch({ mode: 'continue' })}>
									{#if busy}<LoaderCircle class="animate-spin" />{:else}<Play />{/if}{sum ? 'Resume newest conversation' : 'Start'}
								</button>
								{#if sum}<button class="btn btn-secondary" disabled={busy} onclick={() => launch({ mode: 'new' })}><FilePlus2 />New conversation</button>{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Details -->
		{#if panel}
			<aside class="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:shadow-surface-lg">
				<section class="space-y-2 border-b border-border p-4">
					<div class="flex items-center justify-between">
						<h2 class="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">Summary</h2>
						<button class="btn btn-ghost btn-sm -mr-2" disabled={!running || summarizing || !sum} title="Ask a small model for a summary (uses the session's Claude account)" onclick={summarize}>
							{#if summarizing}<LoaderCircle class="animate-spin" />{:else}<Sparkles />{/if}Summarize
						</button>
					</div>
					{#if live?.aiSummary}
						<p class="text-[0.8125rem] leading-relaxed">{live.aiSummary.text}</p>
						<p class="text-[0.6875rem] text-muted-foreground">{ago(live.aiSummary.at)}</p>
					{/if}
					{#if sum}
						{#if sum.title && sum.title !== s.name}<p class="text-[0.8125rem] font-medium">{sum.title}</p>{/if}
						{#if sum.lastPrompt}<p class="line-clamp-4 text-xs text-muted-foreground"><span class="font-medium text-foreground/80">You:</span> {sum.lastPrompt}</p>{/if}
						{#if sum.lastReply}<p class="line-clamp-6 text-xs text-muted-foreground"><span class="font-medium text-primary">Claude:</span> {sum.lastReply}</p>{/if}
						{#if sum.lastTool}<p class="truncate font-mono text-[0.6875rem] text-muted-foreground" title={sum.lastTool}>{sum.lastTool}</p>{/if}
						<p class="text-[0.6875rem] text-muted-foreground">{sum.messages} messages · {ago(sum.updatedAt)}</p>
					{:else}
						<p class="text-xs text-muted-foreground">Nothing yet. Once you talk to Claude, the latest exchange shows here.</p>
					{/if}
				</section>

				{#if sum?.todos.length}
					<section class="border-b border-border p-4">
						<h2 class="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase"><ListTodo class="size-3.5" />Tasks</h2>
						<ul class="space-y-1.5">
							{#each sum.todos as t, i (i)}
								<li class="flex items-start gap-2 text-xs">
									<span class="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border {t.status === 'completed' ? 'border-success bg-success/20' : t.status === 'in_progress' ? 'border-primary' : 'border-border'}">
										{#if t.status === 'in_progress'}<span class="size-1.5 animate-pulse rounded-full bg-primary"></span>{/if}
									</span>
									<span class={t.status === 'completed' ? 'text-muted-foreground line-through' : t.status === 'in_progress' ? 'font-medium' : ''}>{t.content}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if git}
					<section class="border-b border-border p-4 text-xs">
						<h2 class="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase"><GitBranch class="size-3.5" />Git</h2>
						<p class="font-mono">{git.branch ?? 'detached HEAD'}</p>
						<p class="mt-1 text-muted-foreground">
							{git.changed} changed file{git.changed === 1 ? '' : 's'} ·
							<span class="text-success">+{git.insertions}</span> <span class="text-danger">−{git.deletions}</span>
							{#if git.ahead} · {git.ahead} unpushed{/if}{#if git.behind} · {git.behind} behind{/if}
						</p>
					</section>
				{/if}

				<section class="border-b border-border p-4">
					<h2 class="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase"><History class="size-3.5" />Conversations</h2>
					<Conversations sessionId={s.id} sessionName={s.name} current={sum?.conversationId} onresume={resume} />
				</section>

				<section class="space-y-3 p-4 text-[0.8125rem]">
					<h2 class="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">Session</h2>
					<div>
						<label class="label" for="acct">Claude account</label>
						<select id="acct" class="input h-8 text-xs" value={s.claudeAccountId} onchange={(e) => patch({ claudeAccountId: e.currentTarget.value })}>
							{#each data.claudeAccounts as a (a.id)}<option value={a.id}>{a.name} · {CLAUDE_AUTH_LABEL[a.kind]}</option>{/each}
						</select>
					</div>
					<div>
						<label class="label" for="gh">GitHub account</label>
						<select id="gh" class="input h-8 text-xs" value={s.githubAccountId ?? ''} onchange={(e) => patch({ githubAccountId: e.currentTarget.value || null })}>
							{#each data.githubAccounts as a (a.id)}<option value={a.id}>{a.login}</option>{/each}
							<option value="">None</option>
						</select>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class="label" for="model">Model</label>
							<input id="model" class="input h-8 text-xs" placeholder="Default" value={s.model ?? ''} onchange={(e) => patch({ model: e.currentTarget.value || null })} />
						</div>
						<div>
							<label class="label" for="perm">Permissions</label>
							<select id="perm" class="input h-8 text-xs" value={s.permissionMode} onchange={(e) => patch({ permissionMode: e.currentTarget.value as Session['permissionMode'] })}>
								{#each PERMISSION_MODES as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
							</select>
						</div>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span>
							<span class="block font-medium">Remote Control</span>
							<span class="block text-xs text-muted-foreground">{rcAvailable ? 'claude.ai/code and the Claude app' : 'Needs a subscription login'}</span>
						</span>
						<Switch checked={rcAvailable && s.remoteControl} disabled={!rcAvailable} label="Remote Control" onchange={(v) => patch({ remoteControl: v })} />
					</div>
					<p class="text-xs text-muted-foreground">Changes apply the next time Claude starts (Session → Continue newest conversation).</p>
					<button class="flex items-center gap-1.5 font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground" title="Copy the container's working directory" onclick={() => copyText(`/workspace/${s.repoDir}`)}>
						<Copy class="size-3" />/workspace/{s.repoDir}
					</button>
				</section>
			</aside>
		{/if}
	</div>
</div>
