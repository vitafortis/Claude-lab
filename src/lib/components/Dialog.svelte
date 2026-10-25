<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	let {
		open = $bindable(false),
		title,
		description,
		width = 'max-w-lg',
		children,
		footer
	}: {
		open: boolean;
		title: string;
		description?: string;
		width?: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(e) => e.target === dialog && (open = false)}
	class="m-auto w-[calc(100%-2rem)] {width} max-h-[calc(100dvh-2rem)] flex-col rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-surface-lg backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:animate-[pop_.16s_ease-out] max-sm:mb-0 max-sm:max-h-[94dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
>
	<!-- On phones the dialog is a sheet from the bottom: the full width, actions always in reach. -->
	{#if open}
		<div class="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 max-sm:px-4 max-sm:py-3">
			<div>
				<h2 class="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
				{#if description}<p class="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</p>{/if}
			</div>
			<button class="btn btn-ghost btn-icon btn-sm -mr-1" onclick={() => (open = false)} aria-label="Close"><X /></button>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 max-sm:px-4">
			{@render children()}
		</div>
		{#if footer}
			<div class="flex shrink-0 items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-surface px-5 py-3 max-sm:rounded-none max-sm:px-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
				{@render footer()}
			</div>
		{/if}
	{/if}
</dialog>

<style>
	@keyframes -global-pop {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.98);
		}
	}
</style>
