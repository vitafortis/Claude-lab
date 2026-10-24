<script lang="ts">
	import { Check, GitBranch, KeyRound, Play, Plus, TerminalSquare, Trash2 } from '@lucide/svelte';
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
		const parts = [`${active.length} running`];
		if (count('waiting')) parts.push(`${count('waiting')} need${count('waiting') === 1 ? 's' : ''} you`);
		if (count('working')) parts.push(`${count('working')} working`);
		if (stopped.length) parts.push(`${stopped.length} stopped`);
		return parts.join(' · ');
	});

	const steps = $derived([
		{ done: data.claudeAccounts > 0, label: 'Connect a Claude account', hint: 'Sign in with your Pro or Max plan, or add an API key', href: '/accounts', icon: KeyRound },
		{ done: data.githubAccounts > 0, label: 'Connect GitHub', hint: 'For private repos and pushing. Public repos work without', href: '/accounts#github', icon: GitBranch },
		{ done: sessions.list.length > 0, label: 'Start a session', hint: 'Pick a repo; Claude starts in its own container', href: '/new', icon: TerminalSquare }
	]);
</script>

<svelte:head><title>Sessions · cc·modern</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="Sessions" {description}>
		{#snippet actions()}
			<a href="/new" class="btn btn-primary"><Plus />New session</a>
		{/snippet}
	</PageHeader>

	<div class="space-y-8 px-4 pb-10 sm:px-8">
		{#if !sessions.list.length}
			<section class="card mx-auto max-w-2xl p-6">
				<h2 class="text-[0.9375rem] font-semibold tracking-tight">Get started</h2>
				<p class="mt-1 text-[0.8125rem] text-muted-foreground">Three steps, then every session is a click away, from any browser.</p>
				<ol class="mt-5 space-y-2">
					{#each steps as step, i (step.label)}
						<li>
							<a href={step.href} class="flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
								<span class="grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold {step.done ? 'bg-success/15 text-success' : 'bg-primary-soft text-primary'}">
									{#if step.done}<Check class="size-3.5" />{:else}{i + 1}{/if}
								</span>
								<span class="min-w-0 flex-1">
									<span class="block text-[0.8125rem] font-medium {step.done ? 'text-muted-foreground line-through' : ''}">{step.label}</span>
									<span class="block text-xs text-muted-foreground">{step.hint}</span>
								</span>
								<step.icon class="size-4 text-muted-foreground" />
							</a>
						</li>
					{/each}
				</ol>
			</section>
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
				<div class="card divide-y divide-border overflow-hidden">
					{#each stopped as s (s.id)}
						{@const sum = sessions.live[s.id]?.summary}
						<div class="flex items-center gap-3 px-4 py-3">
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
