<script lang="ts">
	let { size = 28 }: { size?: number } = $props();
	// Gradient ids must be unique per instance; the logo appears more than once on some pages.
	const id = $props.id();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
	<defs>
		<linearGradient id="{id}-fill" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="oklch(72% 0.14 255)" />
			<stop offset="1" stop-color="oklch(46% 0.2 255)" />
		</linearGradient>
		<linearGradient id="{id}-sheen" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#fff" stop-opacity="0.22" />
			<stop offset="0.5" stop-color="#fff" stop-opacity="0" />
		</linearGradient>
	</defs>
	<rect width="32" height="32" rx="9" fill="url(#{id}-fill)" />
	<rect width="32" height="32" rx="9" fill="url(#{id}-sheen)" />
	<!-- A prompt and cursor, with a spark: Claude at the terminal. -->
	<path d="M8 11.5 13.5 16 8 20.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
	<path d="M16 21.5h7.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.7" />
	<path d="M23 6.5c.35 1.95 1.05 2.65 3 3-1.95.35-2.65 1.05-3 3-.35-1.95-1.05-2.65-3-3 1.95-.35 2.65-1.05 3-3Z" fill="#fff" />
</svg>
