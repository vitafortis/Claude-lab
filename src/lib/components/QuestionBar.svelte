<script lang="ts">
	import { MessageCircleQuestion } from '@lucide/svelte';
	import type { Question } from '#lib/pane.ts';

	/**
	 * The agent's menu (a permission prompt, a question, a picker) as buttons. Picking one
	 * presses its number, which is how the agent's menus take an answer.
	 */
	let {
		question,
		agentName,
		onanswer,
		oncancel,
		card = false
	}: {
		question: Question;
		agentName: string;
		onanswer: (n: number) => void;
		oncancel: () => void;
		/** The overview card's version: on the page's surface, not the terminal's. */
		card?: boolean;
	} = $props();
</script>

{#if card}
	<div class="mx-4 mb-3 space-y-2">
		<p class="flex items-center gap-1.5 text-xs font-medium"><MessageCircleQuestion class="size-3.5 text-warning" />{question.title || `${agentName} is asking`}</p>
		<div class="flex flex-wrap gap-1.5">
			{#each question.options as o (o.n)}
				<button class="btn btn-secondary btn-sm h-auto max-w-full min-h-8 py-1 text-left whitespace-normal" title={o.detail || o.label} onclick={() => onanswer(o.n)}>
					<span class="font-mono text-muted-foreground">{o.n}</span>{o.label}
				</button>
			{/each}
			<button class="btn btn-ghost btn-sm" title="Escape: dismiss without picking" onclick={oncancel}>Esc</button>
		</div>
	</div>
{:else}
	<div class="shrink-0 space-y-2 border-b border-term-edge px-3 py-2.5 text-[#e6e8ee]" style="background: var(--term-chrome)" role="group" aria-label="{agentName} is asking">
		<p class="flex items-center gap-2 text-[0.8125rem] font-medium">
			<MessageCircleQuestion class="size-4 shrink-0 text-warning" />
			<span class="min-w-0 flex-1 truncate">{question.title || `${agentName} is asking`}</span>
			<span class="text-[0.6875rem] font-normal text-[#8b93a3] max-sm:hidden">Click an option or press its number</span>
		</p>
		<div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
			{#each question.options as o (o.n)}
				<button
					class="flex max-w-full min-h-8 items-center gap-2 rounded-md border px-2.5 py-1 text-left text-[0.8125rem] transition-colors hover:bg-white/10 {o.selected ? 'border-primary/60 bg-primary/15' : 'border-term-edge bg-white/[0.03]'}"
					title={o.detail || o.label}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => onanswer(o.n)}
				>
					<kbd class="font-mono text-[0.6875rem] text-[#8b93a3]">{o.n}</kbd><span class="min-w-0">{o.label}</span>
				</button>
			{/each}
			<button class="min-h-8 rounded-md border border-term-edge px-2.5 text-[0.8125rem] text-[#aab2c0] hover:bg-white/10" title="Escape: dismiss without picking" onpointerdown={(e) => e.preventDefault()} onclick={oncancel}>Esc</button>
		</div>
	</div>
{/if}
