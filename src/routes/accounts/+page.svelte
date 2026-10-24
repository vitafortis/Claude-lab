<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import {
		Building2,
		CircleCheck,
		CircleHelp,
		CircleX,
		ExternalLink,
		KeyRound,
		LoaderCircle,
		LogIn,
		Plus,
		RefreshCw,
		ShieldCheck,
		Trash2
	} from '@lucide/svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Terminal from '#lib/components/Terminal.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { copyText } from '#lib/client/clipboard.ts';
	import { ago } from '#lib/client/format.ts';
	import { confirmAction, toast } from '#lib/client/state.svelte.ts';
	import { CLAUDE_AUTH_LABEL, type ClaudeAccount, type ClaudeAuthKind, type GithubAccount } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const welcome = $derived(page.url.searchParams.has('welcome'));

	// ── Claude ──────────────────────────────────────────────────────────

	const KINDS: { value: ClaudeAuthKind; title: string; body: string }[] = [
		{ value: 'subscription', title: 'Claude subscription', body: 'Sign in with your Pro or Max plan in a terminal here. Supports Remote Control.' },
		{ value: 'token', title: 'Long-lived token', body: 'Paste the token from `claude setup-token`. Inference only: no Remote Control.' },
		{ value: 'api_key', title: 'API key', body: 'Anthropic Console key, billed per use. No Remote Control.' }
	];

	let adding = $state(false);
	let kind = $state<ClaudeAuthKind>('subscription');
	let name = $state('');
	let secret = $state('');
	let saving = $state(false);
	let formError = $state('');

	let login = $state<ClaudeAccount | null>(null);
	let loginReady = $state(false);
	let loginLink = $state<string | null>(null);
	let finishing = $state(false);
	let checking = $state<string | null>(null);

	function openAdd() {
		kind = 'subscription';
		name = data.claudeAccounts.length ? '' : 'Personal';
		secret = '';
		formError = '';
		adding = true;
	}

	async function addClaude(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		formError = '';
		try {
			const a = await api.post<ClaudeAccount>('/api/claude-accounts', { kind, name: name || CLAUDE_AUTH_LABEL[kind], secret: secret || null });
			adding = false;
			await invalidateAll();
			if (a.kind === 'subscription') void startLogin(a);
			else void check(a);
		} catch (err) {
			formError = errorMessage(err);
		}
		saving = false;
	}

	async function startLogin(a: ClaudeAccount) {
		login = a;
		loginReady = false;
		loginLink = null;
		try {
			await api.post(`/api/claude-accounts/${a.id}/login`);
			loginReady = true;
		} catch (err) {
			login = null;
			toast('error', "Couldn't start the sign-in", errorMessage(err));
		}
	}

	async function finishLogin() {
		const a = login;
		if (!a) return;
		finishing = true;
		try {
			const r = await api.del<ClaudeAccount>(`/api/claude-accounts/${a.id}/login`);
			if (r.status === 'signed_in') toast('success', `Signed in${r.email ? ` as ${r.email}` : ''}`);
			else toast('info', 'Not signed in yet', 'Run the sign-in again whenever you like.');
		} catch (err) {
			toast('error', "Couldn't check the sign-in", errorMessage(err));
		}
		finishing = false;
		login = null;
		await invalidateAll();
	}

	// The link wraps in the terminal; offer it as a button once Claude has printed it.
	$effect(() => {
		if (!login || !loginReady || loginLink) return;
		const id = login.id;
		const t = setInterval(async () => {
			const r = await api.get<{ url: string | null }>(`/api/claude-accounts/${id}/login`).catch(() => null);
			if (r?.url) loginLink = r.url;
		}, 1500);
		return () => clearInterval(t);
	});

	// Closing the page mid-sign-in still cleans up the container.
	onDestroy(() => {
		if (login) void api.del(`/api/claude-accounts/${login.id}/login`).catch(() => {});
	});

	async function check(a: ClaudeAccount) {
		checking = a.id;
		try {
			const r = await api.post<ClaudeAccount>(`/api/claude-accounts/${a.id}/check`);
			toast(r.status === 'signed_in' ? 'success' : 'error', r.status === 'signed_in' ? `${a.name} works` : `${a.name} isn't signed in`, r.email ?? undefined);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't check the account", errorMessage(err));
		}
		checking = null;
	}

	async function removeClaude(a: ClaudeAccount) {
		const ok = await confirmAction({
			title: `Remove ${a.name}?`,
			body: 'This deletes its sign-in, settings and stored conversations from this server. Your Claude account itself is not affected.',
			confirmLabel: 'Remove',
			danger: true
		});
		if (!ok) return;
		try {
			await api.del(`/api/claude-accounts/${a.id}`);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't remove it", errorMessage(err));
		}
	}

	// ── GitHub ──────────────────────────────────────────────────────────

	let addingToken = $state(false);
	let token = $state('');
	let tokenError = $state('');
	let device = $state<{ handle: string; userCode: string; verificationUri: string; interval: number } | null>(null);
	let deviceTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => clearTimeout(deviceTimer));

	async function addToken(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		tokenError = '';
		try {
			const a = await api.post<GithubAccount>('/api/github-accounts', { token });
			addingToken = false;
			token = '';
			toast('success', `Connected ${a.login}`, a.orgs.length ? `Organizations: ${a.orgs.join(', ')}` : undefined);
			await invalidateAll();
		} catch (err) {
			tokenError = errorMessage(err);
		}
		saving = false;
	}

	async function startDevice() {
		try {
			device = await api.post('/api/github/device');
			poll();
		} catch (err) {
			toast('error', "Couldn't start GitHub sign-in", errorMessage(err));
		}
	}

	function poll() {
		if (!device) return;
		deviceTimer = setTimeout(async () => {
			if (!device) return;
			try {
				const r = await api.post<{ state: string; account?: GithubAccount; interval?: number }>('/api/github/device/poll', { handle: device.handle });
				if (r.state === 'pending') {
					device.interval = r.interval ?? device.interval;
					poll();
					return;
				}
				if (r.state === 'done' && r.account) {
					toast('success', `Connected ${r.account.login}`);
					await invalidateAll();
				} else toast('error', r.state === 'denied' ? 'GitHub sign-in was declined' : 'The code expired. Try again.');
			} catch (err) {
				toast('error', 'GitHub sign-in failed', errorMessage(err));
			}
			device = null;
		}, device.interval * 1000);
	}

	async function refreshGithub(a: GithubAccount) {
		try {
			await api.post(`/api/github-accounts/${a.id}`);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't refresh", errorMessage(err));
		}
	}

	async function removeGithub(a: GithubAccount) {
		const ok = await confirmAction({
			title: `Disconnect ${a.login}?`,
			body: 'cc·modern forgets the token. Running sessions keep working until they restart. Revoke the token on GitHub too if you no longer need it.',
			confirmLabel: 'Disconnect',
			danger: true
		});
		if (!ok) return;
		await api.del(`/api/github-accounts/${a.id}`);
		await invalidateAll();
	}
