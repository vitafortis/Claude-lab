<script lang="ts">
	import { Building2, Globe, Lock, LoaderCircle, RefreshCw, Search } from '@lucide/svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago } from '#lib/client/format.ts';
	import type { GithubRepo } from '#lib/types.ts';

	/** Repos from every GitHub token at once: which token a session uses is worked out per repo. */
	let {
		logins,
		value = $bindable(''),
		onpick
	}: {
		/** The GitHub logins of the tokens; none means a URL or public owner/name only. */
		logins: string[];
		/** What's in the box: owner/name, or any git URL. */
		value: string;
		onpick: (repo: GithubRepo | null) => void;
	} = $props();

	let repos = $state<GithubRepo[]>([]);
	let notice = $state<string | null>(null);
	// Found past the list: GitHub's search by name, or the repo typed as owner/name.
	let found = $state<GithubRepo[]>([]);
	let searching = $state(false);
	let loading = $state(false);
	let error = $state('');
	let open = $state(false);
	let owner = $state<string | null>(null);
	let index = $state(0);

	const enabled = $derived(logins.length > 0);

	// A reload supersedes a list still loading: only the newest request may fill it in.
	let loadSeq = 0;
	async function load(refresh = false) {
		const seq = ++loadSeq;
		error = '';
		if (!enabled) {
			repos = [];
			loading = false;
			return;
		}
		loading = true;
		try {
			const r = await api.get<{ repos: GithubRepo[]; notice: string | null }>(`/api/github/repos${refresh ? '?refresh' : ''}`);
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
		void enabled;
		owner = null;
		void load();
	});

	// The list holds the thousand most recently pushed per token: past it, ask GitHub. (Whether a
	// full owner/name can be opened, and with which token, is shown under the picker.)
	$effect(() => {
		const q = value.trim();
		found = [];
		if (!enabled || q.length < 2 || q.includes('://')) return;
		const ctrl = new AbortController();
		const t = setTimeout(async () => {
			searching = true;
			const slash = /^([\w-]+)\/([\w.-]*)$/.exec(q);
			try {
				if (slash) {
					// "owner/…": that owner's own list, private repos included.
					const [, who, name] = slash;
					const theirs = await api.get<{ repos: GithubRepo[] }>(`/api/github/repos?owner=${encodeURIComponent(who)}`, ctrl.signal);
					found = theirs.repos.filter((r) => r.name.toLowerCase().includes(name.toLowerCase()));
				} else {
					found = (await api.get<{ repos: GithubRepo[] }>(`/api/github/repos?search=${encodeURIComponent(q)}`, ctrl.signal)).repos;
				}
			} catch {}
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
			placeholder={enabled ? 'Search repos, owner/ for an org, or paste a URL' : 'owner/name or https://… git URL'}
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

	{#if enabled && owners.length > 1}
		<div class="mt-2 flex flex-wrap items-center gap-1.5">
			<button type="button" class="badge cursor-pointer {owner === null ? 'badge-primary' : ''}" onclick={() => (owner = null)}>All</button>
			{#each owners as o (o)}
				<button type="button" class="badge cursor-pointer {owner === o ? 'badge-primary' : ''}" onclick={() => (owner = o)}>
					{#if !logins.includes(o)}<Building2 />{/if}{o}
				</button>
			{/each}
			<span class="ml-auto text-[0.6875rem] text-muted-foreground" title="What GitHub returns for your tokens">{repos.length} repos · {repos.filter((r) => r.private).length} private</span>
			<button type="button" class="text-muted-foreground hover:text-foreground" title="Reload the list" onclick={() => load(true)}><RefreshCw class="size-3.5" /></button>
		</div>
	{/if}
	{#if error}<p class="mt-1.5 text-xs text-danger">{error}</p>{/if}
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
