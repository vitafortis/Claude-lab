<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { CircleAlert, GitBranch, GitPullRequest, KeyRound, Layers, ListChecks, LoaderCircle, Radio, Rocket, Wand } from '@lucide/svelte';
	import AgentBadge from '#lib/components/AgentBadge.svelte';
	import BrandIcon from '#lib/components/BrandIcon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ModelPicker from '#lib/components/ModelPicker.svelte';
	import { modelGroups } from '#lib/models.ts';
	import RepoPicker from '#lib/components/RepoPicker.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { upsertSession } from '#lib/client/state.svelte.ts';
	import { parseRepo, slugify } from '#lib/launch.ts';
	import { ago, githubLabel } from '#lib/client/format.ts';
	import { matchProfile } from '#lib/profiles.ts';
	import { ACCOUNT_KINDS, AGENT_LABEL, AGENT_PERMISSION_MODES, fitPermissionMode } from '#lib/providers.ts';
	import { PERMISSION_MODES, type GithubPull, type GithubRepo, type PermissionMode, type Session, type SkillOption } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Form fields start from the loaded values (preferring a signed-in account) and are edited locally.
	const initial = untrack(() => ({
		account: (data.accounts.find((a) => a.status === 'signed_in') ?? data.accounts[0])?.id ?? '',
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
	let accountId = $state(initial.account);
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

	const account = $derived(data.accounts.find((a) => a.id === accountId));
	const agent = $derived(account?.agent ?? 'claude');
	const agentName = $derived(agent === 'claude' ? 'Claude' : AGENT_LABEL[agent]);
	const github = $derived(data.githubAccounts.find((a) => a.id === githubAccountId) ?? null);
	const parsed = $derived(parseRepo(repo));
	const rcAvailable = $derived(!!account && !!ACCOUNT_KINDS[account.kind].remoteControl);
	const permissionModes = $derived(PERMISSION_MODES.filter((m) => AGENT_PERMISSION_MODES[agent].includes(m.value)));
	const AGENTS = ['claude', 'codex', 'gemini'] as const;

	// Profiles: "auto" uses the first one matching the repo. Picking (or matching) a profile
	// fills in its account, model and permissions, which can still be changed by hand.
	let profileChoice = $state<string>('auto');
	const matched = $derived(parsed ? matchProfile(data.profiles, parsed.fullName ?? parsed.url) : null);
	const profile = $derived(profileChoice === 'auto' ? matched : (data.profiles.find((p) => p.id === profileChoice) ?? null));
	let appliedProfile: string | null = null;
	$effect(() => {
		const p = profile;
		if ((p?.id ?? null) === appliedProfile) return;
		appliedProfile = p?.id ?? null;
		if (!p || !data.accounts.some((a) => a.id === p.accountId)) return;
		accountId = p.accountId;
		model = p.model ?? '';
		permissionMode = p.permissionMode;
	});

	// Another agent: keep the permission mode to one it has, and drop Claude's model aliases.
	let lastAgent = untrack(() => agent);
	$effect(() => {
		const a = agent;
		if (a === lastAgent) return;
		lastAgent = a;
		untrack(() => {
			permissionMode = fitPermissionMode(a, permissionMode);
			if (profile?.accountId !== accountId && (a !== 'claude' || !modelGroups('claude', null).some((g) => g.options.some((o) => o.value === model)))) model = '';
		});
	});

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
		const q = accountId ? `?account=${accountId}` : '';
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
				accountId,
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
	<PageHeader title="New session" description="Clone a repo into its own container and start Claude Code, Codex or Gemini there." />

	<form class="max-w-3xl space-y-5 px-4 pb-12 sm:px-8" onsubmit={submit}>
		<div class="grid gap-2 sm:grid-cols-2">
			{#each [{ value: 'task', icon: ListChecks, title: 'Work on a task', body: 'Start the agent with a message, or at the prompt.' }, { value: 'skill', icon: Wand, title: 'Run a skill', body: 'Start with a skill or command, e.g. /code-review on a pull request.' }] as m (m.value)}
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

		{#if !data.accounts.length}
			<div class="card flex items-start gap-3 border-warning/40 p-4">
				<KeyRound class="mt-0.5 size-4 shrink-0 text-warning" />
				<div class="text-[0.8125rem]">
					<p class="font-medium">Connect a model account first</p>
					<p class="mt-0.5 text-muted-foreground">Sessions run as one of your accounts: a Claude login or key, Claude on your cloud, OpenAI or Google.</p>
					<a href="/accounts?add=model" class="btn btn-primary btn-sm mt-3">Add a model account</a>
				</div>
			</div>
		{/if}

		<section class="card space-y-4 p-5">
			<h2 class="text-[0.9375rem] font-semibold tracking-tight">Repository</h2>
			<div class="grid gap-4 sm:grid-cols-[14rem_1fr]">
				<div>
					<label class="label flex items-center gap-1.5" for="gh"><BrandIcon brand="github" class="size-3.5" />GitHub account</label>
					<select id="gh" class="input" bind:value={githubAccountId}>
						{#each data.githubAccounts as a (a.id)}<option value={a.id}>{githubLabel(a)}</option>{/each}
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
					<label class="label flex items-center justify-between" for="acct"><span>Account</span>{#if account}<AgentBadge agent={account.agent} />{/if}</label>
					<select id="acct" class="input" bind:value={accountId} required>
						{#each AGENTS as ag (ag)}
							{@const list = data.accounts.filter((a) => a.agent === ag)}
							{#if list.length}
								<optgroup label={AGENT_LABEL[ag]}>
									{#each list as a (a.id)}
										<option value={a.id}>{a.name} · {ACCOUNT_KINDS[a.kind].label}{a.status === 'signed_out' ? (ACCOUNT_KINDS[a.kind].signIn ? ' (not signed in)' : ' (not working)') : ''}</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					</select>
					{#if account && ACCOUNT_KINDS[account.kind].signIn && account.status === 'signed_out'}
						<p class="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
							<CircleAlert class="mt-px size-3.5 shrink-0" /><span>Not signed in yet. <a class="underline" href="/accounts">Sign in</a>{#if agent === 'claude'}, or run <code class="font-mono">/login</code> in the session's terminal{/if}.</span>
						</p>
					{/if}
				</div>
			</div>
			{#if data.profiles.length}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-[0.8125rem]">
					<Layers class="size-4 shrink-0 text-primary" />
					<label for="profile" class="font-medium">Profile</label>
					<select id="profile" class="input h-8 w-auto min-w-48 text-xs" bind:value={profileChoice}>
						<option value="auto">Match the repo{matched ? `: ${matched.name}` : ''}</option>
						{#each data.profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
						<option value="none">None</option>
					</select>
					<span class="text-xs text-muted-foreground">
						{#if profile}Fills in the account, model and permissions below.{:else if profileChoice === 'auto'}{parsed ? 'No profile matches this repo.' : 'Pick a repo to match.'}{/if}
					</span>
				</div>
			{/if}
			{#if mode === 'skill' && agent !== 'claude'}
				<p class="flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
					<CircleAlert class="mt-px size-3.5 shrink-0" /><span>Skills run in Claude Code. Pick a Claude account for this session.</span>
				</p>
			{/if}
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
					<textarea id="prompt" class="input h-auto min-h-24 py-2 leading-relaxed" rows="4" placeholder="What should {agentName} work on? Leave empty to start at the prompt." bind:value={prompt}></textarea>
				</div>
			{/if}
			<div class="grid gap-4 sm:grid-cols-[16rem_1fr]">
				<div>
					<label class="label" for="model">Model</label>
					<ModelPicker id="model" bind:value={model} {agent} kind={account?.kind} />
				</div>
				<div>
					<span class="label">Permissions</span>
					<div class="flex flex-wrap gap-1.5">
						{#each permissionModes as m (m.value)}
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
							{agent === 'claude' ? "Needs a Claude subscription login. Tokens, API keys and cloud providers can't use Remote Control." : 'Remote Control is a Claude Code feature.'}
						{/if}
					</p>
				</div>
				<Switch checked={rcAvailable && remoteControl} disabled={!rcAvailable} label="Remote Control" onchange={(v) => (remoteControl = v)} />
			</div>
		</section>

		{#if error}<p class="rounded-lg bg-danger/10 px-3 py-2 text-[0.8125rem] text-danger">{error}</p>{/if}
		<div class="flex items-center justify-end gap-2">
			<a href="/" class="btn btn-ghost">Cancel</a>
			<button class="btn btn-primary" disabled={busy || !parsed || !accountId || (mode === 'skill' && (!command.startsWith('/') || agent !== 'claude'))}>
				{#if busy}<LoaderCircle class="animate-spin" />{:else}<Rocket />{/if}{mode === 'skill' ? 'Run skill' : 'Start session'}
			</button>
		</div>
	</form>
</div>
