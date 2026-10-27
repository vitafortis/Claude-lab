<script lang="ts">
	import { onMount, type Component, type Snippet } from 'svelte';
	import { ChevronRight } from '@lucide/svelte';

	/** A section of the session panel that folds away; this browser remembers which are folded. */
	let {
		id,
		title,
		icon: SectionIcon,
		action,
		children
	}: { id: string; title: string; icon?: Component<{ class?: string }>; action?: Snippet; children: Snippet } = $props();

	const key = $derived(`orb.panel.${id}`);
	let open = $state(true);
	onMount(() => {
		try {
			open = localStorage.getItem(key) !== '0';
		} catch {}
	});
	function toggle() {
		open = !open;
		try {
			localStorage.setItem(key, open ? '1' : '0');
		} catch {}
	}
</script>

<section class="border-b border-border">
	<div class="flex min-h-11 items-center gap-1 px-4">
		<button
			type="button"
			class="-ml-1 flex flex-1 items-center gap-1.5 self-stretch rounded px-1 text-left text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase hover:text-foreground"
			aria-expanded={open}
			onclick={toggle}
		>
			<ChevronRight class="size-3.5 shrink-0 transition-transform {open ? 'rotate-90' : ''}" />
			{#if SectionIcon}<SectionIcon class="size-3.5 shrink-0" />{/if}{title}
		</button>
		{@render action?.()}
	</div>
	{#if open}<div class="px-4 pb-4">{@render children()}</div>{/if}
</section>
