<script lang="ts">
	import { Copy, ExternalLink, Link } from '@lucide/svelte';
	import { copyText } from '#lib/client/clipboard.ts';

	/** Links found on the terminal screen, so long ones can be opened or copied with a tap. */
	let { links, code = null }: { links: string[]; code?: string | null } = $props();

	function label(url: string) {
		try {
			const u = new URL(url);
			const path = u.pathname === '/' ? '' : u.pathname;
			return `${u.host}${path.length > 28 ? `${path.slice(0, 27)}…` : path}`;
		} catch {
			return url;
		}
	}
</script>

{#if links.length || code}
	<div class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-term-edge px-2 py-1.5" style="background: var(--term-chrome)">
		<Link class="size-3.5 shrink-0 text-[#7d8594]" aria-label="Links on screen" />
		{#if code}
			<button
				type="button"
				class="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-2 font-mono text-xs font-semibold tracking-wider text-[#e6e8ee] hover:bg-primary/25"
				title="Copy the code"
				onclick={() => copyText(code!, `Copied ${code}`)}><Copy class="size-3.5" />{code}</button
			>
		{/if}
		{#each [...links].reverse() as url (url)}
			<span class="flex h-7 max-w-[22rem] shrink-0 items-center overflow-hidden rounded-md border border-term-edge text-xs text-[#d5d9e2]">
				<a class="flex h-full min-w-0 items-center gap-1.5 px-2 hover:bg-white/5" href={url} target="_blank" rel="noopener" title={url}
					><ExternalLink class="size-3.5 shrink-0" /><span class="truncate">{label(url)}</span></a
				>
				<button type="button" class="grid h-full w-7 shrink-0 place-items-center border-l border-term-edge hover:bg-white/5" title="Copy the link" onclick={() => copyText(url, 'Copied the link')}
					><Copy class="size-3.5" /></button
				>
			</span>
		{/each}
	</div>
{/if}
