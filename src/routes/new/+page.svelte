<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { CircleAlert, GitBranch, KeyRound, LoaderCircle, Radio, Rocket } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import RepoPicker from '#lib/components/RepoPicker.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { upsertSession } from '#lib/client/state.svelte.ts';
	import { parseRepo, slugify } from '#lib/launch.ts';
	import { CLAUDE_AUTH_LABEL, PERMISSION_MODES, type GithubRepo, type PermissionMode, type Session } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const MODELS = [
		{ value: '', label: 'Default' },
		{ value: 'opus', label: 'Opus' },
		{ value: 'sonnet', label: 'Sonnet' },
		{ value: 'haiku', label: 'Haiku' },
		{ value: 'fable', label: 'Fable' }
	];

	// Form fields start from the loaded values (preferring a signed-in account) and are edited locally.
	const initial = untrack(() => ({
		claude: (data.claudeAccounts.find((a) => a.status === 'signed_in') ?? data.claudeAccounts[0])?.id ?? '',
		github: data.githubAccounts[0]?.id ?? '',
		settings: data.settings
	}));
	let claudeAccountId = $state(initial.claude);
	let githubAccountId = $state(initial.github);
	let repo = $state('');
	let picked = $state<GithubRepo | null>(null);
	let branches = $state<string[]>([]);
	let baseBranch = $state('');
	let newBranch = $state('');
	let name = $state('');
	let nameTouched = $state(false);
	let prompt = $state('');
	let model = $state(initial.settings.defaultModel);
	let permissionMode = $state<PermissionMode>(initial.settings.defaultPermissionMode);
	let remoteControl = $state(initial.settings.defaultRemoteControl);
	let busy = $state(false);
	let error = $state('');

	const claude = $derived(data.claudeAccounts.find((a) => a.id === claudeAccountId));
	const github = $derived(data.githubAccounts.find((a) => a.id === githubAccountId) ?? null);
	const parsed = $derived(parseRepo(repo));
	const rcAvailable = $derived(claude?.kind === 'subscription');

	// Name follows the repo (and new branch) until edited by hand.
	$effect(() => {
		if (nameTouched) return;
		name = parsed ? (newBranch ? `${parsed.dir} · ${newBranch}` : parsed.dir) : '';
	});

	$effect(() => {
		const full = parsed?.fullName;
		branches = [];
		if (!full) return;
		baseBranch = picked?.fullName === full ? picked.defaultBranch : '';
		const ctrl = new AbortController();
		const q = new URLSearchParams({ repo: full, ...(github ? { account: github.id } : {}) });
		api.get<string[]>(`/api/github/branches?${q}`, ctrl.signal).then(
			(b) => (branches = b),
			() => {}
		);
		return () => ctrl.abort();
	});

	function suggestBranch() {
		newBranch = `claude/${slugify(prompt.split('\n')[0] || name || 'work', 32)}`;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			const s = await api.post<Session>('/api/sessions', {
				name: name || parsed?.dir,
				repo,
				claudeAccountId,
				githubAccountId: githubAccountId || null,
				baseBranch: baseBranch || null,
				newBranch: newBranch || null,
				prompt: prompt || null,
				model: model || null,
				permissionMode,
				remoteControl: rcAvailable && remoteControl
			});
			upsertSession(s);
			goto(`/s/${s.id}`);
		} catch (err) {
			error = errorMessage(err);
			busy = false;
		}
	}
</script>

