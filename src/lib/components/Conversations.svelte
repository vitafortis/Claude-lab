<script lang="ts">
	import { untrack } from 'svelte';
	import { History, LoaderCircle, RotateCcw } from '@lucide/svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago, bytes, plural } from '#lib/client/format.ts';
	import type { Conversation } from '#lib/types.ts';

	let {
		sessionId,
		sessionName,
		current = null,
		updated = null,
		initial = null,
		onresume
	}: {
		sessionId: string;
		sessionName: string;
		current?: string | null;
		/** When the newest conversation last changed: the list refreshes (in place) after it. */
		updated?: string | null;
		/** The list as the page was loaded with it, shown until a fresh one arrives. */
		initial?: Conversation[] | null;
		onresume: (c: Conversation) => void;
	} = $props();

	// Conversations started with --name carry the session's name as their title; the first prompt says more.
	const label = (c: Conversation) => (c.title && c.title !== sessionName ? c.title : (c.firstPrompt ?? c.title ?? 'Untitled'));

	let list = $state<Conversation[] | null>(untrack(() => initial));
	let error = $state('');

	// What's on screen (at first, the list the page came with) stays there while a fresh list
	// loads, and is replaced only once that arrives.
	export async function reload() {
		const id = sessionId;
		try {
			const fresh = await api.get<Conversation[]>(`/api/sessions/${id}/conversations`);
			if (id !== sessionId) return;
			list = fresh;
			error = '';
		} catch (err) {
			if (id === sessionId) error = errorMessage(err);
		}
	}

	$effect(() => {
		list = untrack(() => initial);
		error = '';
		void reload();
	});

	// Keep the list current as Claude writes, without clearing it: rows update where they are.
	let lastSeen: string | null | undefined;
	$effect(() => {
		const at = updated;
		if (lastSeen === undefined) {
			lastSeen = at;
			return;
		}
		if (at === lastSeen) return;
		lastSeen = at;
		const t = setTimeout(() => void reload(), 1500);
		return () => clearTimeout(t);
	});
</script>

{#if error && !list}
	<p class="text-xs text-danger">{error}</p>
{:else if !list}
	<!-- Placeholder rows the height of real ones, so the panel doesn't shift when they arrive. -->
	<ul class="space-y-1" aria-busy="true" aria-label="Loading conversations">
		{#each [0, 1] as i (i)}
			<li class="flex items-start gap-2.5 px-2 py-2">
				<LoaderCircle class="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
				<div class="min-w-0 flex-1 space-y-1.5 py-0.5">
					<div class="h-3 w-3/4 rounded bg-muted"></div>
					<div class="h-2.5 w-1/2 rounded bg-muted/70"></div>
				</div>
			</li>
		{/each}
	</ul>
{:else if !list.length}
	<p class="text-xs text-muted-foreground">No saved conversations yet.</p>
{:else}
	<ul class="space-y-1">
		{#each list as c (c.id)}
			<li class="group flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/60">
				<History class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-[0.8125rem] font-medium">{label(c)}</p>
					<p class="truncate text-[0.6875rem] text-muted-foreground">
						{ago(c.updatedAt)} · {plural(c.messages, 'message')} · {bytes(c.bytes)}{#if c.id === current} · <span class="text-primary">newest</span>{/if}
					</p>
				</div>
				<button class="btn btn-ghost btn-sm opacity-70 group-hover:opacity-100" title="Resume this conversation" onclick={() => onresume(c)}><RotateCcw />Resume</button>
			</li>
		{/each}
	</ul>
{/if}
