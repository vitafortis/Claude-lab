<script lang="ts">
	import { Building2, Globe, Lock, LoaderCircle, RefreshCw, Search } from '@lucide/svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago } from '#lib/client/format.ts';
	import type { GithubAccount, GithubRepo } from '#lib/types.ts';

	let {
		account,
		value = $bindable(''),
		onpick
	}: {
		account: GithubAccount | null;
		/** What's in the box: owner/name, or any git URL. */
		value: string;
		onpick: (repo: GithubRepo | null) => void;
	} = $props();

	let repos = $state<GithubRepo[]>([]);
	let notice = $state<string | null>(null);
	// Found past the list: GitHub's search by name, or the repo typed as owner/name.
	let found = $state<GithubRepo[]>([]);
	let searching = $state(false);
	let lookupError = $state('');
	let loading = $state(false);
	let error = $state('');
	let open = $state(false);
	let owner = $state<string | null>(null);
	let index = $state(0);

	// Switching tokens supersedes a list still loading: only the newest request may fill it in,
	// or a slow answer for the previous token could land under the new one.
	let loadSeq = 0;
	async function load(refresh = false) {
		const seq = ++loadSeq;
		repos = [];
		notice = null;
		error = '';
		if (!account) {
			loading = false;
			return;
		}
		loading = true;
		try {
			const r = await api.get<{ repos: GithubRepo[]; notice: string | null }>(`/api/github-accounts/${account.id}/repos${refresh ? '?refresh' : ''}`);
			if (seq !== loadSeq) return;
			repos = r.repos;
			notice = r.notice;
		} catch (err) {
			if (seq !== loadSeq) return;
			error = errorMessage(err);
		}
		loading = false;
	}

	$effect(() => {
		void account?.id;
		owner = null;
		void load();
	});

	// The list holds the thousand most recently pushed: past it, ask GitHub. A full owner/name is
	// checked directly, so a repo the token can't see says why instead of just not appearing.
	$effect(() => {
		const id = account?.id;
		const q = value.trim();
		found = [];
		lookupError = '';
		if (!id || q.length < 2 || q.includes('://')) return;
		const ctrl = new AbortController();
		const t = setTimeout(async () => {
			searching = true;
			const slash = /^([\w-]+)\/([\w.-]*)$/.exec(q);
			const base = `/api/github-accounts/${id}/repos`;
			try {
				if (slash) {
					// "owner/…": that owner's own list (private repos included), then the exact repo.
					const [, who, name] = slash;
					const theirs = await api.get<GithubRepo[]>(`${base}?owner=${encodeURIComponent(who)}`, ctrl.signal).catch(() => [] as GithubRepo[]);
					found = theirs.filter((r) => r.name.toLowerCase().includes(name.toLowerCase()));
					const exact = [...repos, ...theirs].some((r) => r.fullName.toLowerCase() === q.toLowerCase());
					if (name && !exact) found = [...found, await api.get<GithubRepo>(`${base}?repo=${encodeURIComponent(q)}`, ctrl.signal)];
				} else {
					found = await api.get<GithubRepo[]>(`${base}?search=${encodeURIComponent(q)}`, ctrl.signal);
				}
			} catch (err) {
				if (!ctrl.signal.aborted && slash?.[2]) lookupError = errorMessage(err);
			}
			if (!ctrl.signal.aborted) searching = false;
		}, 400);
		return () => {
			clearTimeout(t);
			ctrl.abort();
			searching = false;
		};
	});

	const owners = $derived([...new Set(repos.map((r) => r.owner))]);
	const matches = $derived.by(() => {
		const q = value.trim().toLowerCase();
		const listed = repos.filter((r) => (!owner || r.owner === owner) && (!q || r.fullName.toLowerCase().includes(q)));
		const known = new Set(listed.map((r) => r.fullName));
		const more = found.filter((r) => !known.has(r.fullName) && (!owner || r.owner === owner));
		return [...listed, ...more].slice(0, 40);
	});

	function pick(r: GithubRepo) {
		value = r.fullName;
		open = false;
		onpick(r);
	}

	function onkeydown(e: KeyboardEvent) {
		if (!open || !matches.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			index = Math.min(matches.length - 1, index + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			index = Math.max(0, index - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pick(matches[index]);
		} else if (e.key === 'Escape') open = false;
	}
</script>

<div class="relative">
	<div class="relative">
		<Search class="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
		<input
			class="input pl-9 font-mono text-[0.8125rem]"
			placeholder={account ? `Search ${account.label ?? account.login}'s repositories, type owner/ to list an org's, or paste a URL` : 'owner/name or https://… git URL'}
			bind:value
			autocomplete="off"
			spellcheck="false"
			onfocus={() => (open = true)}
			onblur={() => setTimeout(() => (open = false), 150)}
			oninput={() => {
				open = true;
				index = 0;
				onpick(null);
			}}
			{onkeydown}
		/>
		{#if loading || searching}<LoaderCircle class="absolute top-2.5 right-3 size-4 animate-spin text-muted-foreground" />{/if}
	</div>

	{#if account && owners.length > 1}
		<div class="mt-2 flex flex-wrap items-center gap-1.5">
			<button type="button" class="badge cursor-pointer {owner === null ? 'badge-primary' : ''}" onclick={() => (owner = null)}>All</button>
			{#each owners as o (o)}
				<button type="button" class="badge cursor-pointer {owner === o ? 'badge-primary' : ''}" onclick={() => (owner = o)}>
					{#if o !== account.login}<Building2 />{/if}{o}
				</button>
			{/each}
			<span class="ml-auto text-[0.6875rem] text-muted-foreground" title="What GitHub returns for this token">{repos.length} repos · {repos.filter((r) => r.private).length} private</span>
			<button type="button" class="text-muted-foreground hover:text-foreground" title="Reload the list" onclick={() => load(true)}><RefreshCw class="size-3.5" /></button>
		</div>
	{/if}
	{#if error}<p class="mt-1.5 text-xs text-danger">{error}</p>{/if}
	{#if lookupError}
		<p class="mt-1.5 text-xs text-danger">{lookupError}</p>
		{#if account}<a class="mt-1 inline-block text-xs text-primary hover:underline" href="/accounts?check={account.id}&repo={encodeURIComponent(value.trim())}#github">See exactly what GitHub answers this token →</a>{/if}
	{/if}
	{#if notice}<p class="mt-1.5 text-xs text-warning">{notice}</p>{/if}

	{#if open && matches.length}
		<ul class="absolute z-20 mt-1.5 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-surface-lg">
			{#each matches as r, i (r.fullName)}
				<li>
					<button
						type="button"
						class="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left {i === index ? 'bg-accent' : ''}"
						onmousedown={(e) => e.preventDefault()}
						onmouseenter={() => (index = i)}
						onclick={() => pick(r)}
					>
						{#if r.private}<Lock class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{:else}<Globe class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate font-mono text-[0.8125rem]">{r.fullName}</span>
							{#if r.description}<span class="block truncate text-xs text-muted-foreground">{r.description}</span>{/if}
						</span>
						<span class="shrink-0 text-[0.6875rem] text-muted-foreground">{ago(r.pushedAt)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
