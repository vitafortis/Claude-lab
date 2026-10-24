<script lang="ts">
	import { History, LoaderCircle, RotateCcw } from '@lucide/svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago, bytes, plural } from '#lib/client/format.ts';
	import type { Conversation } from '#lib/types.ts';

	let {
		sessionId,
		sessionName,
		current = null,
		onresume
	}: { sessionId: string; sessionName: string; current?: string | null; onresume: (c: Conversation) => void } = $props();

	// Conversations started with --name carry the session's name as their title; the first prompt says more.
	const label = (c: Conversation) => (c.title && c.title !== sessionName ? c.title : (c.firstPrompt ?? c.title ?? 'Untitled'));

	let list = $state<Conversation[] | null>(null);
	let error = $state('');

	export async function reload() {
		try {
			list = await api.get<Conversation[]>(`/api/sessions/${sessionId}/conversations`);
			error = '';
		} catch (err) {
			error = errorMessage(err);
		}
	}

	$effect(() => {
		void sessionId;
		list = null;
		void reload();
	});
</script>

{#if error}
	<p class="text-xs text-danger">{error}</p>
{:else if !list}
	<p class="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle class="size-3.5 animate-spin" />Loading…</p>
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
