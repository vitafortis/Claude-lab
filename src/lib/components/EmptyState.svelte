<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	/** What an empty list shows everywhere: an icon, one line on why it's empty, and the one thing to do. */
	let { icon: StateIcon, title, body, action }: { icon?: Component<{ class?: string }>; title: string; body?: string; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center gap-2 px-6 py-8 text-center">
	{#if StateIcon}<span class="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"><StateIcon class="size-4" /></span>{/if}
	<p class="text-[0.8125rem] font-medium">{title}</p>
	{#if body}<p class="max-w-sm text-xs text-muted-foreground">{body}</p>{/if}
	{#if action}<div class="mt-1">{@render action()}</div>{/if}
</div>
