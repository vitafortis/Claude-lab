<script lang="ts">
	import { STATE_META, type DisplayState } from '#lib/session-state.ts';
	let { state, class: cls = '' }: { state: DisplayState; class?: string } = $props();
	const meta = $derived(STATE_META[state]);
</script>

<span class="relative inline-flex size-2 shrink-0 {cls}" title={meta.label}>
	{#if meta.pulse}<span class="absolute inset-0 animate-ping rounded-full opacity-60 {meta.dot}"></span>{/if}
	<span class="relative size-2 rounded-full {meta.dot}"></span>
</span>
