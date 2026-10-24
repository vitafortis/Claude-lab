<script lang="ts">
	import { AGENT_LABEL } from '#lib/providers.ts';
	import type { Agent } from '#lib/types.ts';

	let { agent, short = false }: { agent: Agent; short?: boolean } = $props();

	// One hue per agent, borrowed from the syntax palette so both themes are covered.
	const TONE: Record<Agent, string> = {
		claude: 'var(--syntax-number)',
		codex: 'var(--syntax-string)',
		gemini: 'var(--syntax-type)'
	};
</script>

<span class="badge" style="color: {TONE[agent]}; border-color: color-mix(in oklch, {TONE[agent]} 35%, transparent)" title={AGENT_LABEL[agent]}>{short ? AGENT_LABEL[agent].replace(/ (Code|CLI)$/, '') : AGENT_LABEL[agent]}</span>
