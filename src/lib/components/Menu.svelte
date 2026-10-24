<script lang="ts" module>
	import type { Component } from 'svelte';

	export type MenuItem = { label: string; hint?: string; icon?: Component; danger?: boolean; disabled?: boolean; onclick: () => void } | 'separator';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { items, trigger, align = 'right' }: { items: MenuItem[]; trigger: Snippet<[{ toggle: () => void; open: boolean }]>; align?: 'left' | 'right' } = $props();

	let open = $state(false);
	let root: HTMLDivElement;

	function onwindowclick(e: MouseEvent) {
		if (open && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onclick={onwindowclick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="relative" bind:this={root}>
	{@render trigger({ toggle: () => (open = !open), open })}
	{#if open}
		<div class="absolute top-full z-30 mt-1.5 min-w-56 rounded-xl border border-border bg-card p-1 shadow-surface-lg {align === 'right' ? 'right-0' : 'left-0'}" role="menu">
			{#each items as item, i (i)}
				{#if item === 'separator'}
					<div class="my-1 h-px bg-border"></div>
				{:else}
					<button
						role="menuitem"
						class="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] disabled:opacity-50 {item.danger ? 'text-danger hover:bg-danger/10' : 'hover:bg-accent'}"
						disabled={item.disabled}
						onclick={() => {
							open = false;
							item.onclick();
						}}
					>
						{#if item.icon}<item.icon class="mt-0.5 size-4 shrink-0 {item.danger ? '' : 'text-muted-foreground'}" />{/if}
						<span class="min-w-0">
							<span class="block font-medium">{item.label}</span>
							{#if item.hint}<span class="block text-xs text-muted-foreground">{item.hint}</span>{/if}
						</span>
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