<svelte:head><title>New session · cc·modern</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="New session" description="Clone a repo into its own container and start Claude Code there." />

	<form class="max-w-3xl space-y-5 px-4 pb-12 sm:px-8" onsubmit={submit}>
		{#if !data.claudeAccounts.length}
			<div class="card flex items-start gap-3 border-warning/40 p-4">
				<KeyRound class="mt-0.5 size-4 shrink-0 text-warning" />
				<div class="text-[0.8125rem]">
					<p class="font-medium">Connect a Claude account first</p>
					<p class="mt-0.5 text-muted-foreground">Sessions run as one of your Claude accounts: a Pro/Max login, a long-lived token, or an API key.</p>
					<a href="/accounts" class="btn btn-secondary btn-sm mt-3">Go to Accounts</a>
				</div>
			</div>
		{/if}

		<section class="card space-y-4 p-5">
			<h2 class="text-[0.9375rem] font-semibold tracking-tight">Repository</h2>
			<div class="grid gap-4 sm:grid-cols-[14rem_1fr]">
				<div>
					<label class="label" for="gh">GitHub account</label>
					<select id="gh" class="input" bind:value={githubAccountId}>
						{#each data.githubAccounts as a (a.id)}<option value={a.id}>{a.login}</option>{/each}
						<option value="">None (public repo)</option>
					</select>
					{#if !data.githubAccounts.length}<a href="/accounts#github" class="mt-1.5 block text-xs text-primary">Connect GitHub →</a>{/if}
				</div>
				<div>
					<span class="label">Repository</span>
					<RepoPicker account={github} bind:value={repo} onpick={(r) => (picked = r)} />
					{#if repo && !parsed}<p class="mt-1.5 text-xs text-danger">Enter owner/name, or an https git URL.</p>{/if}
				</div>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="base">Start from branch</label>
					{#if branches.length}
						<select id="base" class="input font-mono text-[0.8125rem]" bind:value={baseBranch}>
							<option value="">Default branch</option>
							{#each branches as b (b)}<option value={b}>{b}</option>{/each}
						</select>
					{:else}
						<input id="base" class="input font-mono text-[0.8125rem]" placeholder="Default branch" bind:value={baseBranch} />
					{/if}
				</div>
				<div>
					<label class="label flex items-center justify-between" for="nb">
						<span>New branch <span class="font-normal text-muted-foreground/70">(optional)</span></span>
						<button type="button" class="text-primary hover:underline" onclick={suggestBranch}>Suggest</button>
					</label>
					<div class="relative">
						<GitBranch class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
						<input id="nb" class="input pl-9 font-mono text-[0.8125rem]" placeholder="claude/fix-login" bind:value={newBranch} />
					</div>
				</div>
			</div>
		</section>

		<section class="card space-y-4 p-5">
			<h2 class="text-[0.9375rem] font-semibold tracking-tight">Session</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="name">Name</label>
					<input id="name" class="input" placeholder="Named after the repo" bind:value={name} oninput={() => (nameTouched = true)} />
				</div>
				<div>
					<label class="label" for="acct">Claude account</label>
					<select id="acct" class="input" bind:value={claudeAccountId} required>
						{#each data.claudeAccounts as a (a.id)}
							<option value={a.id}>{a.name} · {CLAUDE_AUTH_LABEL[a.kind]}{a.status === 'signed_out' ? ' (not signed in)' : ''}</option>
						{/each}
					</select>
					{#if claude?.kind === 'subscription' && claude.status === 'signed_out'}
						<p class="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
							<CircleAlert class="mt-px size-3.5 shrink-0" /><span>Not signed in yet. <a class="underline" href="/accounts">Sign in</a>, or run <code class="font-mono">/login</code> in the session's terminal.</span>
						</p>
					{/if}
				</div>
			</div>
			<div>
				<label class="label" for="prompt">First message <span class="font-normal text-muted-foreground/70">(optional)</span></label>
				<textarea id="prompt" class="input h-auto min-h-24 py-2 leading-relaxed" rows="4" placeholder="What should Claude work on? Leave empty to start at the prompt." bind:value={prompt}></textarea>
			</div>
			<div class="grid gap-4 sm:grid-cols-[12rem_1fr]">
				<div>
					<label class="label" for="model">Model</label>
					<select id="model" class="input" bind:value={model}>
						{#each MODELS as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
						{#if model && !MODELS.some((m) => m.value === model)}<option value={model}>{model}</option>{/if}
					</select>
				</div>
				<div>
					<span class="label">Permissions</span>
					<div class="flex flex-wrap gap-1.5">
						{#each PERMISSION_MODES as m (m.value)}
							<button
								type="button"
								class="btn btn-sm {permissionMode === m.value ? 'btn-primary' : 'btn-secondary'}"
								title={m.hint}
								onclick={() => (permissionMode = m.value)}>{m.label}</button
							>
						{/each}
					</div>
					<p class="mt-1.5 text-xs text-muted-foreground">{PERMISSION_MODES.find((m) => m.value === permissionMode)?.hint}</p>
				</div>
			</div>
			<div class="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
				<Radio class="mt-0.5 size-4 shrink-0 text-primary" />
				<div class="min-w-0 flex-1 text-[0.8125rem]">
					<p class="font-medium">Remote Control</p>
					<p class="text-xs text-muted-foreground">
						{#if rcAvailable}
							Also continue this session from claude.ai/code and the Claude app, under the session's name.
						{:else}
							Needs a Claude subscription login. Tokens and API keys can't use Remote Control.
						{/if}
					</p>
				</div>
				<Switch checked={rcAvailable && remoteControl} disabled={!rcAvailable} label="Remote Control" onchange={(v) => (remoteControl = v)} />
			</div>
		</section>

		{#if error}<p class="rounded-lg bg-danger/10 px-3 py-2 text-[0.8125rem] text-danger">{error}</p>{/if}
		<div class="flex items-center justify-end gap-2">
			<a href="/" class="btn btn-ghost">Cancel</a>
			<button class="btn btn-primary" disabled={busy || !parsed || !claudeAccountId}>
				{#if busy}<LoaderCircle class="animate-spin" />{:else}<Rocket />{/if}Start session
			</button>
		</div>
	</form>
</div>
