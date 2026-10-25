<script lang="ts">
	import { BRANDS, type Brand } from '#lib/brands.ts';

	let { brand, class: cls = 'size-4', title }: { brand: Brand; class?: string; title?: string } = $props();

	// Unique per copy, and the same in the server render and the browser.
	const uid = $props.id();

	// The markup is our own bundled SVG. Sizes come from the class; gradient ids get a suffix
	// per copy, since Chrome drops a gradient whose first definition sits in a hidden element.
	const svg = $derived(
		BRANDS[brand]
			.replace(/\s(width|height|style)="[^"]*"/g, '')
			.replace(/<title>[^<]*<\/title>/, title ? `<title>${title}</title>` : '')
			.replace(/id="([^"]+)"/g, `id="$1-${uid}"`)
			.replace(/url\(#([^)]+)\)/g, `url(#$1-${uid})`)
			.replace('<svg', `<svg class="${cls}" aria-hidden="${title ? 'false' : 'true'}" role="img" focusable="false"`)
	);
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html svg}
