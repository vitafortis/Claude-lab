<script lang="ts">
	import { Play, Plus, Trash2, Wand } from '@lucide/svelte';
	import GettingStarted from '#lib/components/GettingStarted.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import SessionCard from '#lib/components/SessionCard.svelte';
	import StateDot from '#lib/components/StateDot.svelte';
	import { ago, plural } from '#lib/client/format.ts';
	import { deleteSession, startSession } from '#lib/client/sessions.ts';
	import { sessions } from '#lib/client/state.svelte.ts';
	import { displayState, sortForOverview } from '#lib/session-state.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ordered = $derived(sortForOverview(sessions.list, sessions.live));
	const active = $derived(ordered.filter((s) => s.status !== 'stopped'));
	const stopped = $derived(ordered.filter((s) => s.status === 'stopped'));
	const states = $derived(active.map((s) => displayState(s, sessions.live[s.id])));
	const count = (st: string) => states.filter((x) => x === st).length;

	const description = $derived.by(() => {
		if (!sessions.list.length) return 'Claude Code sessions on your own hardware, one container each.';
		const failed = count('error');
		const parts = [`${active.length - failed} running`];
		if (failed) parts.push(`${failed} failed`);
		if (count('waiting')) parts.push(`${count('waiting')} need${count('waiting') === 1 ? 's' : ''} you`);
		if (count('working')) parts.push(`${count('working')} working`);
		if (stopped.length) parts.push(`${stopped.length} stopped`);
		return parts.join(' · ');
	});
</script>

<svelte:head><title>Sessions · Orbit</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="Sessions" {description}>
		{#snippet actions()}
			<!-- Until the first session, the guide below is the way in. -->
			{#if sessions.list.length}
				<a href="/new?mode=skill&command=/code-review" class="btn btn-secondary" title="Start a session that runs /code-review on a pull request"><Wand />Review a PR</a>
				<a href="/new" class="btn btn-primary"><Plus />New session</a>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="space-y-8 px-4 pb-10 sm:px-8">
		{#if !sessions.list.length}
			<GettingStarted accounts={data.accounts} signingIn={data.signingIn} githubAccounts={data.githubAccounts} />
		{/if}

		{#if active.length}
			<section class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
				{#each active as s (s.id)}
					<SessionCard session={s} live={sessions.live[s.id]} />
				{/each}
			</section>
		{/if}

		{#if stopped.length}
			<section>
				<h2 class="mb-2.5 px-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">Stopped · {plural(stopped.length, 'session')}</h2>
				<div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
					{#each stopped as s (s.id)}
						{@const sum = sessions.live[s.id]?.summary}
						<div class="card glow glow-gray flex items-center gap-3 px-4 py-3">
							<StateDot state="stopped" />
							<a href="/s/{s.id}" class="min-w-0 flex-1">
								<span class="block truncate text-[0.8125rem] font-medium hover:text-primary">{s.name}</span>
								<span class="block truncate text-xs text-muted-foreground">
									{s.repoFullName ?? s.repoUrl}{#if sum?.title} · {sum.title}{:else if sum?.lastPrompt} · {sum.lastPrompt}{/if}
								</span>
							</a>
							<span class="hidden text-xs text-muted-foreground sm:block">{ago(sum?.updatedAt ?? s.stoppedAt)}</span>
							<button class="btn btn-secondary btn-sm" title="Start and continue the newest conversation" onclick={() => startSession(s)}><Play />Resume</button>
							<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Delete" onclick={() => deleteSession(s, '')}><Trash2 /></button>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>
