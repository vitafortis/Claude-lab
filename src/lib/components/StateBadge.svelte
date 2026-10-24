<script lang="ts">
	import StateDot from './StateDot.svelte';
	import { STATE_META, type DisplayState } from '#lib/session-state.ts';
	let { state }: { state: DisplayState } = $props();
</script>

<span class="badge {STATE_META[state].badge}"><StateDot {state} class="!size-1.5 [&>span]:!size-1.5" />{STATE_META[state].label}</span>
