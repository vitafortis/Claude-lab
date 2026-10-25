<script lang="ts">
	import { AGENT_LABEL } from '#lib/providers.ts';
	import { modelGroups } from '#lib/models.ts';
	import type { AccountKind, Agent } from '#lib/types.ts';

	/**
	 * Picks a model by name and version. Claude gets a list (the newest of each line, and
	 * exact versions where the account takes Anthropic's IDs) plus "Other" for any ID;
	 * Codex and Gemini take their vendors' model names as typed.
	 */
	let {
		value = $bindable(''),
		agent,
		kind,
		id,
		class: cls = '',
		onchange
	}: {
		value?: string;
		agent: Agent;
		kind?: AccountKind | null;
		id?: string;
		class?: string;
		/** After a pick (or a typed ID is committed). */
		onchange?: (value: string) => void;
	} = $props();

	const OTHER = '\u0000other';
	const groups = $derived(modelGroups(agent, kind));
	const listed = $derived(!value || groups.some((g) => g.options.some((o) => o.value === value)));
	let typing = $state(false);

	function pick(v: string) {
		if (v === OTHER) {
			typing = true;
			return;
		}
		typing = false;
		value = v;
		onchange?.(v);
	}
</script>

{#if !groups.length}
	<input {id} class="input font-mono text-xs {cls}" placeholder="{AGENT_LABEL[agent]}'s default" spellcheck="false" bind:value onchange={() => onchange?.(value)} />
{:else}
	<select {id} class="input {cls}" value={typing ? OTHER : value} onchange={(e) => pick(e.currentTarget.value)}>
		<option value="">Default (Claude Code's choice)</option>
		{#each groups as g (g.label)}
			<optgroup label={g.label}>
				{#each g.options as o (o.value)}<option value={o.value}>{o.label}{o.hint ? ` · ${o.hint}` : ''}</option>{/each}
			</optgroup>
		{/each}
		{#if !listed}<option value={value}>{value}</option>{/if}
		<option value={OTHER}>Other model ID…</option>
	</select>
	{#if typing}
		<!-- svelte-ignore a11y_autofocus -->
		<input class="input mt-2 font-mono text-xs {cls}" placeholder="claude-opus-4-8, or your provider's model ID" spellcheck="false" autofocus bind:value onchange={() => onchange?.(value)} />
	{/if}
{/if}
