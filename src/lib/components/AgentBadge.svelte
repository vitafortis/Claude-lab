<script lang="ts">
	import BrandIcon from './BrandIcon.svelte';
	import { AGENT_BRAND } from '#lib/brands.ts';
	import { AGENT_LABEL } from '#lib/providers.ts';
	import type { Agent } from '#lib/types.ts';

	let { agent, short = false }: { agent: Agent; short?: boolean } = $props();
</script>

<span class="badge text-foreground/80" title={AGENT_LABEL[agent]}>
	<BrandIcon brand={AGENT_BRAND[agent]} class="size-3" />{short ? AGENT_LABEL[agent].replace(/ (Code|CLI)$/, '') : AGENT_LABEL[agent]}
</span>
