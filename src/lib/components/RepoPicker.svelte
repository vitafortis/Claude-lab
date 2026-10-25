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
	let loading = $state(false);
	let error = $state('');
	let open = $state(false);
	let owner = $state<string | null>(null);
	let index = $state(0);

	async function load(refresh = false) {
		if (!account) {
			repos = [];
			return;
		}
		loading = true;
		error = '';
		try {
			repos = await api.get<GithubRepo[]>(`/api/github-accounts/${account.id}/repos${refresh ? '?refresh' : ''}`);
		} catch (err) {
			error = errorMessage(err);
			repos = [];
		}
		loading = false;
	}

	$effect(() => {
		void account?.id;
		owner = null;
		void load();
	});

	const owners = $derived([...new Set(repos.map((r) => r.owner))]);
	const matches = $derived.by(() => {
		const q = value.trim().toLowerCase();
		return repos.filter((r) => (!owner || r.owner === owner) && (!q || r.fullName.toLowerCase().includes(q))).slice(0, 40);
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
			placeholder={account ? `Search ${account.label ?? account.login}'s repositories, or paste a URL` : 'owner/name or https://… git URL'}
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
		{#if loading}<LoaderCircle class="absolute top-2.5 right-3 size-4 animate-spin text-muted-foreground" />{/if}
	</div>

	{#if account && owners.length > 1}
		<div class="mt-2 flex flex-wrap items-center gap-1.5">
			<button type="button" class="badge cursor-pointer {owner === null ? 'badge-primary' : ''}" onclick={() => (owner = null)}>All</button>
			{#each owners as o (o)}
				<button type="button" class="badge cursor-pointer {owner === o ? 'badge-primary' : ''}" onclick={() => (owner = o)}>
					{#if o !== account.login}<Building2 />{/if}{o}
				</button>
			{/each}
			<button type="button" class="ml-auto text-muted-foreground hover:text-foreground" title="Reload the list" onclick={() => load(true)}><RefreshCw class="size-3.5" /></button>
		</div>
	{/if}
	{#if error}<p class="mt-1.5 text-xs text-danger">{error}</p>{/if}

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
