<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { CircleAlert, GitBranch, GitPullRequest, KeyRound, ListChecks, LoaderCircle, Radio, Rocket, Wand } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import RepoPicker from '#lib/components/RepoPicker.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { upsertSession } from '#lib/client/state.svelte.ts';
	import { parseRepo, slugify } from '#lib/launch.ts';
	import { ago } from '#lib/client/format.ts';
	import { CLAUDE_AUTH_LABEL, PERMISSION_MODES, type GithubPull, type GithubRepo, type PermissionMode, type Session, type SkillOption } from '#lib/types.ts';
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
		settings: data.settings,
		// /new?mode=skill&command=/code-review&repo=owner/name&pr=12 prefills the form.
		mode: page.url.searchParams.get('mode') === 'skill' ? ('skill' as const) : ('task' as const),
		command: page.url.searchParams.get('command') ?? '/code-review',
		repo: page.url.searchParams.get('repo') ?? '',
		pr: Number(page.url.searchParams.get('pr')) || null
	}));
	let mode = $state<'task' | 'skill'>(initial.mode);
	let command = $state(initial.command);
	let args = $state('');
	let argsTouched = $state(false);
	let skills = $state<SkillOption[]>([]);
	let pulls = $state<GithubPull[]>([]);
	let checkoutPr = $state<number | null>(initial.pr);
	let claudeAccountId = $state(initial.claude);
	let githubAccountId = $state(initial.github);
	let repo = $state(initial.repo);
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

	const skill = $derived(skills.find((o) => o.command === command));

	// Name follows the repo, branch, skill and PR until edited by hand.
	$effect(() => {
		if (nameTouched) return;
		if (!parsed) name = '';
		else if (mode === 'skill') name = `${parsed.dir} ${command.replace(/^\//, '')}${checkoutPr ? ` #${checkoutPr}` : ''}`;
		else name = checkoutPr ? `${parsed.dir} #${checkoutPr}` : newBranch ? `${parsed.dir} · ${newBranch}` : parsed.dir;
	});

	// Skills that take a PR get its number, unless arguments were typed by hand.
	$effect(() => {
		if (argsTouched) return;
		args = mode === 'skill' && skill?.takesPr && checkoutPr ? String(checkoutPr) : '';
	});

	$effect(() => {
		const q = claudeAccountId ? `?account=${claudeAccountId}` : '';
		api.get<SkillOption[]>(`/api/skills${q}`).then(
			(list) => (skills = list),
			() => {}
		);
	});

	$effect(() => {
		const full = parsed?.fullName;
		pulls = [];
		if (!full) return;
		const ctrl = new AbortController();
		const q = new URLSearchParams({ repo: full, ...(github ? { account: github.id } : {}) });
		api.get<GithubPull[]>(`/api/github/pulls?${q}`, ctrl.signal).then(
			(p) => (pulls = p),
			() => {}
		);
		return () => ctrl.abort();
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
				name: name || undefined,
				kind: mode,
				command: mode === 'skill' ? command : undefined,
				args: mode === 'skill' ? args : undefined,
				checkoutPr,
				repo,
				claudeAccountId,
				githubAccountId: githubAccountId || null,
				baseBranch: checkoutPr ? null : baseBranch || null,
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
		<div class="grid gap-2 sm:grid-cols-2">
			{#each [{ value: 'task', icon: ListChecks, title: 'Work on a task', body: 'Start Claude with a message, or at the prompt.' }, { value: 'skill', icon: Wand, title: 'Run a skill', body: 'Start with a skill or command, e.g. /code-review on a pull request.' }] as m (m.value)}
				<button
					type="button"
					class="flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors {mode === m.value ? 'border-primary/60 bg-primary-soft' : 'border-border bg-card hover:bg-accent/40'}"
					onclick={() => (mode = m.value as 'task' | 'skill')}
				>
					<m.icon class="mt-0.5 size-4 shrink-0 {mode === m.value ? 'text-primary' : 'text-muted-foreground'}" />
					<span>
						<span class="block text-[0.8125rem] font-medium">{m.title}</span>
						<span class="block text-xs text-muted-foreground">{m.body}</span>
					</span>
				</button>
			{/each}
		</div>

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
			{#if pulls.length}
				<div>
					<label class="label" for="pr">Check out a pull request <span class="font-normal text-muted-foreground/70">(optional)</span></label>
					<div class="relative">
						<GitPullRequest class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
						<select id="pr" class="input pl-9" bind:value={checkoutPr}>
							<option value={null}>No pull request</option>
							{#each pulls as p (p.number)}
								<option value={p.number}>#{p.number} {p.title}{p.author ? ` · ${p.author}` : ''}{p.draft ? ' · draft' : ''} · {ago(p.updatedAt)}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}
			<div class="grid gap-4 sm:grid-cols-2">
				<div class={checkoutPr ? 'pointer-events-none opacity-50' : ''}>
					<label class="label" for="base">Start from branch {#if checkoutPr}<span class="font-normal">(the PR's)</span>{/if}</label>
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
			{#if mode === 'skill'}
				<div>
					<span class="label">Skill</span>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each skills as o (o.command)}
							<button
								type="button"
								class="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors {command === o.command ? 'border-primary/60 bg-primary-soft' : 'border-border hover:bg-accent/40'}"
								onclick={() => (command = o.command)}
							>
								<span class="min-w-0">
									<span class="flex items-center gap-1.5 font-mono text-[0.8125rem] font-medium">{o.command}{#if o.source === 'account'}<span class="badge">yours</span>{/if}</span>
									{#if o.description}<span class="line-clamp-2 block text-xs text-muted-foreground">{o.description}</span>{/if}
								</span>
							</button>
						{/each}
					</div>
				</div>
				<div class="grid gap-4 sm:grid-cols-[14rem_1fr]">
					<div>
						<label class="label" for="cmd">Command</label>
						<input id="cmd" class="input font-mono text-[0.8125rem]" placeholder="/code-review" bind:value={command} spellcheck="false" />
					</div>
					<div>
						<label class="label" for="args">Arguments <span class="font-normal text-muted-foreground/70">(optional)</span></label>
						<input id="args" class="input font-mono text-[0.8125rem]" placeholder={skill?.takesPr ? 'PR number' : ''} bind:value={args} oninput={() => (argsTouched = true)} />
					</div>
				</div>
				<p class="-mt-1 text-xs text-muted-foreground">
					Claude starts with <code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{command}{args ? ` ${args}` : ''}</code>. A repo's own skills work too: type their name.
				</p>
			{:else}
				<div>
					<label class="label" for="prompt">First message <span class="font-normal text-muted-foreground/70">(optional)</span></label>
					<textarea id="prompt" class="input h-auto min-h-24 py-2 leading-relaxed" rows="4" placeholder="What should Claude work on? Leave empty to start at the prompt." bind:value={prompt}></textarea>
				</div>
			{/if}
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
			<button class="btn btn-primary" disabled={busy || !parsed || !claudeAccountId || (mode === 'skill' && !command.startsWith('/'))}>
				{#if busy}<LoaderCircle class="animate-spin" />{:else}<Rocket />{/if}{mode === 'skill' ? 'Run skill' : 'Start session'}
			</button>
		</div>
	</form>
</div>
