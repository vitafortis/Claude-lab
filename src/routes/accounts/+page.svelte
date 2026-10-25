<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import {
		Building2,
		CircleCheck,
		CircleHelp,
		ChevronDown,
		ChevronUp,
		CircleX,
		ExternalLink,
		Layers,
		Pencil,
		KeyRound,
		LoaderCircle,
		LogIn,
		Plus,
		Send,
		RefreshCw,
		ShieldCheck,
		Trash2
	} from '@lucide/svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import LinkBar from '#lib/components/LinkBar.svelte';
	import Terminal from '#lib/components/Terminal.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { copyText } from '#lib/client/clipboard.ts';
	import { ago } from '#lib/client/format.ts';
	import { confirmAction, toast } from '#lib/client/state.svelte.ts';
	import AgentBadge from '#lib/components/AgentBadge.svelte';
	import { matchProfile } from '#lib/profiles.ts';
	import { ACCOUNT_KINDS, AGENT_LABEL, AGENT_PERMISSION_MODES, fitPermissionMode, type KindSpec } from '#lib/providers.ts';
	import { PERMISSION_MODES, type AccountKind, type Agent, type GithubAccount, type ModelAccount, type PermissionMode, type Profile } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const welcome = $derived(page.url.searchParams.has('welcome'));

	// ── Model accounts ──────────────────────────────────────────────────

	const GROUPS = [...new Set(Object.values(ACCOUNT_KINDS).map((k) => k.group))];
	const kindsIn = (g: string) => (Object.entries(ACCOUNT_KINDS) as [AccountKind, KindSpec][]).filter(([, k]) => k.group === g);

	// The account dialog adds one (any kind) or edits one (its kind is fixed).
	let editing = $state<ModelAccount | null>(null);
	let adding = $state(false);
	let kind = $state<AccountKind>('subscription');
	let name = $state('');
	let fields = $state<Record<string, string>>({});
	let saving = $state(false);
	let formError = $state('');
	const spec = $derived(ACCOUNT_KINDS[kind]);

	let login = $state<ModelAccount | null>(null);
	let loginReady = $state(false);
	let loginLink = $state<string | null>(null);
	let loginLinks = $state<string[]>([]);
	let loginCode = $state<string | null>(null);
	let loginTerm = $state<Terminal>();
	let pasted = $state('');
	let finishing = $state(false);
	let checking = $state<string | null>(null);

	function defaultsFor(k: AccountKind, config: Record<string, string> = {}) {
		return Object.fromEntries(ACCOUNT_KINDS[k].fields.map((f) => [f.key, f.secret ? '' : (config[f.key] ?? f.default ?? '')]));
	}

	function openAdd() {
		editing = null;
		kind = 'subscription';
		name = data.accounts.length ? '' : 'Personal';
		fields = defaultsFor(kind);
		formError = '';
		adding = true;
	}

	function openEdit(a: ModelAccount) {
		editing = a;
		kind = a.kind;
		name = a.name;
		fields = defaultsFor(a.kind, a.config);
		formError = '';
		adding = true;
	}

	function pickKind(k: AccountKind) {
		kind = k;
		fields = defaultsFor(k);
	}

	async function saveAccount(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		formError = '';
		try {
			if (editing) {
				await api.patch<ModelAccount>(`/api/model-accounts/${editing.id}`, { name: name || editing.name, fields });
				adding = false;
				const a = editing;
				await invalidateAll();
				if (!ACCOUNT_KINDS[a.kind].signIn) void check(a);
			} else {
				const a = await api.post<ModelAccount>('/api/model-accounts', { kind, name: name || spec.label, fields });
				adding = false;
				await invalidateAll();
				if (ACCOUNT_KINDS[a.kind].signIn) void startLogin(a);
				else void check(a);
			}
		} catch (err) {
			formError = errorMessage(err);
		}
		saving = false;
	}

	const SIGN_IN: Record<Agent, { title: string; help: string }> = {
		claude: { title: 'Sign in to Claude', help: 'Open the link Claude prints, approve, then paste the code back into the terminal.' },
		codex: { title: 'Sign in to ChatGPT', help: 'Open the link Codex prints and enter the one-time code shown in the terminal.' },
		gemini: { title: 'Sign in to Google', help: 'Open the link Gemini prints, approve, then paste the code back into the terminal.' }
	};

	async function startLogin(a: ModelAccount) {
		login = a;
		loginReady = false;
		loginLink = null;
		loginLinks = [];
		loginCode = null;
		pasted = '';
		try {
			await api.post(`/api/model-accounts/${a.id}/login`);
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
			const r = await api.del<ModelAccount>(`/api/model-accounts/${a.id}/login`);
			if (r.status === 'signed_in') toast('success', `Signed in${r.email ? ` as ${r.email}` : ''}`);
			else toast('info', 'Not signed in yet', 'Run the sign-in again whenever you like.');
		} catch (err) {
			toast('error', "Couldn't check the sign-in", errorMessage(err));
		}
		finishing = false;
		login = null;
		await invalidateAll();
	}

	// Links wrap in the terminal and are hard to select on a phone: offer them as buttons,
	// with any one-time code, for as long as the sign-in is open.
	$effect(() => {
		if (!login || !loginReady) return;
		const id = login.id;
		const t = setInterval(async () => {
			const r = await api.get<{ url: string | null; links: string[]; code: string | null }>(`/api/model-accounts/${id}/login`).catch(() => null);
			if (!r) return;
			if (r.url) loginLink = r.url;
			loginLinks = r.links;
			loginCode = r.code;
		}, 1500);
		return () => clearInterval(t);
	});

	/** Types the code from the provider into the terminal and presses Enter. */
	function sendPasted(e: SubmitEvent) {
		e.preventDefault();
		const text = pasted.trim();
		if (!text || !loginTerm) return;
		loginTerm.input(text);
		setTimeout(() => loginTerm?.input('\r'), 50);
		pasted = '';
	}

	// Closing the page mid-sign-in still cleans up the container.
	onDestroy(() => {
		if (login) void api.del(`/api/model-accounts/${login.id}/login`).catch(() => {});
	});

	async function check(a: ModelAccount) {
		checking = a.id;
		try {
			const r = await api.post<ModelAccount>(`/api/model-accounts/${a.id}/check`);
			if (r.status === 'signed_in') toast('success', `${a.name} works`, r.email ?? undefined);
			else if (r.status === 'signed_out') toast('error', ACCOUNT_KINDS[a.kind].signIn ? `${a.name} isn't signed in` : `${a.name} doesn't work`);
			else toast('info', `Couldn't tell whether ${a.name} works`);
		} catch (err) {
			toast('error', `${a.name} doesn't work`, errorMessage(err));
		}
		checking = null;
		await invalidateAll();
	}

	async function removeAccount(a: ModelAccount) {
		const used = data.profiles.filter((p) => p.accountId === a.id);
		const ok = await confirmAction({
			title: `Remove ${a.name}?`,
			body:
				`This deletes its sign-in, keys, settings and stored conversations from this server. The account at ${ACCOUNT_KINDS[a.kind].group} itself is not affected.` +
				(used.length ? ` ${used.length === 1 ? 'The profile' : 'The profiles'} ${used.map((p) => `“${p.name}”`).join(', ')} will be removed too.` : ''),
			confirmLabel: 'Remove',
			danger: true
		});
		if (!ok) return;
		try {
			await api.del(`/api/model-accounts/${a.id}`);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't remove it", errorMessage(err));
		}
	}

	function details(a: ModelAccount): string {
		const label = ACCOUNT_KINDS[a.kind].label;
		const plan = a.plan && a.plan !== label && !/^[a-z_]+$/.test(a.plan) ? a.plan : null;
		return [label, a.config.region, a.config.baseUrl, a.email, plan, a.checkedAt && `checked ${ago(a.checkedAt)}`].filter(Boolean).join(' · ');
	}

	// ── Profiles ────────────────────────────────────────────────────────

	const accountById = $derived(new Map(data.accounts.map((a) => [a.id, a])));

	let profileOpen = $state(false);
	let profileEditing = $state<Profile | null>(null);
	let pf = $state({ name: '', accountId: '', model: '', permissionMode: 'default' as PermissionMode, repos: '' });
	let profileError = $state('');
	let tryRepo = $state('');
	const pfAgent = $derived(accountById.get(pf.accountId)?.agent ?? 'claude');
	const pfModes = $derived(PERMISSION_MODES.filter((m) => AGENT_PERMISSION_MODES[pfAgent].includes(m.value)));
	const tried = $derived(tryRepo.trim() ? matchProfile(data.profiles, tryRepo.trim()) : undefined);

	function openProfile(p?: Profile) {
		profileEditing = p ?? null;
		pf = p
			? { name: p.name, accountId: p.accountId, model: p.model ?? '', permissionMode: p.permissionMode, repos: p.repos.join('\n') }
			: { name: '', accountId: data.accounts[0]?.id ?? '', model: '', permissionMode: 'default', repos: '' };
		profileError = '';
		profileOpen = true;
	}

	async function saveProfile(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		profileError = '';
		const payload = { ...pf, model: pf.model || null, permissionMode: fitPermissionMode(pfAgent, pf.permissionMode) };
		try {
			if (profileEditing) await api.put(`/api/profiles/${profileEditing.id}`, payload);
			else await api.post('/api/profiles', payload);
			profileOpen = false;
			await invalidateAll();
		} catch (err) {
			profileError = errorMessage(err);
		}
		saving = false;
	}

	async function moveProfile(i: number, by: number) {
		const ids = data.profiles.map((p) => p.id);
		const j = i + by;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		try {
			await api.put('/api/profiles/order', { ids });
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't reorder", errorMessage(err));
		}
	}

	async function removeProfile(p: Profile) {
		const ok = await confirmAction({ title: `Delete the profile ${p.name}?`, body: 'Matching repos go back to the account you pick each time. Linear rules that used it fall back to their own settings.', confirmLabel: 'Delete', danger: true });
		if (!ok) return;
		await api.del(`/api/profiles/${p.id}`).catch((err) => toast('error', "Couldn't delete it", errorMessage(err)));
		await invalidateAll();
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

{#snippet statusBadge(a: ModelAccount)}
	{@const signIn = ACCOUNT_KINDS[a.kind].signIn}
	{#if a.status === 'signed_in'}
		<span class="badge badge-success"><CircleCheck />{signIn ? 'Signed in' : 'Ready'}</span>
	{:else if a.status === 'signed_out'}
		<span class="badge badge-warning"><CircleX />{signIn ? 'Not signed in' : 'Not working'}</span>
	{:else}
		<span class="badge"><CircleHelp />Not checked</span>
	{/if}
{/snippet}

<div class="h-full overflow-y-auto">
	<PageHeader title="Accounts" description="The models sessions run on, which repos use which, and how sessions reach GitHub." />

	<div class="max-w-4xl space-y-8 px-4 pb-12 sm:px-8">
		{#if welcome}
			<div class="card flex items-start gap-3 border-primary/30 p-4 text-[0.8125rem]">
				<ShieldCheck class="mt-0.5 size-4 shrink-0 text-primary" />
				<p>You're set up. Connect a model account below (and GitHub for private repos), then <a class="text-primary hover:underline" href="/new">start a session</a>.</p>
			</div>
		{/if}

		<section>
			<div class="mb-3 flex items-end justify-between gap-3">
				<div>
					<h2 class="text-[0.9375rem] font-semibold tracking-tight">Models</h2>
					<p class="text-xs text-muted-foreground">Claude through Anthropic or your cloud, OpenAI through Codex CLI, Gemini through Gemini CLI. Sessions of one account share its sign-in and settings.</p>
				</div>
				<button class="btn btn-secondary btn-sm" onclick={openAdd}><Plus />Add account</button>
			</div>
			<div class="card divide-y divide-border">
				{#each data.accounts as a (a.id)}
					<div class="flex flex-wrap items-center gap-3 px-4 py-3">
						<span class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><KeyRound class="size-4" /></span>
						<div class="min-w-0 flex-1">
							<p class="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">{a.name} <AgentBadge agent={a.agent} /> {@render statusBadge(a)}</p>
							<p class="truncate text-xs text-muted-foreground">{details(a)}</p>
						</div>
						<div class="flex items-center gap-1.5">
							{#if ACCOUNT_KINDS[a.kind].signIn}
								<button class="btn btn-sm {a.status === 'signed_in' ? 'btn-ghost' : 'btn-primary'}" onclick={() => startLogin(a)}><LogIn />{a.status === 'signed_in' ? 'Sign in again' : 'Sign in'}</button>
							{/if}
							<button class="btn btn-ghost btn-sm" disabled={checking === a.id} onclick={() => check(a)}>
								{#if checking === a.id}<LoaderCircle class="animate-spin" />{:else}<RefreshCw />{/if}Check
							</button>
							<button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick={() => openEdit(a)}><Pencil /></button>
							<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Remove" onclick={() => removeAccount(a)}><Trash2 /></button>
						</div>
					</div>
				{:else}
					<button class="w-full px-4 py-8 text-center text-[0.8125rem] text-muted-foreground hover:text-foreground" onclick={openAdd}>
						No model accounts yet. <span class="text-primary">Add one →</span>
					</button>
				{/each}
			</div>
		</section>

		<section id="profiles">
			<div class="mb-3 flex items-end justify-between gap-3">
				<div>
					<h2 class="text-[0.9375rem] font-semibold tracking-tight">Profiles</h2>
					<p class="text-xs text-muted-foreground">Which repos go to which model. New sessions and Linear rules pick the first profile matching the repo.</p>
				</div>
				<button class="btn btn-secondary btn-sm" disabled={!data.accounts.length} onclick={() => openProfile()}><Plus />Add profile</button>
			</div>
			<div class="card divide-y divide-border">
				{#each data.profiles as p, i (p.id)}
					{@const acct = accountById.get(p.accountId)}
					<div class="flex flex-wrap items-center gap-3 px-4 py-3">
						<div class="flex flex-col">
							<button class="btn btn-ghost btn-icon h-4 w-6 disabled:opacity-20" title="Match earlier" disabled={i === 0} onclick={() => moveProfile(i, -1)}><ChevronUp /></button>
							<button class="btn btn-ghost btn-icon h-4 w-6 disabled:opacity-20" title="Match later" disabled={i === data.profiles.length - 1} onclick={() => moveProfile(i, 1)}><ChevronDown /></button>
						</div>
						<div class="min-w-0 flex-1">
							<p class="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">
								{p.name}
								{#if acct}<AgentBadge agent={acct.agent} />{/if}
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{acct?.name ?? 'Missing account'} · {p.model ?? 'default model'} · {PERMISSION_MODES.find((m) => m.value === p.permissionMode)?.label}
							</p>
							<p class="mt-1 flex flex-wrap gap-1">
								{#each p.repos as r (r)}<span class="badge font-mono">{r}</span>{:else}<span class="text-xs text-muted-foreground">No repos: only used when picked</span>{/each}
							</p>
						</div>
						<button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick={() => openProfile(p)}><Pencil /></button>
						<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Delete" onclick={() => removeProfile(p)}><Trash2 /></button>
					</div>
				{:else}
					<p class="flex items-center justify-center gap-2 px-4 py-8 text-center text-[0.8125rem] text-muted-foreground">
						<Layers class="size-4" />No profiles. Every session uses the account you pick for it.
					</p>
				{/each}
				{#if data.profiles.length}
					<div class="flex flex-wrap items-center gap-2 bg-surface px-4 py-2.5 text-xs">
						<label for="try" class="text-muted-foreground">Try a repo</label>
						<input id="try" class="input h-7 max-w-56 font-mono text-xs" placeholder="owner/name" bind:value={tryRepo} />
						{#if tried !== undefined}<span class="text-muted-foreground">→ {#if tried}<b class="font-medium text-foreground">{tried.name}</b>{:else}no profile: picked by hand{/if}</span>{/if}
					</div>
				{/if}
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

<Dialog bind:open={adding} title={editing ? `Edit ${editing.name}` : 'Add a model account'} width="max-w-2xl">
	<form id="add-account" class="space-y-4" onsubmit={saveAccount}>
		{#if !editing}
			{#each GROUPS as g (g)}
				<div>
					<p class="mb-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">{g}</p>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each kindsIn(g) as [value, k] (value)}
							<label class="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors {kind === value ? 'border-primary/60 bg-primary-soft' : 'border-border hover:bg-accent/40'}">
								<input type="radio" name="kind" {value} checked={kind === value} onchange={() => pickKind(value)} class="mt-1 accent-[var(--primary)]" />
								<span class="min-w-0">
									<span class="block text-[0.8125rem] font-medium">{k.label}</span>
									<span class="block text-xs text-muted-foreground">{k.description}</span>
								</span>
							</label>
						{/each}
					</div>
				</div>
			{/each}
		{:else}
			<p class="flex items-center gap-2 text-[0.8125rem]"><AgentBadge agent={spec.agent} />{spec.label}</p>
		{/if}
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="sm:col-span-2">
				<label class="label" for="aname">Name</label>
				<input id="aname" class="input" placeholder="Personal, Work…" bind:value={name} />
			</div>
			{#each spec.fields as f (f.key)}
				<div class={f.multiline || f.options || f.key === 'baseUrl' ? 'sm:col-span-2' : ''}>
					<label class="label" for="f-{f.key}">{f.label}{#if !f.required}<span class="font-normal text-muted-foreground"> · optional</span>{/if}</label>
					{#if f.options}
						<select id="f-{f.key}" class="input" bind:value={fields[f.key]}>
							{#each f.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
						</select>
					{:else if f.multiline}
						<textarea
							id="f-{f.key}"
							class="input min-h-28 py-2 font-mono text-xs"
							placeholder={editing?.secrets.includes(f.key) ? 'Stored. Paste a new one to replace it.' : f.placeholder}
							bind:value={fields[f.key]}
						></textarea>
					{:else}
						<input
							id="f-{f.key}"
							class="input {f.secret || f.key.endsWith('Model') ? 'font-mono text-xs' : ''}"
							type={f.secret ? 'password' : 'text'}
							autocomplete="off"
							placeholder={f.secret && editing?.secrets.includes(f.key) ? '•••••••• stored; type to replace' : f.placeholder}
							bind:value={fields[f.key]}
						/>
					{/if}
					{#if f.help}<p class="mt-1 text-xs text-muted-foreground">{f.help}</p>{/if}
				</div>
			{/each}
		</div>
		<p class="text-xs text-muted-foreground">
			{#if spec.signIn}After saving, a terminal opens here to sign in. The sign-in stays in this account's folder on the server.
			{:else}Keys are stored encrypted and passed to {AGENT_LABEL[spec.agent]} as environment variables. Check sends a tiny request to make sure they work.{/if}
		</p>
		{#if formError}<p class="text-xs text-danger">{formError}</p>{/if}
	</form>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (adding = false)}>Cancel</button>
		<button class="btn btn-primary" form="add-account" disabled={saving}>
			{#if saving}<LoaderCircle class="animate-spin" />{/if}{editing ? 'Save' : spec.signIn ? 'Add and sign in' : 'Add account'}
		</button>
	{/snippet}
</Dialog>

<Dialog
	bind:open={() => !!login, (v) => !v && !finishing && finishLogin()}
	title="{login ? SIGN_IN[login.agent].title : ''}{login ? ` · ${login.name}` : ''}"
	description={login ? SIGN_IN[login.agent].help : ''}
	width="max-w-4xl"
>
	<div class="flex h-[26rem] flex-col overflow-hidden rounded-xl border border-term-edge max-sm:h-[20rem]">
		<LinkBar links={loginLinks} code={loginCode} />
		{#if login && loginReady}
			<div class="min-h-0 flex-1"><Terminal bind:this={loginTerm} path="/ws/accounts/{login.id}/login" /></div>
		{:else}
			<div class="grid h-full place-items-center text-xs text-[#9aa3b2]" style="background: var(--term-bg)">
				<span class="flex items-center gap-2"><LoaderCircle class="size-4 animate-spin" />Starting the sign-in container…</span>
			</div>
		{/if}
	</div>
	<div class="mt-3 flex flex-wrap items-center gap-2">
		{#if loginLink}
			<a class="btn btn-primary btn-sm" href={loginLink} target="_blank" rel="noopener"><ExternalLink />Open the sign-in page</a>
		{/if}
		{#if login?.agent !== 'codex'}
			<!-- Claude and Gemini hand back a code to paste in; pasting into a terminal is fiddly on phones. -->
			<form class="flex min-w-56 flex-1 gap-2" onsubmit={sendPasted}>
				<input class="input h-8 font-mono text-xs" placeholder="Paste the code from the sign-in page" autocomplete="off" bind:value={pasted} disabled={!loginReady} />
				<button class="btn btn-secondary btn-sm shrink-0" disabled={!pasted.trim()}><Send />Send</button>
			</form>
		{/if}
	</div>
	<p class="mt-2 text-xs text-muted-foreground">The login is saved in this account's folder on the server and shared by its sessions.</p>
	{#snippet footer()}
		<button class="btn btn-primary" disabled={finishing} onclick={finishLogin}>
			{#if finishing}<LoaderCircle class="animate-spin" />{/if}Done
		</button>
	{/snippet}
</Dialog>

<Dialog bind:open={profileOpen} title={profileEditing ? `Edit ${profileEditing.name}` : 'Add a profile'} description="Sessions on matching repos start with this account, model and permissions." width="max-w-lg">
	<form id="profile" class="space-y-3" onsubmit={saveProfile}>
		<div>
			<label class="label" for="pname">Name</label>
			<input id="pname" class="input" placeholder="Work repos on Bedrock, Side projects on Codex…" bind:value={pf.name} required />
		</div>
		<div>
			<label class="label" for="prepos">Repos</label>
			<textarea id="prepos" class="input min-h-20 py-2 font-mono text-xs" placeholder={'acme/*\nme/side-project\n*-infra'} bind:value={pf.repos}></textarea>
			<p class="mt-1 text-xs text-muted-foreground">One per line, owner/name. <code class="font-mono">*</code> matches anything; <code class="font-mono">*</code> alone matches every repo.</p>
		</div>
		<div>
			<label class="label" for="pacct">Account</label>
			<select id="pacct" class="input" bind:value={pf.accountId} required>
				{#each data.accounts as a (a.id)}<option value={a.id}>{a.name} · {ACCOUNT_KINDS[a.kind].label}</option>{/each}
			</select>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="label" for="pmodel">Model</label>
				<input id="pmodel" class="input font-mono text-xs" list="pmodels" placeholder="Default" bind:value={pf.model} />
				<datalist id="pmodels">
					{#each ACCOUNT_KINDS[accountById.get(pf.accountId)?.kind ?? 'subscription'].models as m (m)}<option value={m}></option>{/each}
				</datalist>
			</div>
			<div>
				<label class="label" for="pperm">Permissions</label>
				<select id="pperm" class="input" bind:value={pf.permissionMode}>
					{#each pfModes as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
				</select>
			</div>
		</div>
		{#if profileError}<p class="text-xs text-danger">{profileError}</p>{/if}
	</form>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (profileOpen = false)}>Cancel</button>
		<button class="btn btn-primary" form="profile" disabled={saving}>{#if saving}<LoaderCircle class="animate-spin" />{/if}{profileEditing ? 'Save' : 'Add profile'}</button>
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