</script>

<svelte:head><title>Accounts · cc·modern</title></svelte:head>

{#snippet statusBadge(a: ClaudeAccount)}
	{#if a.status === 'signed_in'}
		<span class="badge badge-success"><CircleCheck />{a.kind === 'subscription' ? 'Signed in' : 'Ready'}</span>
	{:else if a.status === 'signed_out'}
		<span class="badge badge-warning"><CircleX />Not signed in</span>
	{:else}
		<span class="badge"><CircleHelp />Not checked</span>
	{/if}
{/snippet}

<div class="h-full overflow-y-auto">
	<PageHeader title="Accounts" description="Who sessions run as on Claude, and how they reach GitHub." />

	<div class="max-w-4xl space-y-8 px-4 pb-12 sm:px-8">
		{#if welcome}
			<div class="card flex items-start gap-3 border-primary/30 p-4 text-[0.8125rem]">
				<ShieldCheck class="mt-0.5 size-4 shrink-0 text-primary" />
				<p>You're set up. Connect a Claude account below (and GitHub for private repos), then <a class="text-primary hover:underline" href="/new">start a session</a>.</p>
			</div>
		{/if}

		<section>
			<div class="mb-3 flex items-end justify-between gap-3">
				<div>
					<h2 class="text-[0.9375rem] font-semibold tracking-tight">Claude</h2>
					<p class="text-xs text-muted-foreground">Sessions of one account share its login, settings and memory, like terminals on one machine.</p>
				</div>
				<button class="btn btn-secondary btn-sm" onclick={openAdd}><Plus />Add account</button>
			</div>
			<div class="card divide-y divide-border">
				{#each data.claudeAccounts as a (a.id)}
					<div class="flex flex-wrap items-center gap-3 px-4 py-3">
						<span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><KeyRound class="size-4" /></span>
						<div class="min-w-0 flex-1">
							<p class="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">{a.name} {@render statusBadge(a)}</p>
							<p class="truncate text-xs text-muted-foreground">
								{CLAUDE_AUTH_LABEL[a.kind]}{#if a.email} · {a.email}{/if}{#if a.plan} · {a.plan}{/if}{#if a.checkedAt} · checked {ago(a.checkedAt)}{/if}
							</p>
						</div>
						<div class="flex items-center gap-1.5">
							{#if a.kind === 'subscription'}
								<button class="btn btn-sm {a.status === 'signed_in' ? 'btn-ghost' : 'btn-primary'}" onclick={() => startLogin(a)}><LogIn />{a.status === 'signed_in' ? 'Sign in again' : 'Sign in'}</button>
							{/if}
							<button class="btn btn-ghost btn-sm" disabled={checking === a.id} onclick={() => check(a)}>
								{#if checking === a.id}<LoaderCircle class="animate-spin" />{:else}<RefreshCw />{/if}Check
							</button>
							<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Remove" onclick={() => removeClaude(a)}><Trash2 /></button>
						</div>
					</div>
				{:else}
					<button class="w-full px-4 py-8 text-center text-[0.8125rem] text-muted-foreground hover:text-foreground" onclick={openAdd}>
						No Claude accounts yet. <span class="text-primary">Add one →</span>
					</button>
				{/each}
			</div>
		</section>

		<section id="github">
			<div class="mb-3 flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="text-[0.9375rem] font-semibold tracking-tight">GitHub</h2>
					<p class="text-xs text-muted-foreground">For listing and cloning private repos, pushing branches and opening pull requests with <code class="font-mono">gh</code>.</p>
				</div>
				<div class="flex gap-2">
					{#if data.deviceFlow}<button class="btn btn-primary btn-sm" onclick={startDevice}><LogIn />Sign in with GitHub</button>{/if}
					<button class="btn btn-secondary btn-sm" onclick={() => ((addingToken = true), (tokenError = ''))}><Plus />Add a token</button>
				</div>
			</div>
			<div class="card divide-y divide-border">
				{#each data.githubAccounts as a (a.id)}
					<div class="flex flex-wrap items-center gap-3 px-4 py-3">
						{#if a.avatarUrl}<img src={a.avatarUrl} alt="" class="size-9 shrink-0 rounded-full border border-border" />{/if}
						<div class="min-w-0 flex-1">
							<p class="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">
								{a.login}{#if a.name}<span class="font-normal text-muted-foreground">{a.name}</span>{/if}
								<span class="badge">{a.kind === 'oauth' ? 'Signed in' : 'Token'}</span>
							</p>
							<p class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
								{#each a.orgs as o (o)}<span class="badge"><Building2 />{o}</span>{:else}<span>No organizations visible</span>{/each}
								{#if a.scopes}<span class="font-mono text-[0.6875rem]">· {a.scopes}</span>{/if}
							</p>
						</div>
						<button class="btn btn-ghost btn-icon btn-sm" title="Refresh organizations" onclick={() => refreshGithub(a)}><RefreshCw /></button>
						<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Disconnect" onclick={() => removeGithub(a)}><Trash2 /></button>
					</div>
				{:else}
					<p class="px-4 py-8 text-center text-[0.8125rem] text-muted-foreground">No GitHub accounts. Public repos still work without one.</p>
				{/each}
			</div>
		</section>
	</div>
</div>

<Dialog bind:open={adding} title="Add a Claude account" width="max-w-xl">
	<form id="add-claude" class="space-y-4" onsubmit={addClaude}>
		<div class="grid gap-2">
			{#each KINDS as k (k.value)}
				<label class="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors {kind === k.value ? 'border-primary/60 bg-primary-soft' : 'border-border hover:bg-accent/40'}">
					<input type="radio" name="kind" value={k.value} bind:group={kind} class="mt-1 accent-[var(--primary)]" />
					<span>
						<span class="block text-[0.8125rem] font-medium">{k.title}</span>
						<span class="block text-xs text-muted-foreground">{k.body}</span>
					</span>
				</label>
			{/each}
		</div>
		<div>
			<label class="label" for="cname">Name</label>
			<input id="cname" class="input" placeholder="Personal, Work…" bind:value={name} />
		</div>
		{#if kind !== 'subscription'}
			<div>
				<label class="label" for="secret">{kind === 'token' ? 'Token' : 'API key'}</label>
				<input id="secret" class="input font-mono text-xs" type="password" autocomplete="off" placeholder={kind === 'token' ? 'sk-ant-oat01-…' : 'sk-ant-api03-…'} bind:value={secret} required />
				<p class="mt-1.5 text-xs text-muted-foreground">
					{#if kind === 'token'}Run <code class="font-mono">claude setup-token</code> on any machine signed in to your plan. Stored encrypted.{:else}Create one at console.anthropic.com. Stored encrypted.{/if}
				</p>
			</div>
		{/if}
		{#if formError}<p class="text-xs text-danger">{formError}</p>{/if}
	</form>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (adding = false)}>Cancel</button>
		<button class="btn btn-primary" form="add-claude" disabled={saving}>
			{#if saving}<LoaderCircle class="animate-spin" />{/if}{kind === 'subscription' ? 'Add and sign in' : 'Add account'}
		</button>
	{/snippet}
</Dialog>

<Dialog
	bind:open={() => !!login, (v) => !v && !finishing && finishLogin()}
	title="Sign in to Claude{login ? ` · ${login.name}` : ''}"
	description="Open the link Claude prints, approve, then paste the code back into the terminal."
	width="max-w-4xl"
>
	<div class="h-[26rem] overflow-hidden rounded-xl border border-term-edge">
		{#if login && loginReady}
			<Terminal path="/ws/accounts/{login.id}/login" />
		{:else}
			<div class="grid h-full place-items-center text-xs text-[#9aa3b2]" style="background: var(--term-bg)">
				<span class="flex items-center gap-2"><LoaderCircle class="size-4 animate-spin" />Starting the sign-in container…</span>
			</div>
		{/if}
	</div>
	<div class="mt-3 flex flex-wrap items-center gap-3">
		{#if loginLink}
			<a class="btn btn-secondary btn-sm" href={loginLink} target="_blank" rel="noopener"><ExternalLink />Open the sign-in page</a>
		{/if}
		<p class="min-w-0 flex-1 text-xs text-muted-foreground">After approving, copy the code and paste it into the terminal. The login is saved in this account's folder on the server and shared by its sessions.</p>
	</div>
	{#snippet footer()}
		<button class="btn btn-primary" disabled={finishing} onclick={finishLogin}>
			{#if finishing}<LoaderCircle class="animate-spin" />{/if}Done
		</button>
	{/snippet}
</Dialog>

<Dialog bind:open={addingToken} title="Add a GitHub token" width="max-w-xl">
	<form id="add-token" class="space-y-3" onsubmit={addToken}>
		<p class="text-[0.8125rem] text-muted-foreground">
			A <b class="font-medium text-foreground">fine-grained token</b> with access to the repos you want (Contents and Pull requests: read and write) or a
			<b class="font-medium text-foreground">classic token</b> with <code class="font-mono text-xs">repo</code>, <code class="font-mono text-xs">read:org</code> and
			<code class="font-mono text-xs">workflow</code>.
		</p>
		<a class="btn btn-secondary btn-sm" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener"><ExternalLink />Create a token on GitHub</a>
		<div>
			<label class="label" for="tok">Token</label>
			<input id="tok" class="input font-mono text-xs" type="password" autocomplete="off" placeholder="github_pat_… or ghp_…" bind:value={token} required />
		</div>
		{#if tokenError}<p class="text-xs text-danger">{tokenError}</p>{/if}
	</form>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (addingToken = false)}>Cancel</button>
		<button class="btn btn-primary" form="add-token" disabled={saving}>{#if saving}<LoaderCircle class="animate-spin" />{/if}Connect</button>
	{/snippet}
</Dialog>

<Dialog bind:open={() => !!device, (v) => !v && ((device = null), clearTimeout(deviceTimer))} title="Sign in with GitHub" width="max-w-md">
	{#if device}
		<div class="space-y-4 text-center">
			<p class="text-[0.8125rem] text-muted-foreground">Enter this code at GitHub, then come back here.</p>
			<button class="mx-auto block rounded-xl border border-border bg-surface px-5 py-3 font-mono text-2xl font-semibold tracking-[0.2em]" title="Copy" onclick={() => copyText(device!.userCode)}>{device.userCode}</button>
			<a class="btn btn-primary" href={device.verificationUri} target="_blank" rel="noopener"><ExternalLink />Open github.com/login/device</a>
			<p class="flex items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle class="size-3.5 animate-spin" />Waiting for approval…</p>
		</div>
	{/if}
</Dialog>
